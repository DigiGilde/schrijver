import type { Actions, PageServerLoad } from './$types';
import { siteRules, submitPrefs, unlinkGithub } from '$lib/auth/prefs-action';
import { siteUser } from '$lib/server/site-access';

export const load: PageServerLoad = async ({ locals }) => ({
	identity: locals.user!.prefs.identity,
	githubLogin: locals.user!.prefs.githubLogin ?? '',
	emailVerified: locals.user!.session.emailVerified,
	sites: await siteRules(siteUser(locals.user!))
});

export const actions: Actions = {
	opslaan: (event) => submitPrefs(event, 'redirect'),
	ontkoppel: (event) => unlinkGithub(event)
};
