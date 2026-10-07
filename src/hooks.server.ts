import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { log } from '$lib/log';
import {
	SESSION_COOKIE,
	SESSION_RENEW_BELOW_MS,
	SESSION_TTL_MS,
	cookieOptions,
	type Session,
	openSession,
	sealSession,
	sessionSecret
} from '$lib/auth/session';
import { applySchema, getPrefs, type UserPrefs } from '$lib/auth/users';
import { initServices } from '$lib/server/services';
import {
	apiGuard,
	assertSafeEnvironment,
	devBypassesAllowed,
	rateLimit,
	securityHeaders
} from '$lib/server/security';

assertSafeEnvironment();

const PUBLIC_PATHS = new Set(['/login', '/login/callback', '/uitloggen', '/healthz']);
const PUBLIC_PREFIXES = ['/api/webhook/'];
const ONBOARDING_EXEMPT = new Set([
	'/onboarding',
	'/instellingen',
	'/login/github',
	'/login/github/callback'
]);

let schemaReady: Promise<void> | undefined;
const ensureSchema = () => {
	schemaReady ??= applySchema().catch((err) => {
		schemaReady = undefined;
		log.error('db.schema_failed', { reason: String(err) });
		throw err;
	});
	return schemaReady;
};

let servicesReady: Promise<void> | undefined;
const initAny = async () => {
	if (process.env.SCHRIJVER_FAKE_FORGE === '1' && devBypassesAllowed()) {
		const { initFakeServices } = await import('$lib/server/fake-mode');
		return initFakeServices();
	}
	return initServices();
};
const ensureServices = () => {
	servicesReady ??= initAny().catch((err) => {
		servicesReady = undefined;
		throw err;
	});
	return servicesReady;
};

const devSession = (): Session | null => {
	if (!devBypassesAllowed() || !process.env.SCHRIJVER_TEST_SESSION) return null;
	return JSON.parse(process.env.SCHRIJVER_TEST_SESSION) as Session;
};

const testPrefs = (sub: string): UserPrefs => ({
	sub,
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true
});

const isPublic = (path: string) =>
	PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

const see = (to: string) => new Response(null, { status: 303, headers: { location: to } });

const authHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	event.locals.user = null;

	if (path === '/healthz') return resolve(event);

	const test = devSession();
	if (test) {
		await ensureServices();
		event.locals.user = { session: test, prefs: testPrefs(test.sub) };
		return resolve(event);
	}

	await ensureServices();
	if (isPublic(path)) return resolve(event);
	await ensureSchema();

	const token = event.cookies.get(SESSION_COOKIE);
	const secret = sessionSecret();
	const session = token ? openSession(token, secret) : null;
	if (session) {
		event.locals.user = { session, prefs: await getPrefs(session.sub) };
		if (session.exp - Date.now() < SESSION_RENEW_BELOW_MS) {
			const renewed = { ...session, exp: Date.now() + SESSION_TTL_MS };
			event.cookies.set(
				SESSION_COOKIE,
				sealSession(renewed, secret),
				cookieOptions(SESSION_TTL_MS / 1000)
			);
		}
	}

	if (!event.locals.user) return see('/login');
	if (!event.locals.user.prefs.onboarded && !ONBOARDING_EXEMPT.has(path)) return see('/onboarding');
	return resolve(event);
};

export const handle = sequence(securityHeaders, apiGuard, rateLimit, authHandle);
