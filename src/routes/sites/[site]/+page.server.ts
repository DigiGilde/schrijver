import { error } from '@sveltejs/kit';
import picomatch from 'picomatch';
import type { PageServerLoad } from './$types';
import { identitiesFor } from '$lib/auth/identity';
import { parsePage } from '$lib/content/frontmatter';
import { titleOf } from '$lib/content/schema-form';
import { toProposal, type Proposal } from '$lib/forge/proposals';
import { errorFields, log } from '$lib/log';
import { getConfigStore, getForge } from '$lib/server/services';

const decoder = new TextDecoder();

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) error(404, 'Site niet gevonden');
	const forge = getForge();

	const root = site.content.pad.replace(/\/+$/, '');
	const prefix = root === '' ? '' : root + '/';
	const matches = picomatch(site.content.patroon);
	const excluded = picomatch(site.content.uitsluiten ?? []);
	const entries = await forge.readTree(site.repo, site.standaardbranch, root);
	const files = entries
		.map((e) => e.path.slice(prefix.length))
		.filter((p) => matches(p) && !(site.content.uitsluiten?.length && excluded(p)))
		.sort();

	const folders = new Set<string>();
	for (const file of files) {
		const parts = file.split('/').slice(0, -1);
		for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
	}

	const map = (url.searchParams.get('map') ?? '').replace(/^\/+|\/+$/g, '');
	if (map && !folders.has(map)) error(404, 'Map niet gevonden');
	const inFolder = files.filter(
		(f) => f.slice(0, f.lastIndexOf('/') + 1) === (map ? map + '/' : '')
	);

	const schema = store.schema(site.id);
	const pages = await Promise.all(
		inFolder.map(async (path) => {
			const name = path.slice(path.lastIndexOf('/') + 1);
			let title = '';
			try {
				const file = await forge.readFile(site.repo, site.standaardbranch, prefix + path);
				if (file) {
					const parsed = parsePage(decoder.decode(file.content));
					if (parsed.ok) title = titleOf(schema, parsed.frontmatter, parsed.body);
				}
			} catch (err) {
				log.warn('tree.title_failed', { site: site.id, ...errorFields(err) });
			}
			return { path, name, title: title || name };
		})
	);

	const { session, prefs } = locals.user!;
	const mine = identitiesFor(prefs, session);
	let proposals: Proposal[] = [];
	let proposalsError = false;
	try {
		const prs = await forge.listPrs(site.repo, 'open');
		proposals = await Promise.all(
			prs.map(async (pr) => toProposal(pr, await forge.prFiles(site.repo, pr.number), site, mine))
		);
		proposals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	} catch (err) {
		log.warn('proposals.list_failed', { site: site.id, ...errorFields(err) });
		proposalsError = true;
	}

	return {
		site: { id: site.id, naam: site.naam },
		map,
		folders: [...folders].sort(),
		pages,
		proposals,
		proposalsError,
		tab: url.searchParams.get('tab') === 'alle' ? ('alle' as const) : ('mijn' as const)
	};
};
