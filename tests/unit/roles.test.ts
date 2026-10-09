import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	canManageSite,
	isPlatformAdmin,
	managedSites,
	platformAdmins,
	siteRole
} from '../../src/lib/auth/roles';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';

const seed = (siteId: string) => ({
	siteId,
	values: {
		naam: siteId,
		omschrijving: null,
		adres: null,
		mergenVanuitSchrijver: true,
		vierOgen: true,
		identiteitToegestaan: ['anoniem' as const]
	},
	redactie: []
});

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
	beforeEach(async () => {
		process.env.SCHRIJVER_BEHEERDERS = 'platform';
		const team = new MemoryTeamStore();
		useTeamStore(team);
		for (const id of ['a', 'b', 'c']) await team.seedSite(seed(id));
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
	});

	it('reads the role from the table', async () => {
		expect(await siteRole('a', 'baas')).toBe('beheerder');
		expect(await siteRole('b', 'baas')).toBe('redactie');
		expect(await siteRole('b', 'red')).toBeNull();
	});

	it('lets a platform admin and a beheerder of the site manage it, nobody else', async () => {
		expect(await canManageSite('b', { sub: 'platform' })).toBe(true);
		expect(await canManageSite('a', { sub: 'baas' })).toBe(true);
		expect(await canManageSite('b', { sub: 'baas' })).toBe(false);
		expect(await canManageSite('a', { sub: 'red' })).toBe(false);
		expect(await canManageSite('a', { sub: 'vreemd' })).toBe(false);
	});

	it('lists the sites a user manages, in the order given', async () => {
		expect(await managedSites(['c', 'b', 'a'], { sub: 'platform' })).toEqual(['c', 'b', 'a']);
		expect(await managedSites(['c', 'b', 'a'], { sub: 'baas' })).toEqual(['c', 'a']);
		expect(await managedSites(['c', 'b', 'a'], { sub: 'red' })).toEqual([]);
	});
});
