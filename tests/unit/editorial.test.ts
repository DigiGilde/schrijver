import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEditorial } from '../../src/lib/auth/editorial';
import type { TeamStore } from '../../src/lib/auth/team';
import { useTeamStore } from '../../src/lib/auth/team-store';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { log } from '../../src/lib/log';
import { settingsOf, useTeams } from './team-fixture';

const site = { id: 'moza', repo: 'o/moza' };

describe('isEditorial', () => {
	let forge: FakeForge;
	let team: TeamStore;

	beforeEach(async () => {
		forge = new FakeForge();
		team = await useTeams([settingsOf('moza'), settingsOf('ander')], {
			moza: { baas: 'beheerder', red: 'redactie' },
			ander: { elders: 'redactie' }
		});
	});

	afterEach(() => {
		useTeamStore(undefined);
		delete process.env.SCHRIJVER_BEHEERDERS;
		vi.restoreAllMocks();
	});

	it('counts both roles on the team of the site, by sub', async () => {
		expect(await isEditorial(site, { sub: 'baas', githubLogin: null }, forge)).toBe(true);
		expect(await isEditorial(site, { sub: 'red', githubLogin: null }, forge)).toBe(true);
		expect(await isEditorial(site, { sub: 'elders', githubLogin: null }, forge)).toBe(false);
		expect(await isEditorial(site, { sub: 'vreemd', githubLogin: null }, forge)).toBe(false);
	});

	it('no longer counts an e-mail address, of the configuration or of an invitation', async () => {
		await team.addByEmail('moza', 'uitgenodigd@example.org', 'redactie', 'baas');
		await team.recordLogin({
			sub: 'jan',
			name: 'Jan',
			email: 'jan@example.org',
			emailVerified: true
		});
		expect(await isEditorial(site, { sub: 'jan', githubLogin: null }, forge)).toBe(false);
	});

	it('leaves a platform admin out, until they join the team', async () => {
		process.env.SCHRIJVER_BEHEERDERS = 'platform';
		expect(await isEditorial(site, { sub: 'platform', githubLogin: null }, forge)).toBe(false);
	});

	it('grants it to a linked GitHub account with write or admin permission', async () => {
		forge.permissionByLogin.set('schrijver', 'write');
		forge.permissionByLogin.set('admin', 'admin');
		forge.permissionByLogin.set('lezer', 'read');
		const as = (githubLogin: string) => isEditorial(site, { sub: 'x', githubLogin }, forge);
		expect(await as('schrijver')).toBe(true);
		expect(await as('admin')).toBe(true);
		expect(await as('lezer')).toBe(false);
		expect(await as('onbekend')).toBe(false);
	});

	it('asks GitHub nothing for a member of the team', async () => {
		const permission = vi.spyOn(forge, 'collaboratorPermission');
		expect(await isEditorial(site, { sub: 'red', githubLogin: 'red' }, forge)).toBe(true);
		expect(permission).not.toHaveBeenCalled();
	});

	it('fails closed and logs without personal data when GitHub cannot tell', async () => {
		forge.permissionByLogin.set('schrijver', 'write');
		forge.failNext('collaboratorPermission', new ForgeError(503, 'Forge onbereikbaar', 'timeout'));
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => true);
		expect(await isEditorial(site, { sub: 'x', githubLogin: 'schrijver' }, forge)).toBe(false);
		expect(warn).toHaveBeenCalledWith('editorial.check_failed', {
			site: 'moza',
			error: 'ForgeError',
			status: 503
		});
		expect(JSON.stringify(warn.mock.calls)).not.toContain('schrijver');
	});

	it('fails closed when the team cannot be read', async () => {
		vi.spyOn(team, 'role').mockRejectedValue(new Error('database weg'));
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => true);
		expect(await isEditorial(site, { sub: 'red', githubLogin: null }, forge)).toBe(false);
		expect(warn).toHaveBeenCalledWith('editorial.check_failed', {
			site: 'moza',
			error: 'Error'
		});
	});
});
