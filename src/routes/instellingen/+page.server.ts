import type { Actions, PageServerLoad } from './$types';
import { siteRules, submitPrefs, unlinkGithub } from '$lib/auth/prefs-action';
import { isPlatformAdmin, managedSites, type SiteUser } from '$lib/auth/roles';
import { siteSettings } from '$lib/auth/team-store';
import { getConfigStore, getForge } from '$lib/server/services';
import { siteUser, visibleSites } from '$lib/server/site-access';

/**
 * The sites this user manages and may see, by the name in their settings, those whose files have a
 * problem too.
 */
async function beheer(user: SiteUser) {
	const all = getConfigStore().statuses();
	const visible = await visibleSites(user, all);
	const statuses = all.filter((status) => visible.has(status.site.id));
	const sites = statuses.map((status) => status.site);
	const ids = new Set(await managedSites(sites, user, getForge()));
	return {
		platform: isPlatformAdmin(user.sub),
		sites: await Promise.all(
			statuses
				.filter(({ site }) => ids.has(site.id))
				.map(async ({ site, errors }) => ({
					id: site.id,
					naam: (await siteSettings(site)).naam,
					klopNiet: errors.length > 0
				}))
		)
	};
}

export const load: PageServerLoad = async ({ locals, url }) => ({
	justLinked: url.searchParams.get('gekoppeld') === '1',
	siteVerwijderd: url.searchParams.get('verwijderd') === '1',
	linkFailed: url.searchParams.get('koppelen') === 'mislukt',
	identity: locals.user!.prefs.identity,
	githubLogin: locals.user!.prefs.githubLogin ?? '',
	emailVerified: locals.user!.session.emailVerified,
	sites: await siteRules(siteUser(locals.user!)),
	beheer: await beheer(siteUser(locals.user!)),
	kenmerk: locals.user!.session.sub
});

export const actions: Actions = {
	opslaan: (event) => submitPrefs(event, 'stay'),
	ontkoppel: (event) => unlinkGithub(event)
};
