import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Handle } from '@sveltejs/kit';
import { sealSession, type Session } from '../../src/lib/auth/session';

const secret = 'test-secret-with-enough-entropy';
const prefs = {
	sub: 'abc',
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true
};

vi.mock('@sveltejs/kit/hooks', () => ({
	sequence:
		(...hs: Handle[]): Handle =>
		({ event, resolve }) => {
			const next = (i: number, e: typeof event): ReturnType<Handle> =>
				i === hs.length ? resolve(e) : hs[i]({ event: e, resolve: (ne) => next(i + 1, ne ?? e) });
			return next(0, event);
		}
}));
vi.mock('../../src/lib/server/services', () => ({ initServices: vi.fn(async () => undefined) }));
vi.mock('../../src/lib/server/fake-mode', () => ({
	initFakeServices: vi.fn(async () => undefined)
}));
vi.mock('../../src/lib/auth/users', () => ({
	getPrefs: vi.fn(async () => prefs),
	applySchema: vi.fn(async () => undefined)
}));

import { handle } from '../../src/hooks.server';
import { getPrefs } from '../../src/lib/auth/users';

const session = (over: Partial<Session> = {}): Session => ({
	sub: 'abc',
	name: 'Jan',
	email: 'jan@example.org',
	emailVerified: true,
	organisation: null,
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
	const result = (handle as Handle)({ event, resolve } as unknown as Parameters<Handle>[0]);
	return { result: Promise.resolve(result), locals, resolve, set };
}

beforeEach(() => {
	vi.mocked(getPrefs).mockClear();
	process.env.SESSION_SECRET = secret;
	vi.mocked(getPrefs).mockResolvedValue(prefs as never);
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

	it('does not re-seal with plenty of time left', async () => {
		const { result, set } = run('/', sealSession(session(), secret));
		await result;
		expect(set).not.toHaveBeenCalled();
	});
});
