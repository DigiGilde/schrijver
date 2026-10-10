import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SiteConfig } from '$lib/config/types';
import { MAX_IMAGE_BYTES } from '$lib/content/images';
import { sameRepo } from '$lib/forge/repo';
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

const NUMBER = /^[1-9][0-9]{0,8}$/;

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
	const voorstel = url.searchParams.get('voorstel');
	const asked = url.searchParams.get('ref');
	if (voorstel !== null && (asked !== null || !NUMBER.test(voorstel)))
		return fail(400, 'Ongeldige versie');
	const ref = asked || site.standaardbranch;
	if (voorstel === null && ref !== site.standaardbranch && !ref.startsWith(`schrijver/${site.id}/`))
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

	const forge = getForge();
	let file: Awaited<ReturnType<typeof forge.readFile>>;
	try {
		let at = ref;
		if (voorstel !== null) {
			// A proposal is read at the commit its head points at, and only when that head is a branch of the
			// site's own repository: a commit id from the request could name a fork's commit.
			const pr = await forge.getPr(site.repo, Number(voorstel));
			if (!sameRepo(pr.headRepo, site.repo) || pr.baseRef !== site.standaardbranch)
				return fail(400, 'Ongeldige versie');
			at = pr.headSha || pr.headRef;
		}
		file = await forge.readFile(site.repo, at, pad);
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
			'x-content-type-options': 'nosniff',
			// An SVG opened directly must not run as a document on this origin.
			'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
		}
	});
};
