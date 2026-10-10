import type { Actions, PageServerLoad } from './$types';
import { siteRules, submitPrefs, unlinkGithub } from '$lib/auth/prefs-action';
import { isPlatformAdmin, managedSites } from '$lib/auth/roles';
import { siteSettings } from '$lib/auth/team-store';
import { getConfigStore, getForge } from '$lib/server/services';

/** The configured sites this user manages, by the name in their settings. */
async function beheer(sub: string, githubLogin: string | null) {
	const sites = getConfigStore().sites();
	const ids = new Set(await managedSites(sites, { sub, githubLogin }, getForge()));
	return {
		platform: isPlatformAdmin(sub),
		sites: await Promise.all(
			sites
				.filter((site) => ids.has(site.id))
				.map(async (site) => ({ id: site.id, naam: (await siteSettings(site)).naam }))
		)
	};
}

export const load: PageServerLoad = async ({ locals, url }) => ({
	justLinked: url.searchParams.get('gekoppeld') === '1',
	linkFailed: url.searchParams.get('koppelen') === 'mislukt',
	identity: locals.user!.prefs.identity,
	githubLogin: locals.user!.prefs.githubLogin ?? '',
	emailVerified: locals.user!.session.emailVerified,
	sites: await siteRules(),
	beheer: await beheer(locals.user!.session.sub, locals.user!.prefs.githubLogin),
	kenmerk: locals.user!.session.sub
});

export const actions: Actions = {
	opslaan: (event) => submitPrefs(event, 'stay'),
	ontkoppel: (event) => unlinkGithub(event)
};
