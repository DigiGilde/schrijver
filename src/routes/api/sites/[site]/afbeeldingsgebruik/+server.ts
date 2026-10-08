import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { inImageFolder } from '$lib/content/image-refs';
import { imageUsage } from '$lib/forge/image-usage';
import { hasControlCharacters, validPagePath } from '$lib/forge/save';
import { ForgeError } from '$lib/forge/types';
import { getConfigStore, getForge } from '$lib/server/services';

const BodySchema = z.object({
	path: z.string().max(500),
	branch: z.string().max(300).nullable(),
	images: z.array(z.string().max(500)).min(1).max(20)
});

const fail = (status: number, message: string) =>
	json({ ok: false, error: { message } }, { status });

/** For images a save drops from a page: which other pages still use each, and which may go. */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) return fail(401, 'Niet ingelogd');
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) return fail(404, 'Site niet gevonden');

	let body: z.infer<typeof BodySchema>;
	try {
		body = BodySchema.parse(await request.json());
	} catch {
		return fail(400, 'Ongeldig verzoek');
	}
	if (!validPagePath(site, body.path)) return fail(400, 'Ongeldig pad');
	if (
		body.branch !== null &&
		(!body.branch.startsWith(`schrijver/${site.id}/`) || hasControlCharacters(body.branch))
	)
		return fail(400, 'Ongeldige branch');

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
				...image,
				deletable: scan.complete && image.usedOn.length === 0 && inImageFolder(site, image.path)
			}))
		});
	} catch (e) {
		if (e instanceof ForgeError) return fail(e.status, e.message);
		throw e;
	}
};
