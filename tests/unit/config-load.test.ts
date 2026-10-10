import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { startingSettings, type NewSite } from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import {
	ConfigStore,
	NOT_INSTALLED,
	OTHER_REPOSITORY,
	UNREACHABLE,
	UnknownSiteError
} from '../../src/lib/config/load';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { log } from '../../src/lib/log';
import { structureFile } from './sites-fixture';

const MOZA = 'MinBZK/moza-site';
const DIGI = 'DigiGilde/handboek';
const OUD = 'DigiGilde/oude-site';

const files = (site: string, names: string[]) =>
	Object.fromEntries(names.map((name) => [`.schrijver/${name}`, structureFile(site, name)]));

let forge: FakeForge;
let team: MemoryTeamStore;
let now: number;
let store: ConfigStore;

const site = (id: string, repoId: number, repo: string): NewSite => ({
	id,
	repoId,
	repo,
	standaardbranch: 'main'
});

beforeEach(async () => {
	forge = new FakeForge();
	forge.seedRepo(DIGI, 'main', files('digi-handboek', ['site.yaml', 'schema.yaml']), { id: 1 });
	forge.seedRepo(
		MOZA,
		'main',
		files('moza-site', ['site.yaml', 'schema.yaml', 'schrijfwijzer.md']),
		{ id: 2 }
	);
	forge.seedRepo(OUD, 'main', files('oude-site', ['site.yaml']), { id: 3 });
	team = new MemoryTeamStore();
	await team.addSite(site('digi-handboek', 1, DIGI), startingSettings('Digi'), null, null);
	await team.addSite(site('moza-site', 2, MOZA), startingSettings('MOZa'), null, null);
	now = 1;
	store = new ConfigStore(
		team,
		() => forge,
		() => now++
	);
	vi.mocked(log.warn).mockClear();
});

async function change(repo: string, path: string, content: string) {
	await forge.commit(repo, 'main', [{ path, content }], 'm');
}

describe('ConfigStore', () => {
	it('builds each site from the registry and the .schrijver/ files of its repository', async () => {
		expect(store.sites()).toEqual([]);
		expect(store.state()).toEqual({ loadedAt: null, lastError: null });
		await store.load();
		expect(store.sites().map((s) => s.id)).toEqual(['digi-handboek', 'moza-site']);
		expect(store.site('moza-site')).toMatchObject({
			id: 'moza-site',
			repoId: 2,
			repo: MOZA,
			standaardbranch: 'main',
			concepten: 'openbaar',
			preview: { soort: 'bij-label', label: 'preview' }
		});
		expect(store.site('nope')).toBeUndefined();
		expect(store.schema('moza-site').titel).toBe('veld:title');
		expect(store.schrijfwijzer('moza-site')).toBe(structureFile('moza-site', 'schrijfwijzer.md'));
		expect(store.schrijfwijzer('digi-handboek')).toBe('');
		expect(store.state()).toEqual({ loadedAt: 1, lastError: null });
		expect(store.statuses().map((s) => [s.site.id, s.available, s.errors])).toEqual([
			['digi-handboek', true, []],
			['moza-site', true, []]
		]);
	});

	it('keeps a site whose files never were valid from editing, and names the problems', async () => {
		await team.addSite(site('oude-site', 3, OUD), startingSettings('Oud'), null, null);
		await store.load();
		expect(store.site('oude-site')).toBeUndefined();
		expect(store.sites().map((s) => s.id)).not.toContain('oude-site');
		expect(() => store.schema('oude-site')).toThrow(UnknownSiteError);
		expect(() => store.schrijfwijzer('oude-site')).toThrow(UnknownSiteError);
		expect(store.status('oude-site')).toEqual({
			site: expect.objectContaining({ id: 'oude-site', repoId: 3, repo: OUD }),
			available: false,
			errors: [
				expect.stringMatching(/^\.schrijver\/site\.yaml: naam: hoort niet meer in dit bestand/),
				expect.stringMatching(/^\.schrijver\/site\.yaml: review: /),
				expect.stringMatching(/^\.schrijver\/site\.yaml: repo: /),
				expect.stringMatching(/^\.schrijver\/site\.yaml: content\.schema: /),
				'.schrijver/schema.yaml: ontbreekt'
			]
		});
		expect(store.retrying()).toEqual([]);
	});

	it('keeps the last valid structure after an invalid change, and says what is wrong', async () => {
		await store.load();
		await change(MOZA, '.schrijver/site.yaml', 'preview: { soort: bij-push }\n');
		await store.reload('moza-site');
		expect(store.site('moza-site')?.preview).toMatchObject({ soort: 'bij-label' });
		expect(store.status('moza-site')).toMatchObject({
			available: true,
			errors: [
				'.schrijver/site.yaml: content: ontbreekt',
				'.schrijver/site.yaml: preview.url: is nodig, behalve bij soort: geen'
			]
		});

		await change(MOZA, '.schrijver/site.yaml', structureFile('kennisbank', 'site.yaml'));
		await store.reload('moza-site');
		expect(store.site('moza-site')?.content.pad).toBe('inhoud');
		expect(store.status('moza-site')?.errors).toEqual([]);
	});

	it('follows a renamed repository and a new default branch, and writes them down', async () => {
		await store.load();
		await forge.createBranch(MOZA, 'main', 'trunk');
		forge.setDefaultBranch(MOZA, 'trunk');
		forge.renameRepo(MOZA, 'MinBZK/moza');
		await store.load();
		expect(store.site('moza-site')).toMatchObject({
			repo: 'MinBZK/moza',
			standaardbranch: 'trunk'
		});
		expect((await team.sites()).find((s) => s.id === 'moza-site')).toMatchObject({
			repo: 'MinBZK/moza',
			standaardbranch: 'trunk'
		});
		expect((await team.audit('moza-site'))[0]).toMatchObject({
			action: 'site.moved',
			target: 'repo,standaardbranch'
		});
	});

	it('works in no repository its name now leads to that is not its own, and keeps nothing', async () => {
		await store.load();
		forge.renameRepo(MOZA, 'MinBZK/moza-oud');
		forge.seedRepo(MOZA, 'main', files('moza-site', ['site.yaml', 'schema.yaml']), { id: 99 });
		await store.reload('moza-site');
		expect(store.site('moza-site')).toBeUndefined();
		expect(store.status('moza-site')).toMatchObject({
			available: false,
			errors: [OTHER_REPOSITORY(MOZA)]
		});
	});

	it('says the App is not installed or GitHub cannot be reached, keeps the structure and asks to try again', async () => {
		await store.load();
		forge.setInstalled(MOZA, false);
		await store.reload('moza-site');
		expect(store.status('moza-site')).toMatchObject({
			available: true,
			errors: [NOT_INSTALLED(MOZA)]
		});
		expect(store.retrying()).toEqual(['moza-site']);

		forge.setInstalled(MOZA, true);
		forge.failNext('repository', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await store.reload('moza-site');
		expect(store.status('moza-site')?.errors).toEqual([UNREACHABLE]);
		expect(log.warn).toHaveBeenCalledWith('config.site_unreachable', {
			site: 'moza-site',
			error: 'ForgeError',
			status: 502
		});

		await store.reload('moza-site');
		expect(store.status('moza-site')?.errors).toEqual([]);
		expect(store.retrying()).toEqual([]);
	});

	it('keeps what it had, and throws, when the registry cannot be read', async () => {
		await store.load();
		vi.spyOn(team, 'sites').mockRejectedValueOnce(new Error('database down'));
		await expect(store.load()).rejects.toThrow('database down');
		expect(store.sites()).toHaveLength(2);
		expect(store.state()).toEqual({
			loadedAt: 1,
			lastError: 'De lijst met sites kon niet worden gelezen.'
		});
		await store.load();
		expect(store.state().lastError).toBeNull();
	});

	it('adds a site that joined the registry, and drops one that left it, on a reload', async () => {
		await store.load();
		await team.addSite(site('oude-site', 3, OUD), startingSettings('Oud'), null, null);
		await store.reload('oude-site');
		expect(store.statuses().map((s) => s.site.id)).toEqual([
			'digi-handboek',
			'moza-site',
			'oude-site'
		]);
		await team.removeSite('moza-site', 'platform');
		await store.reload('moza-site');
		expect(store.status('moza-site')).toBeUndefined();
		expect(store.site('moza-site')).toBeUndefined();
	});

	it('reads at most four sites at a time', async () => {
		for (let i = 0; i < 10; i++) {
			const repo = `Org/site-${i}`;
			forge.seedRepo(repo, 'main', files('kennisbank', ['site.yaml', 'schema.yaml']), {
				id: 100 + i
			});
			await team.addSite(site(`site-${i}`, 100 + i, repo), startingSettings(repo), null, null);
		}
		let busy = 0;
		let most = 0;
		const lookup = forge.repository.bind(forge);
		vi.spyOn(forge, 'repository').mockImplementation(async (repo) => {
			most = Math.max(most, ++busy);
			await new Promise((resolve) => setTimeout(resolve, 5));
			busy--;
			return lookup(repo);
		});
		await store.load();
		expect(store.sites()).toHaveLength(12);
		expect(most).toBe(4);
	});
});
