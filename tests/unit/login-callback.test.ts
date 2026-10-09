import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth/oidc', () => ({
	LOGIN_COOKIE: 'schrijver_login',
	finishLogin: vi.fn(async () => {
		throw new Error('state mismatch');
	})
}));
vi.mock('../../src/lib/auth/users', () => ({ getPrefs: vi.fn() }));
vi.mock('../../src/lib/auth/team-store', () => ({ recordLogin: vi.fn(async () => undefined) }));

import { finishLogin } from '../../src/lib/auth/oidc';
import type { Session } from '../../src/lib/auth/session';
import { recordLogin } from '../../src/lib/auth/team-store';
import { getPrefs } from '../../src/lib/auth/users';
import { GET } from '../../src/routes/login/callback/+server';

describe('login callback success', () => {
	it('records the login before it reads the preferences, then sets the session', async () => {
		process.env.SESSION_SECRET = 'test-secret-with-enough-entropy';
		const session: Session = {
			sub: 'abc',
			name: 'Jan',
			email: 'jan@example.org',
			emailVerified: true,
			organisation: null,
			iat: Date.now(),
			exp: Date.now() + 60_000
		};
		vi.mocked(finishLogin).mockResolvedValueOnce(session);
		vi.mocked(getPrefs).mockImplementationOnce(async (sub) => {
			expect(recordLogin).toHaveBeenCalledWith(session);
			return { sub, identity: 'anoniem', githubLogin: null, githubId: null, onboarded: true };
		});
		const cookies = { get: vi.fn(() => 'sealed'), delete: vi.fn(), set: vi.fn() };
		const res = await Promise.resolve()
			.then(() =>
				GET({
					url: new URL('http://localhost/login/callback?code=c&state=s'),
					cookies
				} as unknown as Parameters<typeof GET>[0])
			)
			.catch((r: unknown) => r);
		expect(res).toMatchObject({ status: 303, location: '/' });
		expect(cookies.set).toHaveBeenCalledWith(
			'schrijver_sessie',
			expect.any(String),
			expect.anything()
		);
	});
});

describe('login callback failure', () => {
	beforeEach(() => vi.restoreAllMocks());

	it('sends the user to the Dutch failure page, clears the login cookie and logs without tokens', async () => {
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		const cookies = { get: vi.fn(() => 'sealed'), delete: vi.fn(), set: vi.fn() };
		const res = await Promise.resolve()
			.then(() =>
				GET({
					url: new URL('http://localhost/login/callback?code=SECRETCODE&state=x'),
					cookies
				} as unknown as Parameters<typeof GET>[0])
			)
			.catch((r: unknown) => r);
		expect(res).toMatchObject({ status: 303, location: '/login/mislukt' });
		expect(cookies.delete).toHaveBeenCalledWith('schrijver_login', { path: '/' });
		expect(cookies.set).not.toHaveBeenCalled();
		const line = JSON.parse(String(write.mock.calls[0][0]));
		expect(line).toMatchObject({
			level: 'error',
			event: 'auth.callback_failed',
			reason: 'state mismatch'
		});
		expect(JSON.stringify(line)).not.toContain('SECRETCODE');
	});
});
