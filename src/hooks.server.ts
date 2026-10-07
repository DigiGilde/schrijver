import type { Handle } from '@sveltejs/kit';
import { log } from '$lib/log';
import {
	SESSION_COOKIE,
	SESSION_RENEW_BELOW_MS,
	SESSION_TTL_MS,
	cookieOptions,
	openSession,
	sealSession,
	sessionSecret
} from '$lib/auth/session';
import { applySchema, getPrefs } from '$lib/auth/users';

const PUBLIC_PATHS = new Set(['/login', '/login/callback', '/uitloggen', '/healthz']);
const PUBLIC_PREFIXES = ['/api/webhook/'];
const ONBOARDING_EXEMPT = new Set(['/onboarding', '/instellingen']);

let schemaReady: Promise<void> | undefined;
const ensureSchema = () => {
	schemaReady ??= applySchema().catch((err) => {
		schemaReady = undefined;
		log.error('db.schema_failed', { reason: String(err) });
		throw err;
	});
	return schemaReady;
};

const isPublic = (path: string) =>
	PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

const see = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	event.locals.user = null;

	if (path === '/healthz') return resolve(event);

	await ensureSchema();

	const token = event.cookies.get(SESSION_COOKIE);
	const secret = sessionSecret();
	const session = token ? openSession(token, secret) : null;
	if (session) {
		event.locals.user = { session, prefs: await getPrefs(session.sub) };
		if (session.exp - Date.now() < SESSION_RENEW_BELOW_MS) {
			const renewed = { ...session, exp: Date.now() + SESSION_TTL_MS };
			event.cookies.set(SESSION_COOKIE, sealSession(renewed, secret), cookieOptions(SESSION_TTL_MS / 1000));
		}
	}

	if (isPublic(path)) return resolve(event);
	if (!event.locals.user) return see('/login');
	if (!event.locals.user.prefs.onboarded && !ONBOARDING_EXEMPT.has(path)) return see('/onboarding');
	return resolve(event);
};
