import { randomBytes } from 'node:crypto';
import { openPayload, sealPayload, sessionSecret } from './session';

export const GITHUB_LINK_COOKIE = 'schrijver_github_link';
export const GITHUB_LINK_TTL_MS = 10 * 60_000;

const env = (name: string): string => {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
};

const redirectUri = (origin: string) => `${process.env.ORIGIN || origin}/login/github/callback`;

export function startGithubLink(sub: string, origin: string, chooseLinked: boolean) {
	const state = randomBytes(24).toString('base64url');
	const params = new URLSearchParams({ client_id: env('GITHUB_APP_CLIENT_ID'), redirect_uri: redirectUri(origin), state });
	return {
		location: `https://github.com/login/oauth/authorize?${params}`,
		cookie: sealPayload(
			{ state, sub, kies: chooseLinked ? 'gekoppeld' : '', exp: Date.now() + GITHUB_LINK_TTL_MS },
			sessionSecret()
		)
	};
}

export interface GithubIdentity {
	login: string;
	id: number;
	chooseLinked: boolean;
}

/** Verifies state and session binding, exchanges the code and reads the authenticated user. The token is not kept. */
export async function finishGithubLink(
	url: URL,
	cookie: string | undefined,
	sessionSub: string
): Promise<GithubIdentity> {
	const link = cookie ? openPayload(cookie, sessionSecret()) : null;
	if (!link || typeof link.state !== 'string' || typeof link.sub !== 'string') throw new Error('link cookie missing or invalid');
	if (link.sub !== sessionSub) throw new Error('link cookie belongs to another session');
	if (url.searchParams.get('state') !== link.state) throw new Error('state mismatch');
	const code = url.searchParams.get('code');
	if (!code) throw new Error('no code in callback');

	const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'schrijver' },
		body: new URLSearchParams({
			client_id: env('GITHUB_APP_CLIENT_ID'),
			client_secret: env('GITHUB_APP_CLIENT_SECRET'),
			code,
			redirect_uri: redirectUri(url.origin)
		})
	});
	if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
	const token = ((await tokenRes.json()) as { access_token?: unknown }).access_token;
	if (typeof token !== 'string' || !token) throw new Error('no access token in response');

	const userRes = await fetch('https://api.github.com/user', {
		headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'schrijver' }
	});
	if (!userRes.ok) throw new Error(`user lookup failed (${userRes.status})`);
	const body = (await userRes.json()) as { id?: unknown; login?: unknown };
	if (typeof body.id !== 'number' || typeof body.login !== 'string') throw new Error('unexpected user response');
	return { login: body.login, id: body.id, chooseLinked: link.kies === 'gekoppeld' };
}
