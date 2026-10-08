import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SiteConfig } from '$lib/config/types';
import { MAX_IMAGE_BYTES } from '$lib/content/images';
import { hasControlCharacters } from '$lib/forge/save';
import { ForgeError } from '$lib/forge/types';
import { getConfigStore, getForge } from '$lib/server/services';

const TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	svg: 'image/svg+xml'
};

const fail = (status: number, message: string) => json({ message }, { status });

/** The fixed folder before the first placeholder of `afbeeldingen.pad`, or null when there is none. */
function imageBase(site: SiteConfig): string | null {
	const pad = site.content.afbeeldingen?.pad;
	if (!pad) return null;
	const fixed = pad.slice(0, pad.includes('{') ? pad.indexOf('{') : undefined);
	const folder = fixed.slice(0, fixed.lastIndexOf('/') + 1);
	return folder === '' ? null : folder;
}

function contained(site: SiteConfig, p: string): boolean {
	const root = site.content.pad.replace(/\/+$/, '');
	if (root === '' || p.startsWith(`${root}/`)) return true;
	const base = imageBase(site);
	return base !== null && p.startsWith(base);
}

/** Serves an image from the site repository for the editor preview. */
export const GET: RequestHandler = async ({ url, params, locals }) => {
	if (!locals.user) return fail(401, 'Niet ingelogd');
	const site = getConfigStore().site(params.site);
	if (!site) return fail(404, 'Site niet gevonden');

	const pad = url.searchParams.get('pad') ?? '';
	const ref = url.searchParams.get('ref') || site.standaardbranch;
	if (ref !== site.standaardbranch && !ref.startsWith(`schrijver/${site.id}/`))
		return fail(400, 'Ongeldige versie');
	if (
		pad === '' ||
		pad.length > 500 ||
		hasControlCharacters(pad) ||
		pad.startsWith('/') ||
		pad.includes('\\') ||
		pad.split('/').some((part) => part === '..' || part === '.' || part === '') ||
		!contained(site, pad)
	)
		return fail(400, 'Ongeldig pad');
	const type = TYPES[pad.slice(pad.lastIndexOf('.') + 1).toLowerCase()];
	if (!pad.includes('.') || !type) return fail(415, 'Geen afbeelding');

	let file: Awaited<ReturnType<ReturnType<typeof getForge>['readFile']>>;
	try {
		file = await getForge().readFile(site.repo, ref, pad);
	} catch (e) {
		if (e instanceof ForgeError && e.status === 404) return fail(404, 'Afbeelding niet gevonden');
		throw e;
	}
	if (!file) return fail(404, 'Afbeelding niet gevonden');
	if (file.content.length > MAX_IMAGE_BYTES) return fail(413, 'Afbeelding is groter dan 5 MB');

	return new Response(file.content as BodyInit, {
		headers: {
			'content-type': type,
			'cache-control': 'private, max-age=10',
			// An SVG opened directly must not run as a document on this origin.
			'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
		}
	});
};
