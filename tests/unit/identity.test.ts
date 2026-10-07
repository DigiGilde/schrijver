import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { identityFor } from '../../src/lib/auth/identity';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { pseudonym } from '../../src/lib/forge/trailers';

const session = (over: Partial<Session> = {}): Session => ({
	sub: 'abc',
	name: 'Test Gebruiker',
	email: 'test@example.org',
	emailVerified: true,
	organisation: null,
	iat: Date.now(),
	exp: 9999999999999,
	...over
});
const prefs = (over: Partial<UserPrefs> = {}): UserPrefs => ({
	sub: 'abc',
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true,
	...over
});

const original = process.env.PSEUDONYM_SECRET;
beforeEach(() => {
	process.env.PSEUDONYM_SECRET = 'geheim';
});
afterEach(() => {
	if (original === undefined) delete process.env.PSEUDONYM_SECRET;
	else process.env.PSEUDONYM_SECRET = original;
});

describe('identityFor', () => {
	it('gives anoniem a pseudonym', () => {
		expect(identityFor(prefs(), session())).toEqual({
			kind: 'anoniem',
			pseudoniem: pseudonym('geheim', 'abc')
		});
	});

	it('gives gekoppeld the GitHub identity', () => {
		const id = identityFor(
			prefs({ identity: 'gekoppeld', githubLogin: 'tester', githubId: 42 }),
			session()
		);
		expect(id).toEqual({
			kind: 'gekoppeld',
			name: 'Test Gebruiker',
			githubId: 42,
			login: 'tester'
		});
	});

	it('downgrades gekoppeld without githubId to anoniem', () => {
		const id = identityFor(
			prefs({ identity: 'gekoppeld', githubLogin: 'tester', githubId: null }),
			session()
		);
		expect(id.kind).toBe('anoniem');
	});

	it('gives op-naam with a verified e-mail', () => {
		const id = identityFor(prefs({ identity: 'op-naam' }), session());
		expect(id).toEqual({ kind: 'op-naam', name: 'Test Gebruiker', email: 'test@example.org' });
	});

	it('downgrades op-naam with an unverified e-mail to anoniem', () => {
		const id = identityFor(prefs({ identity: 'op-naam' }), session({ emailVerified: false }));
		expect(id.kind).toBe('anoniem');
	});

	it('throws without PSEUDONYM_SECRET', () => {
		delete process.env.PSEUDONYM_SECRET;
		expect(() => identityFor(prefs(), session())).toThrow('PSEUDONYM_SECRET');
		process.env.PSEUDONYM_SECRET = '';
		expect(() => identityFor(prefs(), session())).toThrow('PSEUDONYM_SECRET');
	});
});
