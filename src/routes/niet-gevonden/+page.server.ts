import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SITE_NOT_FOUND } from '$lib/server/site-access';

/** The page the site guard shows in the shell of the app: it runs no code of any site. */
export const load: PageServerLoad = () => error(404, SITE_NOT_FOUND);
