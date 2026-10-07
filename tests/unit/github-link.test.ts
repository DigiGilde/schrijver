import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../src/lib/auth/users', () => ({ savePrefs: vi.fn(async () => {}) }));

import { savePrefs, type UserPrefs } from '../../src/lib/auth/users';
import { log } from '../../src/lib/log';
import { sealPayload } from '../../src/lib/auth/session';
import { startGithubLink } from '../../src/lib/auth/github-link';
import { submitPrefs, unlinkGithub } from '../../src/lib/auth/prefs-action';
import { POST as start } from '../../src/routes/login/github/+server';
import { GET as callback } from '../../src/routes/login/github/callback/+server';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const prefs: UserPrefs = { sub: 'abc', identity: 'anoniem', githubLogin: null, githubId: null, onboarded: true };
const user = (p = prefs, sub = 'abc') => ({ session: { sub, emailVerified: true }, prefs: p });

function jar(initial: Record<string, string> = {}) {
	const store = { ...initial };
	return {
		store,
		get: (n: string) => store[n],
		set: (n: string, v: string) => void (store[n] = v),
		delete: (n: string) => void delete store[n]
	};
}

beforeEach(() => {
	process.env.SESSION_SECRET = 'test-secret';
	process.env.GITHUB_APP_CLIENT_ID = 'cid';
	process.env.GITHUB_APP_CLIENT_SECRET = 'csecret';
	process.env.ORIGIN = 'https://schrijver.test';
	vi.mocked(savePrefs).mockClear();
	vi.mocked(log.error).mockClear();
	revoked = [];
});

function begin() {
	const cookies = jar();
	let loc = '';
	try {
		start({ url: new URL('https://x.test/login/github'), cookies, locals: { user: user() } } as never);
	} catch (r) {
		loc = (r as { location: string }).location;
	}
	const authorize = new URL(loc);
	return { cookies, state: authorize.searchParams.get('state')!, authorize };
}

type Outcome = Response & { location?: string };

async function call(cookies: ReturnType<typeof jar>, query: string, sub = 'abc'): Promise<Outcome> {
	try {
		return (await callback({
			url: new URL(`https://x.test/login/github/callback?${query}`),
			cookies,
			locals: { user: user(prefs, sub) }
		} as never)) as Outcome;
	} catch (r) {
		return r as Outcome;
	}
}

const githubOk = (challenge: string, user = { login: 'real-login', id: 42 }) => {
	server.use(
		http.post('https://github.com/login/oauth/access_token', async ({ request }) => {
			const body = new URLSearchParams(await request.text());
			expect(body.get('client_id')).toBe('cid');
			expect(body.get('client_secret')).toBe('csecret');
			expect(body.get('code')).toBe('thecode');
			expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(challenge);
			expect(body.get('redirect_uri')).toBe('https://schrijver.test/login/github/callback');
			expect(request.headers.get('accept')).toBe('application/json');
			return HttpResponse.json({ access_token: 'ghu_tok', token_type: 'bearer', scope: '' });
		}),
		http.get('https://api.github.com/user', ({ request }) => {
			expect(request.headers.get('authorization')).toBe('Bearer ghu_tok');
			return HttpResponse.json(user);
		}),
		http.delete('https://api.github.com/applications/cid/grant', async ({ request }) => {
			revoked.push({
				authorization: request.headers.get('authorization'),
				body: (await request.json()) as Record<string, unknown>
			});
			return new HttpResponse(null, { status: 204 });
		})
	);
};
let revoked: { authorization: string | null; body: Record<string, unknown> }[] = [];

describe('start', () => {
	it('redirects to GitHub with client id, redirect uri and state, and seals a cookie', () => {
		const { authorize, cookies } = begin();
		expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize');
		expect(authorize.searchParams.get('client_id')).toBe('cid');
		expect(authorize.searchParams.get('redirect_uri')).toBe('https://schrijver.test/login/github/callback');
		expect(authorize.searchParams.get('scope')).toBeNull();
		expect(cookies.store.schrijver_github_link).toBeTruthy();
	});

	it('sends a PKCE S256 challenge', () => {
		const { authorize } = begin();
		expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
		expect(authorize.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('throws without ORIGIN', () => {
		delete process.env.ORIGIN;
		expect(() => startGithubLink('abc')).toThrow('ORIGIN is not set');
	});
});

describe('callback', () => {
	it('saves login and id from /user and never changes the identity', async () => {
		const { cookies, state, authorize } = begin();
		githubOk(authorize.searchParams.get('code_challenge')!);
		const res = await call(cookies, `code=thecode&state=${state}&login=evil&id=1&kies=gekoppeld`);
		expect(res.location).toBe('/instellingen?gekoppeld=1');
		expect(savePrefs).toHaveBeenCalledWith({ ...prefs, githubLogin: 'real-login', githubId: 42 });
		expect(cookies.store.schrijver_github_link).toBeUndefined();
	});

	it('revokes the grant with the app credentials after reading the user', async () => {
		const { cookies, state, authorize } = begin();
		githubOk(authorize.searchParams.get('code_challenge')!);
		await call(cookies, `code=thecode&state=${state}`);
		expect(revoked).toEqual([
			{ authorization: `Basic ${Buffer.from('cid:csecret').toString('base64')}`, body: { access_token: 'ghu_tok' } }
		]);
	});

	it('still links when revoking fails, and logs no token', async () => {
		const { cookies, state, authorize } = begin();
		githubOk(authorize.searchParams.get('code_challenge')!);
		server.use(http.delete('https://api.github.com/applications/cid/grant', () => new HttpResponse(null, { status: 422 })));
		await call(cookies, `code=thecode&state=${state}`);
		expect(savePrefs).toHaveBeenCalled();
		expect(log.warn).toHaveBeenCalledWith('auth.github_grant_not_revoked', { status: 422 });
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain('ghu_');
	});

	it('rejects a wrong state', async () => {
		const { cookies } = begin();
		const res = await call(cookies, 'code=thecode&state=other');
		expect(res.status).toBe(400);
		expect(await res.text()).toContain('Koppelen met GitHub is niet gelukt');
		expect(savePrefs).not.toHaveBeenCalled();
		expect(log.error).toHaveBeenCalledWith('auth.github_link_failed', expect.any(Object));
	});

	it('rejects a cookie sealed for another user', async () => {
		const { cookies, state } = begin();
		const res = await call(cookies, `code=thecode&state=${state}`, 'someone-else');
		expect(res.status).toBe(400);
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('rejects a cookie without a verifier', async () => {
		const { cookies, state } = begin();
		cookies.store.schrijver_github_link = sealPayload({ state, sub: 'abc', exp: Date.now() + 60_000 }, 'test-secret', 'github-link');
		const res = await call(cookies, `code=thecode&state=${state}`);
		expect(res.status).toBe(400);
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('rejects an expired cookie', async () => {
		const { cookies, state } = begin();
		cookies.store.schrijver_github_link = sealPayload(
			{ state, verifier: 'v', sub: 'abc', exp: Date.now() - 1000 },
			'test-secret',
			'github-link'
		);
		const res = await call(cookies, `code=thecode&state=${state}`);
		expect(res.status).toBe(400);
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('rejects a missing cookie', async () => {
		const res = await call(jar(), 'code=thecode&state=x');
		expect(res.status).toBe(400);
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('fails without logging the token when the exchange fails', async () => {
		server.use(http.post('https://github.com/login/oauth/access_token', () => new HttpResponse(null, { status: 500 })));
		const { cookies, state } = begin();
		const res = await call(cookies, `code=thecode&state=${state}`);
		expect(res.status).toBe(400);
		expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain('ghu_');
		expect(savePrefs).not.toHaveBeenCalled();
	});
});

describe('prefs form action', () => {
	const event = (identity: string, u = user()) =>
		({ locals: { user: u }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams({ identity }) }) }) as never;

	it('rejects op-naam without a verified e-mail address', async () => {
		const u = { session: { sub: 'abc', emailVerified: false }, prefs };
		const res = (await submitPrefs(event('op-naam', u), 'stay')) as { status: number; data: { error: string } };
		expect(res.status).toBe(400);
		expect(res.data.error).toBe('Alleen mogelijk met een geverifieerd e-mailadres');
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('rejects an unknown identity', async () => {
		const res = (await submitPrefs(event('bogus'), 'stay')) as { status: number };
		expect(res.status).toBe(400);
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('redirects to /login without a signed-in user', async () => {
		const e = { locals: { user: null }, request: new Request('http://x', { method: 'POST', body: new URLSearchParams() }) } as never;
		await expect(submitPrefs(e, 'stay')).rejects.toMatchObject({ status: 303, location: '/login' });
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('refuses gekoppeld without a link', async () => {
		const res = (await submitPrefs(event('gekoppeld'), 'stay')) as { status: number; data: { error: string } };
		expect(res.status).toBe(400);
		expect(res.data.error).toBe('Koppel eerst je GitHub-account');
		expect(savePrefs).not.toHaveBeenCalled();
	});

	it('accepts gekoppeld with a link and keeps it', async () => {
		const linked: UserPrefs = { ...prefs, githubLogin: 'jan', githubId: 5 };
		await submitPrefs(event('gekoppeld', user(linked)), 'stay');
		expect(savePrefs).toHaveBeenCalledWith({ ...linked, identity: 'gekoppeld', onboarded: true });
	});

	it('unlinking clears the link and resets gekoppeld to anoniem', async () => {
		const linked: UserPrefs = { ...prefs, identity: 'gekoppeld', githubLogin: 'jan', githubId: 5 };
		await unlinkGithub({ locals: { user: user(linked) } } as never);
		expect(savePrefs).toHaveBeenCalledWith({ ...prefs, identity: 'anoniem', githubLogin: null, githubId: null });
	});
});
