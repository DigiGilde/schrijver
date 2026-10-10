import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { siteSettings, teamStore } from '$lib/auth/team-store';
import { getRepoVisibility } from '$lib/server/repo-visibility';
import { configRepoName, getConfigStore } from '$lib/server/services';
import { siteHeader } from '$lib/server/site-tabs';

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

	const settings = await siteSettings(site);
	const members = await teamStore().members(site.id);
	const branch = site.standaardbranch;
	return {
		site: siteHeader(settings),
		redactie: members.flatMap((m) => (m.email ? [m.email] : [])),
		mergenVanuitSchrijver: settings.mergenVanuitSchrijver,
		// Anoniem is always possible: a choice the site does not allow falls back towards it.
		ondertekenen: settings.identiteitToegestaan,
		conceptenOpenbaar: site.concepten === 'openbaar' && (await getRepoVisibility(site.repo)),
		voorbeeld: site.preview.soort,
		repo: site.repo,
		branch,
		repoUrl: `https://github.com/${site.repo}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`,
		configuratie: configRepo()
	};
};
