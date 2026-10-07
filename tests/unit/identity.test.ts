import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { actorPseudonym, effectiveKind, identityFor } from '../../src/lib/auth/identity';
import { parseSitesYaml } from '../../src/lib/config/types';
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

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const all = {
	identiteit: {
		toegestaan: ['anoniem', 'gekoppeld', 'op-naam'] as ('anoniem' | 'gekoppeld' | 'op-naam')[]
	}
};

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
		expect(identityFor(prefs(), session(), all)).toEqual({
			kind: 'anoniem',
			pseudoniem: pseudonym('geheim', 'abc')
		});
	});

	it('gives gekoppeld the GitHub identity', () => {
		const id = identityFor(
			prefs({ identity: 'gekoppeld', githubLogin: 'tester', githubId: 42 }),
			session(),
			all
		);
		expect(id).toEqual({
			kind: 'gekoppeld',
			name: 'tester',
			githubId: 42,
			login: 'tester'
		});
	});

	it('downgrades gekoppeld without githubId to anoniem', () => {
		const id = identityFor(
			prefs({ identity: 'gekoppeld', githubLogin: 'tester', githubId: null }),
			session(),
			all
		);
		expect(id.kind).toBe('anoniem');
	});

	it('gives op-naam with a verified e-mail', () => {
		const id = identityFor(prefs({ identity: 'op-naam' }), session(), all);
		expect(id).toEqual({ kind: 'op-naam', name: 'Test Gebruiker', email: 'test@example.org' });
	});

	it('downgrades op-naam with an unverified e-mail to anoniem', () => {
		const id = identityFor(prefs({ identity: 'op-naam' }), session({ emailVerified: false }), all);
		expect(id.kind).toBe('anoniem');
	});

	it('throws without PSEUDONYM_SECRET', () => {
		delete process.env.PSEUDONYM_SECRET;
		expect(() => identityFor(prefs(), session(), all)).toThrow('PSEUDONYM_SECRET');
		process.env.PSEUDONYM_SECRET = '';
		expect(() => identityFor(prefs(), session(), all)).toThrow('PSEUDONYM_SECRET');
	});
});

describe('identiteit.toegestaan', () => {
	const linked = { githubLogin: 'tester', githubId: 42 };

	it('keeps every choice on a site that allows all three', () => {
		expect(digi.identiteit.toegestaan).toEqual(['anoniem', 'gekoppeld', 'op-naam']);
		expect(effectiveKind(prefs({ identity: 'op-naam' }), session(), digi)).toBe('op-naam');
		expect(effectiveKind(prefs({ identity: 'gekoppeld', ...linked }), session(), digi)).toBe(
			'gekoppeld'
		);
		expect(effectiveKind(prefs(), session(), digi)).toBe('anoniem');
	});

	it('never publishes a name on MOZa: op-naam falls back to the first allowed kind', () => {
		expect(moza.identiteit.toegestaan).toEqual(['anoniem', 'gekoppeld']);
		const id = identityFor(prefs({ identity: 'op-naam', ...linked }), session(), moza);
		expect(id).toEqual({ kind: 'anoniem', pseudoniem: pseudonym('geheim', 'abc') });
		expect(JSON.stringify(id)).not.toContain('test@example.org');
	});

	it('keeps gekoppeld on MOZa', () => {
		expect(identityFor(prefs({ identity: 'gekoppeld', ...linked }), session(), moza).kind).toBe(
			'gekoppeld'
		);
	});

	it('skips a fallback the user cannot use and always allows anoniem', () => {
		const onlyNamed = {
			identiteit: { toegestaan: ['gekoppeld', 'op-naam'] as ('gekoppeld' | 'op-naam')[] }
		};
		expect(
			effectiveKind(prefs({ identity: 'gekoppeld', ...linked }), session(), {
				identiteit: { toegestaan: ['op-naam'] }
			})
		).toBe('op-naam');
		expect(effectiveKind(prefs(), session(), onlyNamed)).toBe('anoniem');
		expect(
			effectiveKind(prefs({ identity: 'op-naam' }), session({ emailVerified: false }), {
				identiteit: { toegestaan: ['op-naam'] }
			})
		).toBe('anoniem');
	});

	it('gives every user one actor pseudonym for the logs', () => {
		expect(actorPseudonym({ sub: 'abc' })).toBe(pseudonym('geheim', 'abc'));
	});
});
