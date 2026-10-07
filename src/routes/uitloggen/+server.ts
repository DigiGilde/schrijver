import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endSessionUrl } from '$lib/auth/oidc';
import { SESSION_COOKIE } from '$lib/auth/session';
import { log } from '$lib/log';

// POST only, from a form: a cross-site page cannot log the user out by navigating here.
export const POST: RequestHandler = async ({ url, cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	let target: string | null = null;
	try {
		target = await endSessionUrl(url.origin);
	} catch (err) {
		log.warn('auth.end_session_unavailable', { reason: err instanceof Error ? err.message : 'unknown' });
	}
	redirect(303, target ?? '/');
};
