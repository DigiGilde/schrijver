import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Handle } from '@sveltejs/kit';
// @ts-expect-error SvelteKit ships no types for its internal server entry
import { with_request_store } from '@sveltejs/kit/internal/server';
import { sealSession, type Session } from '../../src/lib/auth/session';

const secret = 'test-secret-with-enough-entropy';
const prefs = {
	sub: 'abc',
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true
};

vi.mock('../../src/lib/server/services', () => ({ initServices: vi.fn(async () => undefined) }));
vi.mock('../../src/lib/server/fake-mode', () => ({
	initFakeServices: vi.fn(async () => undefined)
}));
vi.mock('../../src/lib/auth/users', () => ({
	getPrefs: vi.fn(async () => prefs),
	applySchema: vi.fn(async () => undefined)
}));

import { handle, handleError } from '../../src/hooks.server';
import { getPrefs } from '../../src/lib/auth/users';

const session = (over: Partial<Session> = {}): Session => ({
	sub: 'abc',
	name: 'Jan',
	email: 'jan@example.org',
	emailVerified: true,
	organisation: null,
	iat: Date.now(),
	exp: Date.now() + 8 * 3600_000,
	...over
});

function run(path: string, cookie?: string) {
	const set = vi.fn();
	const locals: Record<string, unknown> = {};
	const resolve = vi.fn(async () => new Response('ok'));
	const event = {
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}`),
		cookies: {
			get: (n: string) => (n === 'schrijver_sessie' ? cookie : undefined),
			set,
			delete: vi.fn()
		},
		locals,
		getClientAddress: () => '127.0.0.1'
	};
	// The real sequence() reads the request store that SvelteKit's server sets up per request.
	const store = {
		event,
		state: { tracing: { record_span: ({ fn }: { fn: (c: unknown) => unknown }) => fn({}) } }
	};
	const result = with_request_store(store as never, () =>
		(handle as Handle)({ event, resolve } as unknown as Parameters<Handle>[0])
	);
	return { result: Promise.resolve(result), locals, resolve, set };
}

beforeEach(() => {
	vi.mocked(getPrefs).mockClear();
	process.env.SESSION_SECRET = secret;
	vi.mocked(getPrefs).mockResolvedValue(prefs as never);
});

describe('composed handle', () => {
	it('rejects an unauthenticated API call without the header with 403, not a redirect', async () => {
		const { result, resolve } = run('/api/x');
		const res = await result;
		expect(res.status).toBe(403);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('rejects an encoded API path without the header', async () => {
		const { result } = run('/%61pi/assistent');
		expect((await result).status).toBe(403);
	});

	it('sets the security headers on the redirect to /login', async () => {
		const { result } = run('/sites/x');
		const res = await result;
		expect(res.status).toBe(303);
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
	});

	it('lets the webhook reach the next handle without the header', async () => {
		const { result, resolve } = run('/api/webhook/github');
		await result;
		expect(resolve).toHaveBeenCalled();
	});
});

describe('handle', () => {
	it('redirects unauthenticated requests to /login', async () => {
		const { result, resolve } = run('/sites/x');
		const res = await result;
		expect(res.status).toBe(303);
		expect(res.headers.get('location')).toBe('/login');
		expect(resolve).not.toHaveBeenCalled();
	});

	it.each(['/healthz', '/login', '/login/callback', '/uitloggen', '/api/webhook/github'])(
		'passes %s through',
		async (path) => {
			const { result, resolve } = run(path);
			await result;
			expect(resolve).toHaveBeenCalled();
			expect(getPrefs).not.toHaveBeenCalled();
		}
	);

	it('sets locals.user for a valid cookie', async () => {
		const s = session();
		const { result, locals, resolve } = run('/sites/x', sealSession(s, secret));
		await result;
		expect(resolve).toHaveBeenCalled();
		expect(locals.user).toEqual({ session: s, prefs });
	});

	it('treats an invalid cookie as signed out', async () => {
		const { result } = run('/', 'garbage');
		expect((await result).headers.get('location')).toBe('/login');
	});

	it('redirects a not-onboarded user to /onboarding', async () => {
		vi.mocked(getPrefs).mockResolvedValue({ ...prefs, onboarded: false } as never);
		const { result } = run('/', sealSession(session(), secret));
		const res = await result;
		expect(res.status).toBe(303);
		expect(res.headers.get('location')).toBe('/onboarding');
	});

	it('lets a not-onboarded user reach onboarding, settings and GitHub linking', async () => {
		vi.mocked(getPrefs).mockResolvedValue({ ...prefs, onboarded: false } as never);
		for (const p of ['/onboarding', '/instellingen', '/login/github', '/login/github/callback']) {
			const { result, resolve } = run(p, sealSession(session(), secret));
			await result;
			expect(resolve).toHaveBeenCalled();
		}
	});

	it('re-seals the cookie when less than 4 h remain', async () => {
		const { result, set } = run('/', sealSession(session({ exp: Date.now() + 3600_000 }), secret));
		await result;
		expect(set).toHaveBeenCalledWith(
			'schrijver_sessie',
			expect.any(String),
			expect.objectContaining({ path: '/', httpOnly: true })
		);
	});

	it('does not re-seal past the absolute maximum', async () => {
		const signedIn = Date.now() - 12 * 3600_000 + 60_000;
		const { result, set } = run('/', sealSession(session({ iat: signedIn, exp: Date.now() + 60_000 }), secret));
		await result;
		expect(set).not.toHaveBeenCalled();
	});

	it('does not re-seal with plenty of time left', async () => {
		const { result, set } = run('/', sealSession(session(), secret));
		await result;
		expect(set).not.toHaveBeenCalled();
	});
});

describe('handleError', () => {
	it('logs kind and id only and returns a Dutch message', async () => {
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		const result = await handleError({
			error: new Error('page text jan@example.org'),
			status: 500,
			message: 'Internal Error',
			event: {} as never
		});
		const line = String(write.mock.calls.at(-1)?.[0]);
		write.mockRestore();
		expect(result).toMatchObject({ message: 'Er ging iets mis', id: expect.any(String) });
		expect(line).toContain('server.error');
		expect(line).not.toContain('@');
		expect(line).not.toContain('page text');
	});
});

