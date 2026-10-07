import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GITHUB_LINK_COOKIE, GITHUB_LINK_TTL_MS, startGithubLink } from '$lib/auth/github-link';
import { cookieOptions } from '$lib/auth/session';

export const GET: RequestHandler = ({ url, cookies, locals }) => {
	if (!locals.user) redirect(303, '/login');
	const { location, cookie } = startGithubLink(
		locals.user.session.sub,
		url.origin,
		url.searchParams.get('kies') === 'gekoppeld'
	);
	cookies.set(GITHUB_LINK_COOKIE, cookie, cookieOptions(GITHUB_LINK_TTL_MS / 1000));
	redirect(303, location);
};
