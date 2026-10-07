import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { parsePage } from '$lib/content/frontmatter';
import { buildForm } from '$lib/content/schema-form';
import { getRepoVisibility } from '$lib/server/repo-visibility';
import { getConfigStore, getForge } from '$lib/server/services';

const decoder = new TextDecoder();

export const load: PageServerLoad = async ({ params }) => {
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) error(404, 'Site niet gevonden');

	const pad = params.pad;
	if (!pad || pad.startsWith('/') || pad.split('/').some((part) => part === '..' || part === '')) {
		error(400, 'Ongeldig pad');
	}

	const root = site.content.pad.replace(/\/+$/, '');
	const repoPath = root === '' ? pad : `${root}/${pad}`;
	const file = await getForge().readFile(site.repo, site.standaardbranch, repoPath);
	if (!file) error(404, 'Pagina niet gevonden');

	const text = decoder.decode(file.content);
	const githubUrl = `https://github.com/${site.repo}/blob/${site.standaardbranch}/${repoPath}`;
	const base = {
		site: { id: site.id, naam: site.naam, concepten: site.concepten },
		path: pad,
		sha: file.sha,
		isPublic: getRepoVisibility(site.repo),
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
