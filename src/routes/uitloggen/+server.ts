import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE } from '$lib/auth/session';

// POST only, from a form: a cross-site page cannot log the user out by navigating here.
// The redirect stays same-origin: CSP form-action 'self' blocks a form redirect to the SSO.
export const POST: RequestHandler = ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/uitgelogd');
};
