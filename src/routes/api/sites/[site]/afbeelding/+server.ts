import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ImageError, imagePath, sanitizeSvg, validateImage } from '$lib/content/images';
import { getConfigStore } from '$lib/server/services';

const fail = (status: number, message: string) => json({ message }, { status });

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!(locals as { user?: unknown }).user) return fail(401, 'Niet ingelogd');
	if (request.headers.get('X-Requested-With') !== 'Schrijver') return fail(403, 'Verzoek geweigerd');

	const site = getConfigStore().site(params.site);
	if (!site) return fail(404, 'Site niet gevonden');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return fail(400, 'Ongeldig formulier');
	}
	const alt = form.get('alt');
	if (typeof alt !== 'string' || !alt.trim()) return fail(400, 'Alt-tekst is verplicht');
	const file = form.get('bestand');
	const pagina = form.get('pagina');
	if (!(file instanceof File)) return fail(400, 'Bestand ontbreekt');
	if (typeof pagina !== 'string' || !pagina || pagina.split('/').includes('..')) {
		return fail(400, 'Pagina ontbreekt');
	}

	let bytes = new Uint8Array(await file.arrayBuffer());
	const checked = validateImage(bytes, file.type);
	if (!checked.ok) return fail(checked.status, checked.message);
	if (checked.mime === 'image/svg+xml') {
		bytes = new TextEncoder().encode(sanitizeSvg(new TextDecoder().decode(bytes)));
	}

	try {
		const { repoPath, markdownRef } = imagePath(site, pagina, file.name);
		return json({
			repoPath,
			markdownRef,
			base64: Buffer.from(bytes).toString('base64'),
			mime: checked.mime
		});
	} catch (e) {
		if (e instanceof ImageError) return fail(400, e.message);
		throw e;
	}
};
