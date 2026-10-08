import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nlddIconPack } from '$lib/server/nldd-icons';

/** The NLDD icons as an Iconify set, for the `nldd:` icons in Mermaid diagrams in "Voorbeeld". */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) return json({ message: 'Niet ingelogd' }, { status: 401 });
	return json(nlddIconPack(), { headers: { 'cache-control': 'private, max-age=3600' } });
};
