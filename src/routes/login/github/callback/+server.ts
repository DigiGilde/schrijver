import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_LINK_COOKIE, finishGithubLink } from '$lib/auth/github-link';
import { actorPseudonym } from '$lib/auth/identity';
import { savePrefs } from '$lib/auth/users';
import { log } from '$lib/log';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { session, prefs } = locals.user;
	try {
		const gh = await finishGithubLink(url, cookies.get(GITHUB_LINK_COOKIE), session.sub);
		await savePrefs({ ...prefs, githubLogin: gh.login, githubId: gh.id });
		log.info('auth.github_linked', { actor: actorPseudonym(session) });
	} catch (err) {
		log.error('auth.github_link_failed', {
			reason: err instanceof Error ? err.message : 'unknown'
		});
		cookies.delete(GITHUB_LINK_COOKIE, { path: '/' });
		redirect(303, '/instellingen?koppelen=mislukt');
	}
	cookies.delete(GITHUB_LINK_COOKIE, { path: '/' });
	redirect(303, '/instellingen?gekoppeld=1');
};
