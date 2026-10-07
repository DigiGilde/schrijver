import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { GITHUB_LINK_COOKIE, githubAuthorizeUrl } from '$lib/auth/github-link';

export const load: PageServerLoad = ({ cookies, locals }) => {
	if (!locals.user) redirect(303, '/login');
	const url = githubAuthorizeUrl(cookies.get(GITHUB_LINK_COOKIE), locals.user.session.sub);
	if (!url) redirect(303, '/instellingen?koppelen=mislukt');
	return { url };
};
