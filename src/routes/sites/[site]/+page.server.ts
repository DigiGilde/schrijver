import { error } from '@sveltejs/kit';
import picomatch from 'picomatch';
import type { PageServerLoad } from './$types';
import { isEditorial } from '$lib/auth/editorial';
import { identitiesFor } from '$lib/auth/identity';
import { parsePage } from '$lib/content/frontmatter';
import { titleOf } from '$lib/content/schema-form';
import { toProposal, type Proposal } from '$lib/forge/proposals';
import { ForgeError } from '$lib/forge/types';
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
	let entries: Awaited<ReturnType<typeof forge.readTree>>;
	try {
		entries = await forge.readTree(site.repo, site.standaardbranch, root);
	} catch (err) {
		if (err instanceof ForgeError && err.status === 404) {
			log.warn('tree.not_found', { site: site.id, ...errorFields(err) });
			error(
				404,
				'Deze site is niet bereikbaar: is de Schrijver-app op de repository geïnstalleerd?'
			);
		}
		throw err;
	}
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

	const editorial = await isEditorial(
		site,
		{ email: session.email, emailVerified: session.emailVerified, githubLogin: prefs.githubLogin },
		forge
	);
	const waiting = (p: Proposal) =>
		p.status === 'ingestuurd' ? 0 : p.status === 'wijzigingen-gevraagd' ? 1 : -1;
	const teBeoordelen = editorial
		? proposals.filter((p) => waiting(p) >= 0).sort((a, b) => waiting(a) - waiting(b))
		: [];

	// The user's own open proposal for a page in this folder, to return to instead of starting anew.
	const continueByPage = new Map<string, string>();
	for (const p of proposals) {
		if (!p.mine) continue;
		for (const link of p.verderBewerken)
			if (!continueByPage.has(link.page)) continueByPage.set(link.page, link.href);
	}

	const tabParam = url.searchParams.get('tab');
	const tab =
		tabParam === 'alle'
			? ('alle' as const)
			: tabParam === 'beoordelen' && editorial
				? ('beoordelen' as const)
				: ('mijn' as const);

	return {
		site: { id: site.id, naam: site.naam },
		map,
		folders: [...folders].sort(),
		pages: pages.map((page) => ({
			...page,
			verderBewerken: continueByPage.get(prefix + page.path) ?? null
		})),
		proposals,
		proposalsError,
		editorial,
		teBeoordelen,
		tab
	};
};
