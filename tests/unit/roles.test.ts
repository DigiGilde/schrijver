import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import {
	canManageSite,
	isPlatformAdmin,
	managedSites,
	platformAdmins,
	siteRole
} from '../../src/lib/auth/roles';
import { startingSettings } from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';
import { log } from '../../src/lib/log';

describe('platform admins', () => {
	const before = process.env.SCHRIJVER_BEHEERDERS;
	afterEach(() => {
		if (before === undefined) delete process.env.SCHRIJVER_BEHEERDERS;
		else process.env.SCHRIJVER_BEHEERDERS = before;
	});

	it('reads comma-separated subs, trimmed, without empty ones', () => {
		expect(platformAdmins({ SCHRIJVER_BEHEERDERS: ' a1 ,b2,, c3 ' })).toEqual(
			new Set(['a1', 'b2', 'c3'])
		);
		expect(platformAdmins({})).toEqual(new Set());
	});

	it('compares subs exactly', () => {
		expect(isPlatformAdmin('Abc', { SCHRIJVER_BEHEERDERS: 'abc' })).toBe(false);
		expect(isPlatformAdmin('abc', { SCHRIJVER_BEHEERDERS: 'abc' })).toBe(true);
	});

	it('reads the environment at every call', () => {
		process.env.SCHRIJVER_BEHEERDERS = 'eerste';
		expect(isPlatformAdmin('tweede')).toBe(false);
		process.env.SCHRIJVER_BEHEERDERS = 'eerste,tweede';
		expect(isPlatformAdmin('tweede')).toBe(true);
	});
});

describe('site roles', () => {
	let team: MemoryTeamStore;
	let forge: FakeForge;
	const site = (id: string) => ({ id, repo: `o/${id}` });
	const as = (sub: string, githubLogin: string | null = null) => ({ sub, githubLogin });

	beforeEach(async () => {
		process.env.SCHRIJVER_BEHEERDERS = 'platform';
		forge = new FakeForge();
		team = new MemoryTeamStore();
		useTeamStore(team);
		for (const [i, id] of ['a', 'b', 'c'].entries()) {
			const place = { id, repoId: i + 1, repo: `o/${id}`, standaardbranch: 'main' };
			await team.addSite(place, startingSettings(id), null, null);
		}
		await team.recordLogin({ sub: 'baas', name: 'Baas', email: 'baas@x.nl', emailVerified: true });
		await team.recordLogin({ sub: 'red', name: 'Red', email: 'red@x.nl', emailVerified: true });
		await team.addByEmail('a', 'baas@x.nl', 'beheerder', 'x');
		await team.addByEmail('c', 'baas@x.nl', 'beheerder', 'x');
		await team.addByEmail('b', 'baas@x.nl', 'redactie', 'x');
		await team.addByEmail('a', 'red@x.nl', 'redactie', 'x');
	});
	afterEach(() => {
		useTeamStore(undefined);
		delete process.env.SCHRIJVER_BEHEERDERS;
		vi.mocked(log.warn).mockClear();
	});

	it('reads the role from the table', async () => {
		expect(await siteRole('a', 'baas')).toBe('beheerder');
		expect(await siteRole('b', 'baas')).toBe('redactie');
		expect(await siteRole('b', 'red')).toBeNull();
	});

	it('lets a platform admin and a beheerder of the site manage it, nobody else', async () => {
		expect(await canManageSite(site('b'), as('platform'), forge)).toBe(true);
		expect(await canManageSite(site('a'), as('baas'), forge)).toBe(true);
		expect(await canManageSite(site('b'), as('baas'), forge)).toBe(false);
		expect(await canManageSite(site('a'), as('red'), forge)).toBe(false);
		expect(await canManageSite(site('a'), as('vreemd'), forge)).toBe(false);
	});

	it('also lets a linked GitHub account with admin permission manage it', async () => {
		forge.permissionByLogin.set('octo', 'admin');
		forge.permissionByLogin.set('schrijver', 'write');
		expect(await canManageSite(site('b'), as('vreemd', 'octo'), forge)).toBe(true);
		expect(await canManageSite(site('b'), as('vreemd', 'schrijver'), forge)).toBe(false);
		expect(await canManageSite(site('b'), as('red', 'onbekend'), forge)).toBe(false);
	});

	it('asks GitHub nothing for a platform admin, a beheerder or someone without a link', async () => {
		const permission = vi.spyOn(forge, 'collaboratorPermission');
		await canManageSite(site('b'), as('platform', 'octo'), forge);
		await canManageSite(site('a'), as('baas', 'octo'), forge);
		await canManageSite(site('a'), as('red'), forge);
		expect(permission).not.toHaveBeenCalled();
	});

	it('says no, and logs only the site and the error, when a lookup fails', async () => {
		forge.permissionByLogin.set('octo', 'admin');
		forge.failNext('collaboratorPermission', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect(await canManageSite(site('b'), as('vreemd', 'octo'), forge)).toBe(false);
		expect(log.warn).toHaveBeenCalledWith('admin.check_failed', {
			site: 'b',
			error: 'ForgeError',
			status: 502
		});
		vi.spyOn(team, 'role').mockRejectedValueOnce(new Error('database weg'));
		expect(await canManageSite(site('a'), as('baas'), forge)).toBe(false);
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toMatch(/octo|baas|@/);
	});

	it('lists the sites a user manages, in the order given', async () => {
		forge.permissionByLogin.set('octo', 'admin');
		const sites = ['c', 'b', 'a'].map(site);
		expect(await managedSites(sites, as('platform'), forge)).toEqual(['c', 'b', 'a']);
		expect(await managedSites(sites, as('baas'), forge)).toEqual(['c', 'a']);
		expect(await managedSites(sites, as('red'), forge)).toEqual([]);
		expect(await managedSites(sites, as('red', 'octo'), forge)).toEqual(['c', 'b', 'a']);
	});
});
