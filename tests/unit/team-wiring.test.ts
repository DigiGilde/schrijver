import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { log } from '../../src/lib/log';
import { seedFromConfig } from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import {
	recordLogin,
	seedSites,
	startRetention,
	stopRetention,
	teamStore,
	useMemoryStores,
	useTeamStore
} from '../../src/lib/auth/team-store';
import { getPrefs } from '../../src/lib/auth/users';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));

afterEach(() => {
	stopRetention();
	useTeamStore(undefined);
	vi.mocked(log.info).mockClear();
	vi.mocked(log.error).mockClear();
	vi.useRealTimers();
});

describe('seeding from the configuration', () => {
	it('takes the values of the configured site, with four eyes on', () => {
		expect(seedFromConfig(moza)).toEqual({
			siteId: 'moza-site',
			values: {
				naam: 'MijnOverheid Zakelijk',
				omschrijving:
					'Een overheidsbrede samenwerking om de dienstverlening voor ondernemers te verbeteren.',
				adres: 'https://mijnoverheidzakelijk.nl/',
				mergenVanuitSchrijver: true,
				vierOgen: true,
				identiteitToegestaan: ['anoniem', 'gekoppeld']
			},
			redactie: ['redactie@example.org']
		});
	});

	it('gives each site its settings and invitations once, and never overwrites them', async () => {
		const team = new MemoryTeamStore();
		await seedSites([digi, moza], team);
		expect((await team.settings('digi-handboek'))?.naam).toBe('Digi Handboek');
		expect((await team.invitations('digi-handboek')).map((i) => [i.email, i.role])).toEqual([
			['naam@rijksoverheid.nl', 'redactie']
		]);
		expect(log.info).toHaveBeenCalledWith('team.site_seeded', { site: 'moza-site' });

		await team.saveSettings('moza-site', { ...seedFromConfig(moza).values, naam: 'MOZa' }, 'x');
		await team.revokeInvitation('moza-site', (await team.invitations('moza-site'))[0].id, 'x');
		await seedSites([digi, moza], team);
		expect((await team.settings('moza-site'))?.naam).toBe('MOZa');
		expect(await team.invitations('moza-site')).toEqual([]);
	});
});

describe('the login', () => {
	it('saves the profile and logs each claim by site and role only', async () => {
		const team = new MemoryTeamStore();
		useTeamStore(team);
		await seedSites([digi], team);
		await recordLogin({
			sub: 'abc',
			name: 'Naam',
			email: 'Naam@Rijksoverheid.nl',
			emailVerified: true,
			organisation: null,
			iat: 0,
			exp: 1
		});
		expect(await team.role('digi-handboek', 'abc')).toBe('redactie');
		expect(log.info).toHaveBeenCalledWith('team.invitation_claimed', {
			site: 'digi-handboek',
			role: 'redactie'
		});
		expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain('@');
	});
});

describe('the memory stores', () => {
	it('are one pair, installed as the stores of the app', async () => {
		const first = useMemoryStores();
		expect(useMemoryStores()).toBe(first);
		expect(teamStore()).toBe(first.team);
		await first.users.savePrefs({
			sub: 'x',
			identity: 'anoniem',
			githubLogin: null,
			githubId: null,
			onboarded: true
		});
		expect((await getPrefs('x')).onboarded).toBe(true);
	});
});

describe('retention', () => {
	beforeEach(() => vi.useFakeTimers());

	it('runs at once and then once a day', async () => {
		const team = new MemoryTeamStore();
		const retention = vi.spyOn(team, 'retention');
		useTeamStore(team);
		startRetention();
		startRetention();
		await vi.advanceTimersByTimeAsync(0);
		expect(retention).toHaveBeenCalledTimes(1);
		expect(log.info).toHaveBeenCalledWith('team.retention', {
			invitations: 0,
			users: 0,
			audit: 0
		});
		await vi.advanceTimersByTimeAsync(24 * 3600_000);
		expect(retention).toHaveBeenCalledTimes(2);
	});

	it('logs a failure without its message and keeps the schedule', async () => {
		const team = new MemoryTeamStore();
		vi.spyOn(team, 'retention').mockRejectedValue(new Error('connection to jan@example.org'));
		useTeamStore(team);
		startRetention();
		await vi.advanceTimersByTimeAsync(0);
		expect(log.error).toHaveBeenCalledWith('team.retention_failed', { error: 'Error' });
	});
});
