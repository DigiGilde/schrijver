import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { actorPseudonym } from '$lib/auth/identity';
import { inImageFolder } from '$lib/content/image-refs';
import { imageUsage } from '$lib/forge/image-usage';
import { validPagePath } from '$lib/forge/save';
import { ForgeError } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { getConfigStore, getForge } from '$lib/server/services';

const BodySchema = z.object({
	path: z.string().max(500),
	branch: z.string().max(300).nullable(),
	images: z.array(z.string().max(500)).min(1).max(20)
});

const fail = (status: number, message: string) =>
	json({ ok: false, error: { message } }, { status });

const INVALID = 'Ongeldig verzoek';

/** Only Schrijver's own branches of this site, one segment after the prefix: never another ref. */
function validBranch(siteId: string, branch: string): boolean {
	const prefix = `schrijver/${siteId}/`;
	const name = branch.slice(prefix.length);
	return branch.startsWith(prefix) && /^[a-z0-9][a-z0-9._-]*$/i.test(name) && !name.includes('..');
}

/**
 * For images a save drops from a page: which other pages of the content folder still use each, and
 * which may go. Answers with page paths and titles only, which Schrijver shows anyway.
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) return fail(401, 'Niet ingelogd');
	if (request.headers.get('X-Requested-With') !== 'Schrijver')
		return fail(403, 'Verzoek geweigerd');
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) return fail(404, 'Site niet gevonden');
	const actor = actorPseudonym(locals.user.session);

	let body: z.infer<typeof BodySchema>;
	try {
		body = BodySchema.parse(await request.json());
	} catch {
		return fail(400, INVALID);
	}
	// One answer for every bad path, so it says nothing about which files exist.
	if (
		!validPagePath(site, body.path) ||
		body.path.includes('%') ||
		(body.branch !== null && !validBranch(site.id, body.branch)) ||
		!body.images.every((image) => inImageFolder(site, image))
	) {
		log.warn('image_usage.refused', { site: site.id, actor });
		return fail(400, INVALID);
	}

	try {
		const scan = await imageUsage(
			getForge(),
			site,
			store.schema(site.id),
			body.branch ?? site.standaardbranch,
			body.path,
			body.images
		);
		return json({
			ok: true,
			images: scan.images.map((image) => ({
				path: image.path,
				usedOn: image.usedOn.map((page) => ({ path: page.path, title: page.title })),
				deletable: scan.complete && image.usedOn.length === 0 && !image.excluded
			}))
		});
	} catch (e) {
		if (!(e instanceof ForgeError)) throw e;
		log.warn('image_usage.failed', { site: site.id, actor, ...errorFields(e) });
		return fail(502, 'Niet na te gaan of de afbeelding nog wordt gebruikt');
	}
};
