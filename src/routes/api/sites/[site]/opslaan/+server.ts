import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { isEditorial } from '$lib/auth/editorial';
import { identityFor } from '$lib/auth/identity';
import { save } from '$lib/forge/save';
import { log } from '$lib/log';
import { getConfigStore, getForge } from '$lib/server/services';

const BodySchema = z.object({
	path: z.string().max(500),
	body: z.string().max(2_000_000),
	frontmatter: z.record(z.string(), z.unknown()),
	changedKeys: z.array(z.string()),
	baseSha: z.string().nullable(),
	branch: z.string().max(300).nullable(),
	prNumber: z.number().int().positive().nullable(),
	images: z.array(z.object({ path: z.string().max(500), base64: z.string() })).max(50),
	newPage: z
		.object({ soort: z.string().nullable(), folder: z.string(), title: z.string().max(300) })
		.optional()
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
	} catch {
		return json(message('Ongeldig verzoek'), { status: 400 });
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
		identityFor(user.prefs, user.session),
		parsed,
		{
			isEditorial: () =>
				isEditorial(
					site,
					{ email: session.email, emailVerified: session.emailVerified, githubLogin: prefs.githubLogin },
					forge
				)
		}
	);
	if (result.ok) {
		log.info('save.ok', { site: site.id, pr: result.prNumber, branch: result.branch });
		return json(result);
	}
	if ('conflict' in result) {
		log.info('save.conflict', { site: site.id });
		return json(result, { status: 409 });
	}
	const status = result.status ?? 500;
	log.warn('save.failed', { site: site.id, status });
	const { status: _status, ...body } = result;
	return json(body, { status });
};
