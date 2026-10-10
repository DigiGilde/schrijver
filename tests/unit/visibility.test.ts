import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import type { TeamStore } from '../../src/lib/auth/team';
import { useTeamStore } from '../../src/lib/auth/team-store';
import { maySeeSite, whoSees } from '../../src/lib/auth/visibility';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { log } from '../../src/lib/log';
import { settingsOf, useTeams } from './team-fixture';

/** A site everyone sees, and one only its team sees, as their repository was last read. */
const open = (isPublic: boolean | null) => ({ id: 'open', repo: 'o/open', isPublic });
const closed = (isPublic: boolean | null) => ({ id: 'team', repo: 'o/team', isPublic });
const as = (sub: string, githubLogin: string | null = null) => ({ sub, githubLogin });

let forge: FakeForge;
let team: TeamStore;

beforeEach(async () => {
	process.env.SCHRIJVER_BEHEERDERS = 'platform';
	forge = new FakeForge();
	team = await useTeams([settingsOf('open'), settingsOf('team', { zichtbaarheid: 'team' })], {
		open: { elders: 'redactie' },
		team: { baas: 'beheerder', red: 'redactie', pen: 'bijdrager' }
	});
	vi.mocked(log.warn).mockClear();
});

afterEach(() => {
	useTeamStore(undefined);
	delete process.env.SCHRIJVER_BEHEERDERS;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('who sees a site', () => {
	it('is its setting on a public repository, and only its team on any other', () => {
		expect(whoSees(true, 'iedereen')).toBe('iedereen');
		expect(whoSees(true, 'team')).toBe('team');
		expect(whoSees(false, 'iedereen')).toBe('team');
		expect(whoSees(null, 'iedereen')).toBe('team');
	});
});

describe('maySeeSite', () => {
	it('lets everyone signed in see a site everyone sees on a public repository', async () => {
		expect(await maySeeSite(open(true), as('vreemd'), forge)).toBe(true);
	});

	it('closes that site to everyone but its team once its repository is private or unknown', async () => {
		for (const isPublic of [false, null]) {
			expect(await maySeeSite(open(isPublic), as('vreemd'), forge)).toBe(false);
			expect(await maySeeSite(open(isPublic), as('elders'), forge)).toBe(true);
		}
	});

	it('lets a platform admin and its team in any role see a site only the team sees', async () => {
		for (const sub of ['platform', 'baas', 'red', 'pen']) {
			expect(await maySeeSite(closed(true), as(sub), forge), sub).toBe(true);
		}
		for (const sub of ['vreemd', 'elders']) {
			expect(await maySeeSite(closed(true), as(sub), forge), sub).toBe(false);
		}
	});

	it('counts a linked GitHub account that may read a private repository, and only there', async () => {
		forge.permissionByLogin.set('lezer', 'read');
		forge.permissionByLogin.set('schrijfster', 'write');
		forge.permissionByLogin.set('octo', 'admin');
		for (const login of ['lezer', 'schrijfster', 'octo']) {
			expect(await maySeeSite(closed(false), as('vreemd', login), forge), login).toBe(true);
			expect(await maySeeSite(open(false), as('vreemd', login), forge), login).toBe(true);
			// Everyone may read a public repository, so GitHub's answer says nothing there.
			expect(await maySeeSite(closed(true), as('vreemd', login), forge), login).toBe(false);
			expect(await maySeeSite(closed(null), as('vreemd', login), forge), login).toBe(false);
		}
		expect(await maySeeSite(closed(false), as('vreemd', 'onbekend'), forge)).toBe(false);
		expect(await maySeeSite(closed(false), as('vreemd'), forge)).toBe(false);
	});

	it('asks GitHub nothing for a platform admin, a member or a site everyone sees', async () => {
		const permission = vi.spyOn(forge, 'collaboratorPermission');
		const settings = vi.spyOn(team, 'settings');
		await maySeeSite(closed(false), as('platform', 'octo'), forge);
		expect(settings).not.toHaveBeenCalled();
		await maySeeSite(closed(false), as('pen', 'octo'), forge);
		await maySeeSite(open(true), as('vreemd', 'octo'), forge);
		expect(permission).not.toHaveBeenCalled();
	});

	it('keeps what GitHub said for a minute, and never a failure', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-10T10:00:00Z'), toFake: ['Date'] });
		forge.permissionByLogin.set('lezer', 'read');
		const permission = vi.spyOn(forge, 'collaboratorPermission');
		expect(await maySeeSite(closed(false), as('vreemd', 'lezer'), forge)).toBe(true);
		forge.permissionByLogin.set('lezer', 'none');
		expect(await maySeeSite(closed(false), as('vreemd', 'Lezer'), forge)).toBe(true);
		expect(permission).toHaveBeenCalledTimes(1);
		vi.setSystemTime(new Date('2026-10-10T10:01:01Z'));
		expect(await maySeeSite(closed(false), as('vreemd', 'lezer'), forge)).toBe(false);
		expect(permission).toHaveBeenCalledTimes(2);

		forge.permissionByLogin.set('ander', 'read');
		forge.failNext('collaboratorPermission', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect(await maySeeSite(closed(false), as('vreemd', 'ander'), forge)).toBe(false);
		expect(await maySeeSite(closed(false), as('vreemd', 'ander'), forge)).toBe(true);
		expect(permission).toHaveBeenCalledTimes(4);
	});

	it('gives up on a GitHub that does not answer within two seconds: no, and not kept', async () => {
		vi.useFakeTimers();
		forge.permissionByLogin.set('lezer', 'read');
		const permission = vi
			.spyOn(forge, 'collaboratorPermission')
			.mockImplementationOnce(() => new Promise(() => {}));
		let answer: boolean | null = null;
		void maySeeSite(closed(false), as('vreemd', 'lezer'), forge).then((seen) => (answer = seen));
		await vi.advanceTimersByTimeAsync(1999);
		expect(answer).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(answer).toBe(false);
		expect(log.warn).toHaveBeenCalledWith('visibility.check_failed', {
			site: 'team',
			error: 'TimeLimitError'
		});
		expect(vi.getTimerCount()).toBe(0);
		expect(await maySeeSite(closed(false), as('vreemd', 'lezer'), forge)).toBe(true);
		expect(permission).toHaveBeenCalledTimes(2);
	});

	it('lets no one in when a lookup fails, and logs only the site and the error', async () => {
		forge.permissionByLogin.set('lezer', 'read');
		forge.failNext('collaboratorPermission', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect(await maySeeSite(closed(false), as('vreemd', 'lezer'), forge)).toBe(false);
		expect(log.warn).toHaveBeenCalledWith('visibility.check_failed', {
			site: 'team',
			error: 'ForgeError',
			status: 502
		});

		vi.spyOn(team, 'role').mockRejectedValueOnce(new Error('database weg'));
		expect(await maySeeSite(closed(true), as('baas'), forge)).toBe(false);
		vi.spyOn(team, 'settings').mockRejectedValueOnce(new Error('database weg'));
		expect(await maySeeSite(open(true), as('vreemd'), forge)).toBe(false);
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toMatch(/vreemd|baas|lezer|@/);
	});

	it('says no for a site that has no settings', async () => {
		const site = { id: 'zonder', repo: 'o/zonder', isPublic: true };
		expect(await maySeeSite(site, as('vreemd'), forge)).toBe(false);
	});
});
