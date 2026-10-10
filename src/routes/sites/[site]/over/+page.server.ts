import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canManageSite } from '$lib/auth/roles';
import { siteSettings, teamStore } from '$lib/auth/team-store';
import { whoSees } from '$lib/auth/visibility';
import { getConfigStore, getForge } from '$lib/server/services';
import { siteHeader } from '$lib/server/site-tabs';

export const load: PageServerLoad = async ({ params, locals }) => {
	const store = getConfigStore();
	const site = store.site(params.site);
	if (!site) error(404, 'Site niet gevonden');
	const isPublic = store.status(site.id)?.isPublic ?? null;

	const { session, prefs } = locals.user!;
	const [settings, members, kanBeheren] = await Promise.all([
		siteSettings(site),
		teamStore().members(site.id),
		canManageSite(site, { sub: session.sub, githubLogin: prefs.githubLogin }, getForge())
	]);
	const branch = site.standaardbranch;
	const repoUrl = `https://github.com/${site.repo}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`;
	return {
		site: siteHeader(settings),
		// Everyone who sees the site reads this page: a name and a role, never an address, a sub or an
		// invitation.
		redactie: members
			.filter((m) => m.role !== 'bijdrager')
			.map((m) => ({ naam: m.name, beheerder: m.role === 'beheerder' })),
		kanBeheren,
		mergenVanuitSchrijver: settings.mergenVanuitSchrijver,
		// Anoniem is always possible: a choice the site does not allow falls back towards it.
		ondertekenen: settings.identiteitToegestaan,
		zichtbaarheid: whoSees(isPublic, settings.zichtbaarheid),
		repoOpenbaar: isPublic,
		conceptenOpenbaar: site.concepten === 'openbaar' && isPublic !== false,
		voorbeeld: site.preview.soort,
		repo: site.repo,
		repoUrl,
		structuurUrl: `${repoUrl}/.schrijver`
	};
};
