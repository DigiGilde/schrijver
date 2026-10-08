import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { parsePage } from '$lib/content/frontmatter';
import { buildForm, newPagePath } from '$lib/content/schema-form';
import { sameRepo } from '$lib/forge/repo';
import { getRepoVisibility } from '$lib/server/repo-visibility';
import { getConfigStore, getForge } from '$lib/server/services';

const decoder = new TextDecoder();

export const load: PageServerLoad = async ({ params, url }) => {
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

	if (url.searchParams.get('nieuw') === '1') {
		const schema = store.schema(site.id);
		const soort = url.searchParams.get('soort');
		const folder = url.searchParams.get('map') ?? '';
		const title = url.searchParams.get('titel') ?? '';
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
		const config = schema['nieuwe-pagina'];
		const sjabloon =
			('soorten' in config
				? config.soorten.find((s) => s.naam === soort)?.sjabloon
				: config.sjabloon) ?? (schema.titel === 'uit-h1' ? '# {titel}\n\n' : '');
		const frontmatter: Record<string, unknown> = schema.titel.startsWith('veld:')
			? { [schema.titel.slice('veld:'.length)]: title }
			: {};
		return {
			site: {
				id: site.id,
				naam: site.naam,
				concepten: site.concepten,
				afbeeldingen: site.content.afbeeldingen != null
			},
			path: pad,
			repoPath,
			sha: null as string | null,
			branch: null as string | null,
			prNumber: null as number | null,
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
	const wanted = url.searchParams.get('branch');
	if (wanted) {
		const n = Number(url.searchParams.get('pr'));
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
	}
	const file = await forge.readFile(site.repo, ref, repoPath);
	if (!file) error(404, 'Pagina niet gevonden');

	const text = decoder.decode(file.content);
	const encode = (path: string) => path.split('/').map(encodeURIComponent).join('/');
	const githubUrl = `https://github.com/${site.repo}/blob/${encode(site.standaardbranch)}/${encode(repoPath)}`;
	const base = {
		site: {
			id: site.id,
			naam: site.naam,
			concepten: site.concepten,
			afbeeldingen: site.content.afbeeldingen != null
		},
		path: pad,
		repoPath,
		sha: file.sha as string | null,
		branch,
		prNumber,
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
