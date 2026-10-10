import * as client from 'openid-client';
import { SESSION_TTL_MS, openPayload, sealPayload, sessionSecret, type Session } from './session';

export const LOGIN_COOKIE = 'schrijver_login';
export const LOGIN_TTL_MS = 10 * 60_000;
const SCOPE = 'openid profile email';

let configPromise: Promise<client.Configuration> | undefined;

function env(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
}

export function oidcConfig(): Promise<client.Configuration> {
	configPromise ??= (async () => {
		const url = new URL(env('OIDC_DISCOVERY_URL'));
		return client.discovery(
			url,
			env('OIDC_CLIENT_ID'),
			env('OIDC_CLIENT_SECRET'),
			undefined,
			url.protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : undefined
		);
	})().catch((err) => {
		configPromise = undefined;
		throw err;
	});
	return configPromise;
}

const redirectUri = (origin: string) => `${origin}/login/callback`;

export async function startLogin(origin: string): Promise<{ location: string; cookie: string }> {
	const config = await oidcConfig();
	const state = client.randomState();
	const verifier = client.randomPKCECodeVerifier();
	const challenge = await client.calculatePKCECodeChallenge(verifier);
	const location = client.buildAuthorizationUrl(config, {
		redirect_uri: redirectUri(origin),
		scope: SCOPE,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state
	});
	const cookie = sealPayload(
		{ state, verifier, exp: Date.now() + LOGIN_TTL_MS },
		sessionSecret(),
		'login'
	);
	return { location: location.href, cookie };
}

export async function finishLogin(
	currentUrl: URL,
	loginCookie: string | undefined
): Promise<Session> {
	const login = loginCookie ? openPayload(loginCookie, sessionSecret(), 'login') : null;
	if (!login || typeof login.state !== 'string' || typeof login.verifier !== 'string') {
		throw new Error('login cookie missing or invalid');
	}
	const config = await oidcConfig();
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		pkceCodeVerifier: login.verifier,
		expectedState: login.state
	});
	const claims = tokens.claims();
	if (!claims) throw new Error('no id_token claims');
	const str = (v: unknown) => (typeof v === 'string' ? v : '');
	const org = claims.organization;
	const orgName =
		org && typeof org === 'object' && typeof (org as { name?: unknown }).name === 'string'
			? (org as { name: string }).name
			: null;
	return {
		sub: claims.sub,
		name: str(claims.name),
		email: str(claims.email),
		emailVerified: claims.email_verified === true,
		organisation: orgName,
		iat: Date.now(),
		exp: Date.now() + SESSION_TTL_MS
	};
}

export async function endSessionUrl(origin: string): Promise<string | null> {
	const config = await oidcConfig();
	if (!config.serverMetadata().end_session_endpoint) return null;
	return client.buildEndSessionUrl(config, { post_logout_redirect_uri: `${origin}/` }).href;
}
