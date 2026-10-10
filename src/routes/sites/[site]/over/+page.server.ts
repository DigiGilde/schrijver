import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canManageSite } from '$lib/auth/roles';
import { siteSettings, teamStore } from '$lib/auth/team-store';
import { getRepoVisibility } from '$lib/server/repo-visibility';
import { configRepoName, getConfigStore, getForge } from '$lib/server/services';
import { siteHeader } from '$lib/server/site-tabs';

const configRepo = () => {
	try {
		return configRepoName();
	} catch {
		return null;
	}
};

export const load: PageServerLoad = async ({ params, locals }) => {
	const site = getConfigStore().site(params.site);
	if (!site) error(404, 'Site niet gevonden');

	const { session, prefs } = locals.user!;
	const [settings, members, kanBeheren] = await Promise.all([
		siteSettings(site),
		teamStore().members(site.id),
		canManageSite(site, { sub: session.sub, githubLogin: prefs.githubLogin }, getForge())
	]);
	const branch = site.standaardbranch;
	return {
		site: siteHeader(settings),
		// Everyone signed in reads this page: a name and a role, never an address, a sub or an invitation.
		redactie: members.map((m) => ({ naam: m.name, beheerder: m.role === 'beheerder' })),
		kanBeheren,
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
