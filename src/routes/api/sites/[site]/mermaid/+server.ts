import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfigStore } from '$lib/server/services';

/** The site's colours for `var(--token)` in Mermaid diagrams, for "Voorbeeld". */
export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.user) return json({ message: 'Niet ingelogd' }, { status: 401 });
	const site = getConfigStore().site(params.site);
	if (!site) return json({ message: 'Site niet gevonden' }, { status: 404 });
	return json({ tokens: site.mermaid?.tokens ?? {} });
};
