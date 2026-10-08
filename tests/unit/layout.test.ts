import { describe, expect, it } from 'vitest';
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

type Data = { userName: string | null; email: string | null };
const visit = async (user: typeof locals | { user: null } = locals) =>
	(await load({ locals: user } as never)) as Data;

describe('layout data', () => {
	it('carries the name and the address of the signed-in user', async () => {
		expect(await visit()).toMatchObject({ userName: 'Test Gebruiker', email: 'test@example.org' });
	});

	it('carries neither without a user', async () => {
		expect(await visit({ user: null })).toMatchObject({ userName: null, email: null });
	});
});
