import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/auth/oidc', () => ({
	LOGIN_COOKIE: 'schrijver_login',
	finishLogin: vi.fn(async () => {
		throw new Error('state mismatch');
	})
}));
vi.mock('../../src/lib/auth/users', () => ({ getPrefs: vi.fn() }));

import { GET } from '../../src/routes/login/callback/+server';

describe('login callback failure', () => {
	beforeEach(() => vi.restoreAllMocks());

	it('returns 400 with a Dutch message, clears the login cookie and logs without tokens', async () => {
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		const cookies = { get: vi.fn(() => 'sealed'), delete: vi.fn(), set: vi.fn() };
		const res = await GET({
			url: new URL('http://localhost/login/callback?code=SECRETCODE&state=x'),
			cookies
		} as unknown as Parameters<typeof GET>[0]);
		expect(res.status).toBe(400);
		expect(await res.text()).toContain('Inloggen is niet gelukt');
		expect(cookies.delete).toHaveBeenCalledWith('schrijver_login', { path: '/' });
		expect(cookies.set).not.toHaveBeenCalled();
		const line = JSON.parse(String(write.mock.calls[0][0]));
		expect(line).toMatchObject({ level: 'error', event: 'auth.callback_failed', reason: 'state mismatch' });
		expect(JSON.stringify(line)).not.toContain('SECRETCODE');
	});
});
