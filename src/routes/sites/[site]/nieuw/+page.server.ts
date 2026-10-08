import { error, fail, redirect } from '@sveltejs/kit';
import picomatch from 'picomatch';
import type { Actions, PageServerLoad } from './$types';
import { slugify } from '$lib/content/slug';
import { newPagePath } from '$lib/content/schema-form';
import { getConfigStore, getForge } from '$lib/server/services';
import { isoDate } from './new-page';

type Option = { naam: string | null; folders: string[]; fixed: string | null };

// The save endpoint takes a new page's title only up to this length.
const TITLE_MAX = 300;

export const load: PageServerLoad = async ({ params }) => {
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) error(404, 'Site niet gevonden');
	const schema = store.schema(site.id);
	const config = schema['nieuwe-pagina'];

	const root = site.content.pad.replace(/\/+$/, '');
	const entries = await getForge().readTree(site.repo, site.standaardbranch, root);
	const existing = new Set<string>();
	for (const e of entries) {
		const parts = e.path
			.slice(root.length + 1)
			.split('/')
			.slice(0, -1);
		for (let i = 1; i <= parts.length; i++) existing.add(parts.slice(0, i).join('/'));
	}
	const foldersFor = (globs: string[]) =>
		[
			...new Set([
				...globs.filter((g) => !/[*?[\]{}!]/.test(g)),
				...[...existing].filter((f) => globs.some((g) => picomatch(g, { dot: true })(f)))
			])
		].sort();

	const now = new Date();
	const year = String(now.getFullYear());
	const options: Option[] =
		'soorten' in config
			? config.soorten.map((s) => ({
					naam: s.naam,
					folders: s.map === undefined ? foldersFor(s.mappen ?? []) : [],
					fixed: s.map === undefined ? null : s.map.replaceAll('{jaar}', year)
				}))
			: [{ naam: null, folders: foldersFor(config.mappen), fixed: null }];

	return { site: { id: site.id, naam: site.naam }, options, schema, today: isoDate(now) };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const store = getConfigStore();
		const site = store.site(params.site);
		if (!site) error(404, 'Site niet gevonden');
		const form = await request.formData();
		const soortRaw = form.get('soort');
		const soort = typeof soortRaw === 'string' && soortRaw !== '' ? soortRaw : null;
		const map = String(form.get('map') ?? '');
		const titel = String(form.get('titel') ?? '').trim();
		if (!titel) return fail(400, { error: 'Geef de pagina een titel', veld: 'titel', titel });
		if (titel.length > TITLE_MAX) {
			return fail(400, {
				error: `De titel is te lang: gebruik hoogstens ${TITLE_MAX} tekens`,
				veld: 'titel',
				titel
			});
		}
		if (!slugify(titel))
			return fail(400, { error: 'Geef een titel met letters of cijfers', veld: 'titel', titel });
		let pad: string;
		try {
			pad = newPagePath(store.schema(site.id), soort, map, titel, new Date());
		} catch {
			return fail(400, {
				error: 'Deze combinatie van soort en map is niet toegestaan',
				veld: null,
				titel
			});
		}
		const root = site.content.pad.replace(/\/+$/, '');
		const repoPath = root === '' ? pad : `${root}/${pad}`;
		if (await getForge().readFile(site.repo, site.standaardbranch, repoPath)) {
			return fail(409, { error: `Er is al een pagina met het bestand ${pad}`, veld: null, titel });
		}
		const query = new URLSearchParams({ nieuw: '1', map, titel });
		if (soort) query.set('soort', soort);
		redirect(
			303,
			`/sites/${site.id}/bewerken/${pad.split('/').map(encodeURIComponent).join('/')}?${query}`
		);
	}
};
