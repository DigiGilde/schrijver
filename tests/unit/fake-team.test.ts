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

describe('the local preview', () => {
	it('registers the pilot sites and Oude site, whose old files keep it from editing', async () => {
		await initFakeServices();
		expect((await teamStore().sites()).map((s) => [s.id, s.repoId, s.repo])).toEqual([
			['digi-handboek', 4101, 'DigiGilde/handboek'],
			['moza-site', 4102, 'MinBZK/moza-site'],
			['oude-site', 4107, 'DigiGilde/oude-site']
		]);
		expect(
			getConfigStore()
				.sites()
				.map((s) => s.id)
		).toEqual(['digi-handboek', 'moza-site']);
		expect(getConfigStore().status('oude-site')).toMatchObject({
			available: false,
			errors: expect.arrayContaining(['.schrijver/schema.yaml: ontbreekt'])
		});
		expect(await teamStore().members('oude-site')).toEqual([]);
	});

	it('keeps people in memory: the first beheerders, a second and a third colleague', async () => {
		await initFakeServices();
		const team = teamStore();
		expect((await team.settings('digi-handboek'))?.naam).toBe('Digi Handboek');
		expect((await team.settings('digi-handboek'))?.vierOgen).toBe(false);
		expect(await team.role('moza-site', 'collega')).toBe('beheerder');
		expect(await team.role('moza-site', 'derde')).toBe('redactie');
		expect(await team.sitesOf('platform')).toEqual([]);
		expect((await team.profile('platform'))?.name).toBe('Beheerder Schrijver');
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
