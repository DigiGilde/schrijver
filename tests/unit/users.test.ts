import { describe, it, expect } from 'vitest';
import { MemoryUsersStore } from '../../src/lib/auth/users';

describe('MemoryUsersStore', () => {
	it('returns defaults for an unknown user', async () => {
		const store = new MemoryUsersStore();
		expect(await store.getPrefs('x')).toEqual({
			sub: 'x',
			identity: 'anoniem',
			githubLogin: null,
			githubId: null,
			onboarded: false
		});
	});

	it('upserts', async () => {
		const store = new MemoryUsersStore();
		await store.savePrefs({
			sub: 'x',
			identity: 'gekoppeld',
			githubLogin: 'jan',
			githubId: 5,
			onboarded: true
		});
		await store.savePrefs({
			sub: 'x',
			identity: 'anoniem',
			githubLogin: null,
			githubId: null,
			onboarded: true
		});
		expect((await store.getPrefs('x')).identity).toBe('anoniem');
		expect((await store.getPrefs('y')).onboarded).toBe(false);
	});
});
