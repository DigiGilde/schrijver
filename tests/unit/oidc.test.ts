import { describe, it, expect, vi, beforeEach } from 'vitest';

const claims = vi.fn();
vi.mock('openid-client', () => ({
	discovery: vi.fn(async () => ({ serverMetadata: () => ({}) })),
	allowInsecureRequests: vi.fn(),
	randomState: () => 'st',
	randomPKCECodeVerifier: () => 'ver',
	calculatePKCECodeChallenge: async () => 'chal',
	buildAuthorizationUrl: () => new URL('https://idp.example/auth'),
	buildEndSessionUrl: () => new URL('https://idp.example/logout'),
	authorizationCodeGrant: vi.fn(async () => ({ claims }))
}));

import { finishLogin, startLogin } from '../../src/lib/auth/oidc';

const callback = new URL('http://localhost/login/callback?code=c&state=st');

beforeEach(() => {
	process.env.SESSION_SECRET = 'test-secret-with-enough-entropy';
	process.env.OIDC_DISCOVERY_URL = 'https://idp.example/.well-known/openid-configuration';
	process.env.OIDC_CLIENT_ID = 'id';
	process.env.OIDC_CLIENT_SECRET = 'secret';
});

describe('finishLogin', () => {
	it('maps claims, defaulting email_verified to false and reading a nested organization.name', async () => {
		const { cookie } = await startLogin('http://localhost');
		claims.mockReturnValue({ sub: 's1', name: 'Jan', email: 'jan@example.org', organization: { name: 'Ministerie X' } });
		const s = await finishLogin(callback, cookie);
		expect(s).toMatchObject({
			sub: 's1',
			name: 'Jan',
			email: 'jan@example.org',
			emailVerified: false,
			organisation: 'Ministerie X'
		});
		expect(s.exp).toBeGreaterThan(Date.now());
	});

	it('takes email_verified true and a missing organization as null', async () => {
		const { cookie } = await startLogin('http://localhost');
		claims.mockReturnValue({ sub: 's1', email_verified: true });
		const s = await finishLogin(callback, cookie);
		expect(s).toMatchObject({ emailVerified: true, organisation: null, name: '', email: '' });
	});

	it('throws without a login cookie', async () => {
		await expect(finishLogin(callback, undefined)).rejects.toThrow();
	});

	it('throws with an invalid login cookie', async () => {
		await expect(finishLogin(callback, 'garbage')).rejects.toThrow();
	});
});
