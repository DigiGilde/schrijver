import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { errorFields, log } from '../log';
import { openPayload, sealPayload, sessionSecret } from './session';

export const GITHUB_LINK_COOKIE = 'schrijver_github_link';
export const GITHUB_LINK_TTL_MS = 10 * 60_000;

const env = (name: string): string => {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set`);
	return v;
};

const redirectUri = () => `${env('ORIGIN')}/login/github/callback`;

const sameString = (a: string, b: string) => {
	const x = Buffer.from(a);
	const y = Buffer.from(b);
	return x.length === y.length && timingSafeEqual(x, y);
};

export function startGithubLink(sub: string) {
	const state = randomBytes(24).toString('base64url');
	const verifier = randomBytes(32).toString('base64url');
	const params = new URLSearchParams({
		client_id: env('GITHUB_APP_CLIENT_ID'),
		redirect_uri: redirectUri(),
		state,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'),
		code_challenge_method: 'S256'
	});
	return {
		location: `https://github.com/login/oauth/authorize?${params}`,
		cookie: sealPayload(
			{ state, verifier, sub, exp: Date.now() + GITHUB_LINK_TTL_MS },
			sessionSecret(),
			'github-link'
		)
	};
}

export interface GithubIdentity {
	login: string;
	id: number;
}

/**
 * Deletes the grant, and with it the token, so a later link always shows GitHub's consent screen
 * instead of completing silently. Same call as @octokit/oauth-methods deleteAuthorization.
 */
async function revokeGrant(token: string): Promise<void> {
	const clientId = env('GITHUB_APP_CLIENT_ID');
	const basic = Buffer.from(`${clientId}:${env('GITHUB_APP_CLIENT_SECRET')}`).toString('base64');
	try {
		const res = await fetch(`https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`, {
			method: 'DELETE',
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Basic ${basic}`,
				'content-type': 'application/json',
				'user-agent': 'schrijver'
			},
			body: JSON.stringify({ access_token: token })
		});
		if (res.status !== 204) log.warn('auth.github_grant_not_revoked', { status: res.status });
	} catch (err) {
		log.warn('auth.github_grant_not_revoked', errorFields(err));
	}
}

/** Verifies state and session binding, exchanges the code, reads the authenticated user and revokes the grant. */
export async function finishGithubLink(
	url: URL,
	cookie: string | undefined,
	sessionSub: string
): Promise<GithubIdentity> {
	const link = cookie ? openPayload(cookie, sessionSecret(), 'github-link') : null;
	if (!link || typeof link.state !== 'string' || typeof link.sub !== 'string' || typeof link.verifier !== 'string') throw new Error('link cookie missing or invalid');
	if (link.sub !== sessionSub) throw new Error('link cookie belongs to another session');
	if (!sameString(url.searchParams.get('state') ?? '', link.state)) throw new Error('state mismatch');
	const code = url.searchParams.get('code');
	if (!code) throw new Error('no code in callback');

	const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'schrijver' },
		body: new URLSearchParams({
			client_id: env('GITHUB_APP_CLIENT_ID'),
			client_secret: env('GITHUB_APP_CLIENT_SECRET'),
			code,
			redirect_uri: redirectUri(),
			code_verifier: link.verifier
		})
	});
	if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
	const token = ((await tokenRes.json()) as { access_token?: unknown }).access_token;
	if (typeof token !== 'string' || !token) throw new Error('no access token in response');

	const userRes = await fetch('https://api.github.com/user', {
		headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'schrijver' }
	});
	try {
		if (!userRes.ok) throw new Error(`user lookup failed (${userRes.status})`);
		const body = (await userRes.json()) as { id?: unknown; login?: unknown };
		if (typeof body.id !== 'number' || typeof body.login !== 'string') throw new Error('unexpected user response');
		return { login: body.login, id: body.id };
	} finally {
		await revokeGrant(token);
	}
}
