import { afterEach, describe, expect, it, vi } from 'vitest';
import { load } from '../../src/routes/+layout.server';

const locals = {
	user: {
		session: {
			sub: 'test',
			name: 'Test Gebruiker',
			email: 'test@example.org',
			emailVerified: true,
			organisation: null,
			iat: 0,
			exp: Date.now() + 60_000
		},
		prefs: { sub: 'test', identity: 'anoniem', githubLogin: null, githubId: null, onboarded: true }
	}
};

type Data = { userName: string | null; email: string | null; testEnvironment: boolean };
const visit = async (user: typeof locals | { user: null } = locals) =>
	(await load({ locals: user } as never)) as Data;

afterEach(() => vi.unstubAllEnvs());

describe('layout data', () => {
	it('carries the name and the address of the signed-in user', async () => {
		expect(await visit()).toMatchObject({ userName: 'Test Gebruiker', email: 'test@example.org' });
	});

	it('carries neither without a user', async () => {
		expect(await visit({ user: null })).toMatchObject({ userName: null, email: null });
	});

	it('flags the test environment for the fake forge in development and test', async () => {
		vi.stubEnv('SCHRIJVER_FAKE_FORGE', '1');
		vi.stubEnv('NODE_ENV', 'development');
		expect((await visit()).testEnvironment).toBe(true);
		vi.stubEnv('NODE_ENV', 'test');
		expect((await visit()).testEnvironment).toBe(true);
	});

	it('does not flag it without the fake forge', async () => {
		vi.stubEnv('SCHRIJVER_FAKE_FORGE', '');
		vi.stubEnv('NODE_ENV', 'development');
		expect((await visit()).testEnvironment).toBe(false);
	});

	it('never flags it in production, where the bypass is refused anyway', async () => {
		vi.stubEnv('SCHRIJVER_FAKE_FORGE', '1');
		vi.stubEnv('NODE_ENV', 'production');
		expect((await visit()).testEnvironment).toBe(false);
	});
});
