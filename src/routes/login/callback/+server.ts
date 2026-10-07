import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LOGIN_COOKIE, finishLogin } from '$lib/auth/oidc';
import { SESSION_COOKIE, SESSION_TTL_MS, cookieOptions, sealSession, sessionSecret } from '$lib/auth/session';
import { getPrefs } from '$lib/auth/users';
import { log } from '$lib/log';

const failed = () =>
	new Response(
		'<!doctype html><html lang="nl"><meta charset="utf-8"><title>Inloggen is niet gelukt</title>' +
			'<h1>Inloggen is niet gelukt</h1><p><a href="/login">Probeer het opnieuw</a></p></html>',
		{ status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } }
	);

export const GET: RequestHandler = async ({ url, cookies }) => {
	let session;
	let onboarded;
	try {
		session = await finishLogin(url, cookies.get(LOGIN_COOKIE));
		onboarded = (await getPrefs(session.sub)).onboarded;
	} catch (err) {
		log.error('auth.callback_failed', { reason: err instanceof Error ? err.message : 'unknown' });
		cookies.delete(LOGIN_COOKIE, { path: '/' });
		return failed();
	}
	cookies.delete(LOGIN_COOKIE, { path: '/' });
	cookies.set(SESSION_COOKIE, sealSession(session, sessionSecret()), cookieOptions(SESSION_TTL_MS / 1000));
	redirect(303, onboarded ? '/' : '/onboarding');
};
