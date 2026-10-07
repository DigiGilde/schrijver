import type { Actions, PageServerLoad } from './$types';
import { siteRules, submitPrefs, unlinkGithub } from '$lib/auth/prefs-action';

export const load: PageServerLoad = ({ locals, url }) => ({
	justLinked: url.searchParams.get('gekoppeld') === '1',
	linkFailed: url.searchParams.get('koppelen') === 'mislukt',
	identity: locals.user!.prefs.identity,
	githubLogin: locals.user!.prefs.githubLogin ?? '',
	emailVerified: locals.user!.session.emailVerified,
	sites: siteRules()
});

export const actions: Actions = {
	opslaan: (event) => submitPrefs(event, 'stay'),
	ontkoppel: (event) => unlinkGithub(event)
};
