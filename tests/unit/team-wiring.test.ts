import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { log } from '../../src/lib/log';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import {
	recordedWriters,
	recordLogin,
	recordWriter,
	siteSettings,
	startRetention,
	stopRetention,
	teamStore,
	useMemoryStores,
	useTeamStore
} from '../../src/lib/auth/team-store';
import { getPrefs } from '../../src/lib/auth/users';
import { PREVIEW_SITES } from '../../src/lib/server/fake-mode';

const [digi] = PREVIEW_SITES;

/** A team store with Digi Handboek added, as the local preview has it. */
async function withDigi() {
	const team = new MemoryTeamStore();
	await team.addSite(digi.site, digi.settings, null, null);
	return team;
}

afterEach(() => {
	stopRetention();
	useTeamStore(undefined);
	vi.mocked(log.info).mockClear();
	vi.mocked(log.error).mockClear();
	vi.useRealTimers();
});

describe('the settings of a site', () => {
	it('are the ones it got when it was added, and none are made up', async () => {
		const team = await withDigi();
		expect(await siteSettings({ id: 'digi-handboek' }, team)).toMatchObject({
			siteId: 'digi-handboek',
			...digi.settings
		});
		await expect(siteSettings({ id: 'onbekend' }, team)).rejects.toThrow(
			'no settings for site onbekend'
		);
	});
});

describe('the login', () => {
	it('saves the profile and logs each claim by site and role only', async () => {
		const team = await withDigi();
		await team.addByEmail('digi-handboek', 'naam@rijksoverheid.nl', 'redactie', 'platform');
		useTeamStore(team);
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

describe('the record of who writes', () => {
	it('tells nobody recorded apart from a record that cannot be read', async () => {
		const team = await withDigi();
		useTeamStore(team);
		expect(await recordedWriters('digi-handboek', 4)).toEqual([]);
		await team.recordLogin({
			sub: 'jan',
			name: 'Jan',
			email: 'jan@example.org',
			emailVerified: true
		});
		await recordWriter('digi-handboek', 4, 'jan');
		expect(await recordedWriters('digi-handboek', 4)).toEqual(['jan']);

		vi.spyOn(team, 'writers').mockRejectedValue(new Error('connection to jan@example.org'));
		expect(await recordedWriters('digi-handboek', 4)).toBeNull();
		expect(log.warn).toHaveBeenCalledWith('proposal.writers_failed', {
			site: 'digi-handboek',
			pr: 4,
			error: 'Error'
		});
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain('@');
	});

	it('logs a record that cannot be written, without the person, and goes on', async () => {
		const team = await withDigi();
		useTeamStore(team);
		await expect(recordWriter('digi-handboek', 4, 'onbekend')).resolves.toBeUndefined();
		expect(log.warn).toHaveBeenCalledWith('proposal.writer_not_recorded', {
			site: 'digi-handboek',
			pr: 4,
			error: 'Error'
		});
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain('onbekend');
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
