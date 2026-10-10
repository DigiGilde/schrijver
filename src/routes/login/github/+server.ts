import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_LINK_COOKIE, GITHUB_LINK_TTL_MS, startGithubLink } from '$lib/auth/github-link';
import { cookieOptions } from '$lib/auth/session';

// POST only: SvelteKit's origin check then stops another site from starting a link in the user's name.
// The redirect stays same-origin: CSP form-action 'self' blocks a form redirect to github.com.
export const POST: RequestHandler = ({ cookies, locals }) => {
	if (!locals.user) redirect(303, '/login');
	cookies.set(
		GITHUB_LINK_COOKIE,
		startGithubLink(locals.user.session.sub),
		cookieOptions(GITHUB_LINK_TTL_MS / 1000)
	);
	redirect(303, '/login/github/start');
};
