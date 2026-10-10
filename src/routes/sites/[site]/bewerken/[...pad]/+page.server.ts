import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { siteSettings } from '$lib/auth/team-store';
import { parsePage } from '$lib/content/frontmatter';
import { buildForm, newPagePath } from '$lib/content/schema-form';
import { statusOf } from '$lib/forge/proposals';
import { sameRepo } from '$lib/forge/repo';
import type { Status } from '$lib/forge/status';
import { getRepoVisibility } from '$lib/server/repo-visibility';
import { getConfigStore, getForge } from '$lib/server/services';
import { startFrontmatter, templateFor } from '../../nieuw/new-page';

const decoder = new TextDecoder();

export const load: PageServerLoad = async ({ params, url, untrack }) => {
	// Untracked: within the editor only the first save changes the query, and the session goes on
	// without loading the page again.
	const query = untrack(() => new URLSearchParams(url.search));
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) error(404, 'Site niet gevonden');

	const pad = params.pad;
	if (!pad || pad.startsWith('/') || pad.split('/').some((part) => part === '..' || part === '')) {
		error(400, 'Ongeldig pad');
	}

	const root = site.content.pad.replace(/\/+$/, '');
	const repoPath = root === '' ? pad : `${root}/${pad}`;
	const forge = getForge();
	const { naam } = await siteSettings(site);

	if (query.get('nieuw') === '1') {
		const schema = store.schema(site.id);
		const soort = query.get('soort');
		const folder = query.get('map') ?? '';
		const title = query.get('titel') ?? '';
		let expected: string;
		try {
			expected = newPagePath(schema, soort, folder, title, new Date());
		} catch {
			error(400, 'Ongeldige nieuwe pagina');
		}
		if (expected !== pad) error(400, 'Ongeldige nieuwe pagina');
		if (await forge.readFile(site.repo, site.standaardbranch, repoPath)) {
			error(409, 'Deze pagina bestaat al');
		}
		const sjabloon = templateFor(schema, soort);
		const frontmatter = startFrontmatter(schema, title);
		return {
			site: {
				id: site.id,
				naam,
				concepten: site.concepten,
				afbeeldingen: site.content.afbeeldingen != null,
				content: { pad: site.content.pad, afbeeldingen: site.content.afbeeldingen }
			},
			path: pad,
			repoPath,
			titel: schema.titel,
			sha: null as string | null,
			branch: null as string | null,
			prNumber: null as number | null,
			voorstel: null as Status | null,
			nieuw: { soort, folder, title },
			isPublic: await getRepoVisibility(site.repo),
			loadedAt: Date.now(),
			readOnly: null,
			body: sjabloon.replaceAll('{titel}', title),
			frontmatter,
			rawFrontmatter: null as string | null,
			newlineAtEnd: true,
			form: buildForm(schema, frontmatter, repoPath)
		};
	}

	let ref = site.standaardbranch;
	let branch: string | null = null;
	let prNumber: number | null = null;
	let voorstel: Status | null = null;
	const wanted = query.get('branch');
	if (wanted) {
		const n = Number(query.get('pr'));
		if (!wanted.startsWith(`schrijver/${site.id}/`) || !Number.isInteger(n) || n <= 0) {
			error(400, 'Ongeldig voorstel');
		}
		const pr = await forge.getPr(site.repo, n).catch(() => null);
		if (
			!pr ||
			pr.headRef !== wanted ||
			!sameRepo(pr.headRepo, site.repo) ||
			pr.baseRef !== site.standaardbranch ||
			pr.state !== 'open'
		)
			error(404, 'Voorstel niet gevonden');
		ref = wanted;
		branch = wanted;
		prNumber = n;
		voorstel = statusOf(pr);
	}
	const file = await forge.readFile(site.repo, ref, repoPath);
	if (!file) error(404, 'Pagina niet gevonden');

	const text = decoder.decode(file.content);
	const encode = (path: string) => path.split('/').map(encodeURIComponent).join('/');
	const githubUrl = `https://github.com/${site.repo}/blob/${encode(site.standaardbranch)}/${encode(repoPath)}`;
	const base = {
		site: {
			id: site.id,
			naam,
			concepten: site.concepten,
			afbeeldingen: site.content.afbeeldingen != null,
			content: { pad: site.content.pad, afbeeldingen: site.content.afbeeldingen }
		},
		path: pad,
		repoPath,
		titel: store.schema(site.id).titel,
		sha: file.sha as string | null,
		branch,
		prNumber,
		voorstel,
		nieuw: null as { soort: string | null; folder: string; title: string } | null,
		isPublic: await getRepoVisibility(site.repo),
		loadedAt: Date.now()
	};

	const page = parsePage(text);
	if (!page.ok) {
		return {
			...base,
			readOnly: { reason: page.reason, message: page.message, githubUrl },
			body: text,
			frontmatter: {} as Record<string, unknown>,
			rawFrontmatter: null as string | null,
			newlineAtEnd: text.endsWith('\n'),
			form: []
		};
	}

	return {
		...base,
		readOnly: null,
		body: page.body,
		frontmatter: page.frontmatter,
		rawFrontmatter: page.rawFrontmatter,
		newlineAtEnd: page.newlineAtEnd,
		form: buildForm(store.schema(site.id), page.frontmatter, repoPath)
	};
};
