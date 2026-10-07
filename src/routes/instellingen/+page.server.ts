import type { Actions, PageServerLoad } from './$types';
import { submitPrefs, unlinkGithub } from '$lib/auth/prefs-action';

export const load: PageServerLoad = ({ locals, url }) => ({
	justLinked: url.searchParams.get('gekoppeld') === '1',
	identity: locals.user!.prefs.identity,
	githubLogin: locals.user!.prefs.githubLogin ?? '',
	emailVerified: locals.user!.session.emailVerified
});

export const actions: Actions = {
	opslaan: (event) => submitPrefs(event, 'stay'),
	ontkoppel: (event) => unlinkGithub(event)
};
