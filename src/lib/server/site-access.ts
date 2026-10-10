import { json, type Handle, type RequestEvent } from '@sveltejs/kit';
import { actorPseudonym } from '$lib/auth/identity';
import type { SiteUser } from '$lib/auth/roles';
import { maySeeSite } from '$lib/auth/visibility';
import type { SiteStatus } from '$lib/config/load';
import { errorFields, log } from '$lib/log';
import { normalisePath } from './security';
import { getConfigStore, getForge } from './services';

/** What someone reads who may not see a site, and the same for a site that does not exist. */
export const SITE_NOT_FOUND = 'Deze site bestaat niet, of alleen het team van de site ziet hem.';

type User = NonNullable<App.Locals['user']>;

export const siteUser = ({ session, prefs }: User): SiteUser => ({
	sub: session.sub,
	githubLogin: prefs.githubLogin
});

/** Whether the user may see this site of the registry. No when a lookup fails. */
export function maySee(status: SiteStatus, user: SiteUser): Promise<boolean> {
	const { id, repo } = status.site;
	return maySeeSite({ id, repo, isPublic: status.isPublic }, user, getForge());
}

/** The ids of the sites of the registry that the user may see. */
export async function visibleSites(
	user: SiteUser,
	statuses: SiteStatus[] = getConfigStore().statuses()
): Promise<Set<string>> {
	const seen = await Promise.all(statuses.map((status) => maySee(status, user)));
	return new Set(statuses.filter((_, i) => seen[i]).map((status) => status.site.id));
}

/**
 * Whether the user may open the site: one colleagues can work on, that they may see. Anything else, a
 * failure too, is no. A refusal is logged by the user's pseudonym, never an address or a sub.
 */
export async function mayOpen(siteId: string, user: User): Promise<boolean> {
	try {
		const status = getConfigStore().status(siteId);
		if (!status?.available) return false;
		if (await maySee(status, siteUser(user))) return true;
		log.warn('site.refused', { site: siteId, actor: actorPseudonym(user.session) });
		return false;
	} catch (err) {
		log.warn('site.guard_failed', { site: siteId, ...errorFields(err) });
		return false;
	}
}

/** The route that shows the page that does not exist in the shell of the app. */
const NOT_FOUND_ROUTE = '/niet-gevonden';

/** For when that route cannot answer: the page that does not exist without the shell. */
const PAGE = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pagina niet gevonden · Schrijver</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
body { margin: 0 auto; max-width: 40rem; padding: 2rem 1rem; overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
<h1>Pagina niet gevonden</h1>
<p>${SITE_NOT_FOUND} (foutcode 404)</p>
<p><a href="/">Naar de startpagina</a></p>
</main>
</body>
</html>
`;

/** The page that does not exist, as the app shows it, or without the shell when that fails. */
async function notFoundPage(event: RequestEvent): Promise<Response> {
	try {
		const page = await event.fetch(new URL(NOT_FOUND_ROUTE, event.url), {
			headers: { accept: 'text/html' }
		});
		if (page.status === 404 && page.headers.get('content-type')?.startsWith('text/html')) {
			const headers = new Headers(page.headers);
			headers.set('cache-control', 'no-store');
			return new Response(page.body, { status: 404, headers });
		}
	} catch (err) {
		log.warn('site.not_found_page_failed', errorFields(err));
	}
	return new Response(PAGE, {
		status: 404,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
	});
}

/** The 404 in the form the request expects: the API, a page's data, a form sent by script, or a page. */
function notFound(event: RequestEvent, path: string | null): Response | Promise<Response> {
	const message = SITE_NOT_FOUND;
	const headers = { 'cache-control': 'no-store' };
	if (path === null || path.startsWith('/api/')) {
		return json({ ok: false, message, error: { message } }, { status: 404, headers });
	}
	if (event.isDataRequest) return json({ message }, { status: 404, headers });
	if (
		event.request.method === 'POST' &&
		event.request.headers.get('accept')?.includes('application/json')
	) {
		return json({ type: 'error', error: { message } }, { status: 404, headers });
	}
	return notFoundPage(event);
}

const UNDER_A_SITE = /^\/(?:api\/)?sites\/([^/]+)/;

/**
 * Every request under /sites/<id> and /api/sites/<id> answers 404, before any route code runs, unless
 * the site is one colleagues can work on and the user may see it: pages, their data, form actions,
 * API endpoints and the file route, and every route added there later.
 */
export const siteGuard: Handle = async ({ event, resolve }) => {
	const path = normalisePath(event.url.pathname);
	const under = path === null ? null : UNDER_A_SITE.exec(path);
	if (path !== null && !under) return resolve(event);
	// The id the route itself reads, where it has one.
	const siteId = event.params?.site ?? under?.[1];
	const user = event.locals.user;
	if (siteId && user && (await mayOpen(siteId, user))) return resolve(event);
	return notFound(event, path);
};
