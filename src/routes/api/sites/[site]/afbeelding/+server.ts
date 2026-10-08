import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripMetadata } from '$lib/content/fotogegevens';
import {
	ALLOWED_IMAGE_TYPES,
	ImageError,
	MAX_IMAGE_BYTES,
	imagePath,
	isSvgDocument,
	sanitizeSvg,
	validateImage
} from '$lib/content/images';
import { hasControlCharacters } from '$lib/forge/save';
import { ForgeError } from '$lib/forge/types';
import { getConfigStore, getForge } from '$lib/server/services';

const fail = (status: number, message: string) => json({ message }, { status });

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!(locals as { user?: unknown }).user) return fail(401, 'Niet ingelogd');
	if (request.headers.get('X-Requested-With') !== 'Schrijver')
		return fail(403, 'Verzoek geweigerd');

	const site = getConfigStore().site(params.site);
	if (!site) return fail(404, 'Site niet gevonden');

	const declared = Number(request.headers.get('content-length'));
	if (declared > MAX_IMAGE_BYTES + 64 * 1024) return fail(413, 'Afbeelding is groter dan 5 MB');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return fail(400, 'Ongeldig formulier');
	}
	const alt = form.get('alt');
	if (typeof alt !== 'string' || !alt.trim()) return fail(400, 'Alt-tekst is verplicht');
	if (alt.length > 500) return fail(400, 'Alt-tekst is te lang (maximaal 500 tekens)');
	const file = form.get('bestand');
	const pagina = form.get('pagina');
	if (!(file instanceof File)) return fail(400, 'Bestand ontbreekt');
	if (
		typeof pagina !== 'string' ||
		hasControlCharacters(pagina) ||
		pagina.startsWith('/') ||
		pagina.includes('\\') ||
		pagina.split('/').includes('..') ||
		!pagina.startsWith(`${site.content.pad}/`) ||
		!pagina.endsWith('.md')
	) {
		return fail(400, 'Ongeldige pagina');
	}
	if (file.size > MAX_IMAGE_BYTES) return fail(413, 'Afbeelding is groter dan 5 MB');

	let bytes = new Uint8Array(await file.arrayBuffer());
	const checked = validateImage(bytes, file.type);
	if (!checked.ok) return fail(checked.status, checked.message);
	bytes = stripMetadata(bytes, checked.mime);
	if (checked.mime === 'image/svg+xml') {
		const clean = sanitizeSvg(new TextDecoder().decode(bytes));
		if (!isSvgDocument(clean)) {
			return fail(415, 'Dit bestandstype wordt niet ondersteund (png, jpg, webp, svg)');
		}
		bytes = new TextEncoder().encode(clean);
	}
	const ext = ALLOWED_IMAGE_TYPES[checked.mime as keyof typeof ALLOWED_IMAGE_TYPES];
	const dot = file.name.lastIndexOf('.');
	const fileName = `${dot === -1 ? file.name : file.name.slice(0, dot)}.${ext}`;

	const branchRaw = form.get('branch');
	const branch =
		typeof branchRaw === 'string' &&
		branchRaw.startsWith(`schrijver/${site.id}/`) &&
		!hasControlCharacters(branchRaw)
			? branchRaw
			: null;
	const forge = getForge();
	const exists = async (ref: string, repoPath: string) => {
		try {
			return !!(await forge.readFile(site.repo, ref, repoPath));
		} catch (e) {
			if (e instanceof ForgeError && e.status === 404) return false;
			throw e;
		}
	};

	try {
		let { repoPath, markdownRef } = imagePath(site, pagina, fileName);
		// A pasted image is always called image.png; a taken name would only meet save's 409.
		const taken =
			path.posix.basename(repoPath, path.posix.extname(repoPath)) === 'image' ||
			(await exists(site.standaardbranch, repoPath)) ||
			(branch !== null && (await exists(branch, repoPath)));
		if (taken) {
			const stem = path.posix.basename(repoPath, `.${ext}`);
			({ repoPath, markdownRef } = imagePath(
				site,
				pagina,
				`${stem}-${randomBytes(3).toString('hex')}.${ext}`
			));
		}
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
