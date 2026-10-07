import type { Actions, PageServerLoad } from './$types';
import { submitPrefs } from '$lib/auth/prefs-action';

export const load: PageServerLoad = ({ locals }) => ({
	identity: locals.user!.prefs.identity,
	githubLogin: locals.user!.prefs.githubLogin ?? '',
	emailVerified: locals.user!.session.emailVerified
});

export const actions: Actions = {
	default: (event) => submitPrefs(event, 'stay')
};
