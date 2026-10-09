import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { recordLogin, teamStore } from '../../src/lib/auth/team-store';
import { getPrefs } from '../../src/lib/auth/users';
import { initFakeServices } from '../../src/lib/server/fake-mode';
import { getConfigStore } from '../../src/lib/server/services';

const invited = async (siteId: string) =>
	(await teamStore().invitations(siteId)).map((i) => `${i.email} ${i.role}`).sort();

describe('the team in the local preview', () => {
	it('keeps people in memory, seeded from the configuration plus a second colleague', async () => {
		await initFakeServices();
		const team = teamStore();
		expect((await team.settings('digi-handboek'))?.naam).toBe(
			getConfigStore().site('digi-handboek')?.naam
		);
		expect(await team.role('moza-site', 'collega')).toBe('beheerder');
		expect((await getPrefs('collega')).onboarded).toBe(true);
		expect(await invited('digi-handboek')).toEqual([
			'naam@rijksoverheid.nl redactie',
			'test@example.org beheerder'
		]);
		expect(await invited('moza-site')).toEqual([
			'redactie@example.org redactie',
			'test@example.org redactie'
		]);

		await recordLogin({
			sub: 'test',
			name: 'Test Gebruiker',
			email: 'test@example.org',
			emailVerified: true,
			organisation: null,
			iat: 0,
			exp: 1
		});
		expect(await team.role('digi-handboek', 'test')).toBe('beheerder');
		expect(await team.role('moza-site', 'test')).toBe('redactie');
		expect(await invited('digi-handboek')).toEqual(['naam@rijksoverheid.nl redactie']);
	});
});
