import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endSessionUrl } from '$lib/auth/oidc';
import { SESSION_COOKIE } from '$lib/auth/session';
import { log } from '$lib/log';

export const GET: RequestHandler = async ({ url, cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	let target: string | null = null;
	try {
		target = await endSessionUrl(url.origin);
	} catch (err) {
		log.warn('auth.end_session_unavailable', { reason: err instanceof Error ? err.message : 'unknown' });
	}
	redirect(303, target ?? '/');
};
