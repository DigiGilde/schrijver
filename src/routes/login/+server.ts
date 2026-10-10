import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LOGIN_COOKIE, LOGIN_TTL_MS, startLogin } from '$lib/auth/oidc';
import { cookieOptions } from '$lib/auth/session';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const { location, cookie } = await startLogin(url.origin);
	cookies.set(LOGIN_COOKIE, cookie, cookieOptions(LOGIN_TTL_MS / 1000));
	redirect(303, location);
};
