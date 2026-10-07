import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_LINK_COOKIE, finishGithubLink } from '$lib/auth/github-link';
import { savePrefs } from '$lib/auth/users';
import { log } from '$lib/log';

const failed = () =>
	new Response(
		'<!doctype html><html lang="nl"><meta charset="utf-8"><title>Koppelen met GitHub is niet gelukt</title>' +
			'<h1>Koppelen met GitHub is niet gelukt</h1><p><a href="/instellingen">Terug naar instellingen</a></p></html>',
		{ status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { session, prefs } = locals.user;
	try {
		const gh = await finishGithubLink(url, cookies.get(GITHUB_LINK_COOKIE), session.sub);
		await savePrefs({ ...prefs, githubLogin: gh.login, githubId: gh.id });
	} catch (err) {
		log.error('auth.github_link_failed', { reason: err instanceof Error ? err.message : 'unknown' });
		cookies.delete(GITHUB_LINK_COOKIE, { path: '/' });
		return failed();
	}
	cookies.delete(GITHUB_LINK_COOKIE, { path: '/' });
	redirect(303, '/instellingen?gekoppeld=1');
};
