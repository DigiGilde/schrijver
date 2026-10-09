import { describe, expect, it } from 'vitest';
import { actingAs, sessionAs } from '../../src/lib/auth/dev-switch';
import type { Session } from '../../src/lib/auth/session';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';

const TEST_SESSION = JSON.stringify({ sub: 'test' });

describe('acting as another user', () => {
	it('is off outside development and test', () => {
		for (const NODE_ENV of ['production', undefined, 'staging']) {
			expect(actingAs('collega', { NODE_ENV, SCHRIJVER_TEST_SESSION: TEST_SESSION })).toBeNull();
		}
	});

	it('is off without a test session', () => {
		expect(actingAs('collega', { NODE_ENV: 'development' })).toBeNull();
	});

	it('names the other user in development and test, with a test session', () => {
		for (const NODE_ENV of ['development', 'test']) {
			expect(actingAs('collega', { NODE_ENV, SCHRIJVER_TEST_SESSION: TEST_SESSION })).toBe(
				'collega'
			);
		}
		expect(actingAs(undefined, { NODE_ENV: 'development', SCHRIJVER_TEST_SESSION: '{}' })).toBe(
			null
		);
	});

	it('builds the session from the saved profile, and knows no stranger', async () => {
		const team = new MemoryTeamStore();
		await team.recordLogin({
			sub: 'collega',
			name: 'Tweede Collega',
			email: 'collega@example.org',
			emailVerified: true
		});
		const base: Session = {
			sub: 'test',
			name: 'Test Gebruiker',
			email: 'test@example.org',
			emailVerified: true,
			organisation: null,
			iat: 1,
			exp: 2
		};
		expect(await sessionAs('collega', base, team)).toEqual({
			...base,
			sub: 'collega',
			name: 'Tweede Collega',
			email: 'collega@example.org',
			emailVerified: true
		});
		expect(await sessionAs('vreemd', base, team)).toBeNull();
	});
});
