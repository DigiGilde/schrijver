import type { Actions, PageServerLoad } from './$types';
import { submitPrefs, unlinkGithub } from '$lib/auth/prefs-action';

export const load: PageServerLoad = ({ locals }) => ({
	identity: locals.user!.prefs.identity,
	githubLogin: locals.user!.prefs.githubLogin ?? '',
	emailVerified: locals.user!.session.emailVerified
});

export const actions: Actions = {
	opslaan: (event) => submitPrefs(event, 'redirect'),
	ontkoppel: (event) => unlinkGithub(event)
};
