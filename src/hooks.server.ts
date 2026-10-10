import { randomUUID } from 'node:crypto';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { errorFields, log } from '$lib/log';
import {
	SESSION_COOKIE,
	SESSION_RENEW_BELOW_MS,
	assertStrongSecrets,
	cookieOptions,
	type Session,
	openSession,
	renewedExpiry,
	sealSession,
	sessionSecret
} from '$lib/auth/session';
import { ACT_AS_COOKIE, actingAs, sessionAs } from '$lib/auth/dev-switch';
import { recordLogin, startRetention, teamStore, useMemoryStores } from '$lib/auth/team-store';
import { applySchema, getPrefs, savePrefs, type UserPrefs } from '$lib/auth/users';
import { initServices } from '$lib/server/services';
import {
	apiGuard,
	assertSafeEnvironment,
	devBypassesAllowed,
	rateLimit,
	securityHeaders
} from '$lib/server/security';

assertSafeEnvironment();
assertStrongSecrets();

const PUBLIC_PATHS = new Set([
	'/login',
	'/login/callback',
	'/login/mislukt',
	'/uitloggen',
	'/uitgelogd',
	'/healthz'
]);
const PUBLIC_PREFIXES = ['/api/webhook/'];
const ONBOARDING_EXEMPT = new Set([
	'/onboarding',
	'/instellingen',
	'/login/github',
	'/login/github/start',
	'/login/github/callback'
]);

let schemaReady: Promise<void> | undefined;
const ensureSchema = () => {
	schemaReady ??= applySchema().catch((err) => {
		schemaReady = undefined;
		log.error('db.schema_failed', errorFields(err));
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
	return initServices(async () => {
		if (!devSession()) await ensureSchema();
	});
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

let testLoginReady: Promise<void> | undefined;
const ensureTestLogin = (session: Session) =>
	(testLoginReady ??= (async () => {
		await savePrefs(testPrefs(session.sub));
		await recordLogin(session);
		startRetention();
	})());

const isPublic = (path: string) =>
	PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));

const see = (to: string) => new Response(null, { status: 303, headers: { location: to } });

const authHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	event.locals.user = null;

	if (path === '/healthz') return resolve(event);

	const test = devSession();
	if (test) {
		useMemoryStores();
		await ensureServices();
		await ensureTestLogin(test);
		const other = actingAs(event.cookies.get(ACT_AS_COOKIE));
		const session = (other && (await sessionAs(other, test, teamStore()))) || test;
		event.locals.user = { session, prefs: await getPrefs(session.sub) };
		return resolve(event);
	}

	await ensureServices();
	if (isPublic(path)) return resolve(event);
	await ensureSchema();
	startRetention();

	const token = event.cookies.get(SESSION_COOKIE);
	const secret = sessionSecret();
	const session = token ? openSession(token, secret) : null;
	if (session) {
		event.locals.user = { session, prefs: await getPrefs(session.sub) };
		const exp = renewedExpiry(session);
		if (session.exp - Date.now() < SESSION_RENEW_BELOW_MS && exp > session.exp) {
			const renewed = { ...session, exp };
			event.cookies.set(
				SESSION_COOKIE,
				sealSession(renewed, secret),
				cookieOptions(Math.ceil((exp - Date.now()) / 1000))
			);
		}
	}

	if (!event.locals.user) {
		// A fetch would follow a redirect to the SSO login and fail without a reason; say it.
		if (path.startsWith('/api/')) {
			const message =
				'Je sessie is verlopen. Log opnieuw in; je tekst blijft in deze browser bewaard.';
			return new Response(JSON.stringify({ ok: false, message, error: { message } }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		return see('/login');
	}
	if (!event.locals.user.prefs.onboarded && !ONBOARDING_EXEMPT.has(path)) return see('/onboarding');
	return resolve(event);
};

export const handle = sequence(securityHeaders, apiGuard, rateLimit, authHandle);

export const handleError: HandleServerError = ({ error, status }) => {
	if (status === 404) return { message: 'Deze pagina bestaat niet' };
	const id = randomUUID();
	log.error('server.error', { id, status, ...errorFields(error) });
	return { message: 'Er ging iets mis', id };
};
