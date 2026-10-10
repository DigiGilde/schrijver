import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LOGIN_COOKIE, finishLogin } from '$lib/auth/oidc';
import {
	SESSION_COOKIE,
	SESSION_TTL_MS,
	cookieOptions,
	sealSession,
	sessionSecret
} from '$lib/auth/session';
import { recordLogin } from '$lib/auth/team-store';
import { getPrefs } from '$lib/auth/users';
import { errorFields, log } from '$lib/log';

export const GET: RequestHandler = async ({ url, cookies }) => {
	let session;
	let onboarded;
	try {
		session = await finishLogin(url, cookies.get(LOGIN_COOKIE));
		await recordLogin(session);
		onboarded = (await getPrefs(session.sub)).onboarded;
	} catch (err) {
		log.error('auth.callback_failed', errorFields(err));
		cookies.delete(LOGIN_COOKIE, { path: '/' });
		redirect(303, '/login/mislukt');
	}
	cookies.delete(LOGIN_COOKIE, { path: '/' });
	cookies.set(
		SESSION_COOKIE,
		sealSession(session, sessionSecret()),
		cookieOptions(SESSION_TTL_MS / 1000)
	);
	redirect(303, onboarded ? '/' : '/onboarding');
};
