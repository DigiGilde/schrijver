import { describe, expect, it, vi } from 'vitest';
import type { SiteConfig } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { isSiteAdmin } from '../../src/lib/auth/admin';
import { log } from '../../src/lib/log';

const site = { id: 'moza', repo: 'o/moza' } as SiteConfig;

describe('isSiteAdmin', () => {
	it('is someone whose linked GitHub account has admin permission on the repository', async () => {
		const forge = new FakeForge();
		forge.permissionByLogin.set('baas', 'admin');
		forge.permissionByLogin.set('redacteur', 'write');
		expect(await isSiteAdmin(site, { sub: 'a', githubLogin: 'baas' }, forge)).toBe(true);
		expect(await isSiteAdmin(site, { sub: 'b', githubLogin: 'redacteur' }, forge)).toBe(false);
		expect(await isSiteAdmin(site, { sub: 'c', githubLogin: 'onbekend' }, forge)).toBe(false);
	});

	it('asks GitHub nothing without a linked account, and says no when GitHub cannot tell', async () => {
		const forge = new FakeForge();
		forge.permissionByLogin.set('baas', 'admin');
		const permission = vi.spyOn(forge, 'collaboratorPermission');
		expect(await isSiteAdmin(site, { sub: 'c', githubLogin: null }, forge)).toBe(false);
		expect(permission).not.toHaveBeenCalled();

		forge.failNext('collaboratorPermission', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect(await isSiteAdmin(site, { sub: 'a', githubLogin: 'baas' }, forge)).toBe(false);
		expect(log.warn).toHaveBeenCalledWith('admin.check_failed', {
			site: 'moza',
			error: 'ForgeError',
			status: 502
		});
	});
});
