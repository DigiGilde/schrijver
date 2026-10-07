import { error, fail, redirect } from '@sveltejs/kit';
import picomatch from 'picomatch';
import type { Actions, PageServerLoad } from './$types';
import { slugify } from '$lib/content/slug';
import { newPagePath } from '$lib/content/schema-form';
import { getConfigStore, getForge } from '$lib/server/services';

type Option = { naam: string | null; folders: string[]; fixed: string | null };

export const load: PageServerLoad = async ({ params }) => {
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) error(404, 'Site niet gevonden');
	const config = store.schema(site.id)['nieuwe-pagina'];

	const root = site.content.pad.replace(/\/+$/, '');
	const entries = await getForge().readTree(site.repo, site.standaardbranch, root);
	const existing = new Set<string>();
	for (const e of entries) {
		const parts = e.path.slice(root.length + 1).split('/').slice(0, -1);
		for (let i = 1; i <= parts.length; i++) existing.add(parts.slice(0, i).join('/'));
	}
	const foldersFor = (globs: string[]) => [
		...new Set([
			...globs.filter((g) => !/[*?[\]{}!]/.test(g)),
			...[...existing].filter((f) => globs.some((g) => picomatch(g, { dot: true })(f)))
		])
	].sort();

	const year = String(new Date().getFullYear());
	const options: Option[] =
		'soorten' in config
			? config.soorten.map((s) => ({
					naam: s.naam,
					folders: s.map === undefined ? foldersFor(s.mappen ?? []) : [],
					fixed: s.map === undefined ? null : s.map.replaceAll('{jaar}', year)
				}))
			: [{ naam: null, folders: foldersFor(config.mappen), fixed: null }];

	return { site: { id: site.id, naam: site.naam }, options };
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
		if (!titel) return fail(400, { error: 'Geef de pagina een titel' });
		if (!slugify(titel)) return fail(400, { error: 'Geef een titel met letters of cijfers' });
		let pad: string;
		try {
			pad = newPagePath(store.schema(site.id), soort, map, titel, new Date());
		} catch {
			return fail(400, { error: 'Deze combinatie van soort en map is niet toegestaan' });
		}
		const query = new URLSearchParams({ nieuw: '1', map, titel });
		if (soort) query.set('soort', soort);
		redirect(303, `/sites/${site.id}/bewerken/${pad.split('/').map(encodeURIComponent).join('/')}?${query}`);
	}
};
