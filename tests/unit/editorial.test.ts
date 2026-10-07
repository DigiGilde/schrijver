import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isEditorial } from '../../src/lib/auth/editorial';
import { parseSitesYaml, type SiteConfig } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { log } from '../../src/lib/log';

const REDACTIE_EMAIL = 'redactie@example.org';

const base: SiteConfig = parseSitesYaml(
	readFileSync(new URL('../fixtures/config/sites.yaml', import.meta.url), 'utf8')
)[0];
const site: SiteConfig = { ...base, review: { ...base.review, redactie: [REDACTIE_EMAIL] } };

describe('isEditorial', () => {
	let forge: FakeForge;

	beforeEach(() => {
		forge = new FakeForge();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('matches a verified e-mail in review.redactie case-insensitively after trimming', async () => {
		const user = { email: `  ReDactie@Example.ORG `, emailVerified: true, githubLogin: null };
		expect(await isEditorial(site, user, forge)).toBe(true);
	});

	it('ignores the e-mail when it is not verified', async () => {
		const user = { email: REDACTIE_EMAIL, emailVerified: false, githubLogin: null };
		expect(await isEditorial(site, user, forge)).toBe(false);
	});

	it('ignores a null e-mail even when verified', async () => {
		const user = { email: null, emailVerified: true, githubLogin: null };
		expect(await isEditorial(site, user, forge)).toBe(false);
	});

	it('grants editorial rights to a GitHub login with write permission', async () => {
		forge.permissionByLogin.set('writer', 'write');
		const user = { email: null, emailVerified: false, githubLogin: 'writer' };
		expect(await isEditorial(site, user, forge)).toBe(true);
	});

	it('grants editorial rights to a GitHub login with admin permission', async () => {
		forge.permissionByLogin.set('admin', 'admin');
		const user = { email: null, emailVerified: false, githubLogin: 'admin' };
		expect(await isEditorial(site, user, forge)).toBe(true);
	});

	it('denies a GitHub login with read permission', async () => {
		forge.permissionByLogin.set('reader', 'read');
		const user = { email: null, emailVerified: false, githubLogin: 'reader' };
		expect(await isEditorial(site, user, forge)).toBe(false);
	});

	it('denies an unknown GitHub login', async () => {
		const user = { email: null, emailVerified: false, githubLogin: 'nobody' };
		expect(await isEditorial(site, user, forge)).toBe(false);
	});

	it('editorial-fails-closed: returns false and logs a warning when the forge throws', async () => {
		forge.permissionByLogin.set('writer', 'write');
		forge.failNext('collaboratorPermission', new ForgeError(503, 'Forge onbereikbaar', 'timeout'));
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => true);
		const user = { email: null, emailVerified: false, githubLogin: 'writer' };

		expect(await isEditorial(site, user, forge)).toBe(false);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('editorial.check_failed', {
			site: site.id,
			error: 'ForgeError',
			status: 503
		});
	});

	it('never logs the e-mail address', async () => {
		forge.failNext('collaboratorPermission', new ForgeError(500, 'Fout'));
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => true);
		const outsider = 'buiten@example.org';
		const user = { email: outsider, emailVerified: true, githubLogin: 'writer' };

		expect(await isEditorial(site, user, forge)).toBe(false);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(warn.mock.calls)).not.toContain(outsider);
	});
});
