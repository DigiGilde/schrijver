import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_LINK_COOKIE, GITHUB_LINK_TTL_MS, startGithubLink } from '$lib/auth/github-link';
import { cookieOptions } from '$lib/auth/session';

// POST only: SvelteKit's origin check then stops another site from starting a link in the user's name.
export const POST: RequestHandler = ({ cookies, locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { location, cookie } = startGithubLink(locals.user.session.sub);
	cookies.set(GITHUB_LINK_COOKIE, cookie, cookieOptions(GITHUB_LINK_TTL_MS / 1000));
	redirect(303, location);
};
