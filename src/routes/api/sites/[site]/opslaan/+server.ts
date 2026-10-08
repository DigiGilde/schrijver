import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { isEditorial } from '$lib/auth/editorial';
import {
	IMAGES_TOO_LARGE,
	MAX_PENDING_IMAGE_BYTES,
	pendingBytes
} from '$lib/client/pending-images';
import { actorPseudonym, identitiesFor, identityFor } from '$lib/auth/identity';
import { save } from '$lib/forge/save';
import { log } from '$lib/log';
import { newProposalLimit } from '$lib/server/security';
import { getConfigStore, getForge } from '$lib/server/services';

const MAX_BODY_CHARS = 500_000;
const BODY_TOO_LONG = 'De tekst is te lang om op te slaan (maximaal 500.000 tekens)';
const FRONTMATTER_TOO_DEEP = 'De gegevens bovenaan de pagina zijn te groot of te diep genest';
const MAX_FRONTMATTER_DEPTH = 8;
const MAX_FRONTMATTER_NODES = 2_000;

/** Bounds nesting and size so YAML serialisation cannot overflow the stack. */
function boundedJson(value: unknown): boolean {
	let nodes = 0;
	const walk = (v: unknown, depth: number): boolean => {
		if (++nodes > MAX_FRONTMATTER_NODES) return false;
		if (v === null || typeof v !== 'object') return true;
		if (depth >= MAX_FRONTMATTER_DEPTH) return false;
		return Object.values(v).every((child) => walk(child, depth + 1));
	};
	return walk(value, 0);
}

const MESSAGES = new Set([BODY_TOO_LONG, FRONTMATTER_TOO_DEEP, IMAGES_TOO_LARGE]);

const BodySchema = z.object({
	path: z.string().max(500),
	body: z.string().max(MAX_BODY_CHARS, { message: BODY_TOO_LONG }),
	frontmatter: z
		.record(z.string(), z.unknown())
		.refine(boundedJson, { message: FRONTMATTER_TOO_DEEP }),
	changedKeys: z.array(z.string()),
	baseSha: z.string().nullable(),
	branch: z.string().max(300).nullable(),
	prNumber: z.number().int().positive().nullable(),
	images: z
		.array(z.object({ path: z.string().max(500), base64: z.string() }))
		.max(50)
		.refine((list) => pendingBytes(list) <= MAX_PENDING_IMAGE_BYTES, {
			message: IMAGES_TOO_LARGE
		}),
	newPage: z
		.object({ soort: z.string().nullable(), folder: z.string(), title: z.string().max(300) })
		.optional(),
	overwrite: z.boolean().optional()
});

const message = (text: string) => ({ ok: false, error: { message: text } });

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const user = (locals as { user?: { session: never; prefs: never } }).user;
	if (!user) return json(message('Niet ingelogd'), { status: 401 });

	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) return json(message('Site niet gevonden'), { status: 404 });

	let parsed: z.infer<typeof BodySchema>;
	try {
		parsed = BodySchema.parse(await request.json());
	} catch (e) {
		const known =
			e instanceof z.ZodError ? e.issues.find((i) => MESSAGES.has(i.message)) : undefined;
		return json(message(known?.message ?? 'Ongeldig verzoek'), {
			status: known?.message === IMAGES_TOO_LARGE ? 413 : 400
		});
	}

	if (parsed.branch === null && !newProposalLimit.take((user.session as { sub: string }).sub)) {
		return json(
			message(
				'Je hebt het afgelopen uur veel nieuwe voorstellen gemaakt; probeer het later opnieuw'
			),
			{
				status: 429
			}
		);
	}

	const forge = getForge();
	const { session, prefs } = user as unknown as {
		session: { email: string; emailVerified: boolean };
		prefs: { githubLogin: string | null };
	};
	const result = await save(
		forge,
		site,
		store.schema(site.id),
		identityFor(user.prefs, user.session, site),
		parsed,
		{
			identities: identitiesFor(user.prefs, user.session),
			isEditorial: () =>
				isEditorial(
					site,
					{
						email: session.email,
						emailVerified: session.emailVerified,
						githubLogin: prefs.githubLogin
					},
					forge
				)
		}
	);
	if (result.ok) {
		log.info('save.ok', {
			site: site.id,
			pr: result.prNumber,
			branch: result.branch,
			actor: actorPseudonym(user.session)
		});
		return json(result);
	}
	if ('conflict' in result) {
		log.info('save.conflict', { site: site.id, actor: actorPseudonym(user.session) });
		return json(result, { status: 409 });
	}
	const status = result.status ?? 500;
	log.warn('save.failed', { site: site.id, status, actor: actorPseudonym(user.session) });
	const { status: _status, ...body } = result;
	return json(body, { status });
};
