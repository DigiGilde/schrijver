import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getRepoVisibility } from '$lib/server/repo-visibility';
import { configRepoName, getConfigStore } from '$lib/server/services';
import { siteHeader } from '$lib/server/site-tabs';

const KINDS = ['anoniem', 'gekoppeld', 'op-naam'] as const;

const configRepo = () => {
	try {
		return configRepoName();
	} catch {
		return null;
	}
};

export const load: PageServerLoad = async ({ params }) => {
	const site = getConfigStore().site(params.site);
	if (!site) error(404, 'Site niet gevonden');

	const branch = site.standaardbranch;
	return {
		site: siteHeader(site),
		redactie: site.review.redactie,
		mergenVanuitSchrijver: site.review['mergen-vanuit-schrijver'],
		// Anoniem is always possible: a choice the site does not allow falls back towards it.
		ondertekenen: KINDS.filter((k) => k === 'anoniem' || site.identiteit.toegestaan.includes(k)),
		conceptenOpenbaar: site.concepten === 'openbaar' && (await getRepoVisibility(site.repo)),
		voorbeeld: site.preview.soort,
		repo: site.repo,
		branch,
		repoUrl: `https://github.com/${site.repo}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`,
		configuratie: configRepo()
	};
};
