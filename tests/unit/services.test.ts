import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startingSettings } from '$lib/auth/team';
import { MemoryTeamStore } from '$lib/auth/team-memory';
import { useTeamStore } from '$lib/auth/team-store';
import { ConfigStore, NOT_INSTALLED } from '$lib/config/load';
import { CachingForge } from '$lib/forge/cache';
import { FakeForge } from '$lib/forge/fake';
import { ForgeError } from '$lib/forge/types';
import { structureFile } from './sites-fixture';

vi.mock('$lib/log', async (original) => ({
	...(await original<typeof import('$lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const { log } = await import('$lib/log');
const services = await import('$lib/server/services');
const { POST } = await import('../../src/routes/api/webhook/github/+server');

const MOZA = 'MinBZK/moza-site';
const structure = () =>
	Object.fromEntries(
		['site.yaml', 'schema.yaml'].map((name) => [
			`.schrijver/${name}`,
			structureFile('moza-site', name)
		])
	);

/** A signed delivery of GitHub's webhook. */
function webhook(event: string, payload: unknown) {
	const body = JSON.stringify(payload);
	const sig = 'sha256=' + createHmac('sha256', 's').update(body).digest('hex');
	return POST({
		request: new Request('http://x', {
			method: 'POST',
			body,
			headers: { 'x-github-event': event, 'x-hub-signature-256': sig }
		})
	} as never);
}

let fake: FakeForge;
let team: MemoryTeamStore;

beforeEach(async () => {
	process.env.GITHUB_WEBHOOK_SECRET = 's';
	vi.useFakeTimers();
	fake = new FakeForge();
	fake.seedRepo(MOZA, 'main', structure(), { id: 2 });
	team = new MemoryTeamStore();
	await team.addSite(
		{ id: 'moza-site', repoId: 2, repo: MOZA, standaardbranch: 'main' },
		startingSettings('MOZa'),
		null,
		null
	);
	useTeamStore(team);
});
afterEach(() => {
	services.stopServices();
	services.setForge(null);
	services.setConfigStore(null);
	useTeamStore(undefined);
	vi.useRealTimers();
	vi.clearAllMocks();
});

/** A store over the test's registry whose load waits until the test lets it go. */
function heldStore() {
	const store = new ConfigStore(team, () => fake);
	const held: (() => void)[] = [];
	const hold = () => new Promise<void>((resolve) => held.push(resolve));
	const load = vi.spyOn(store, 'load').mockImplementation(hold);
	const reload = vi.spyOn(store, 'reload').mockImplementation(hold);
	return { store, load, reload, release: () => held.shift()!() };
}

describe('services', () => {
	it('reads the sites from the registry, with a real CachingForge, and a push reloads one', async () => {
		services.setForge(new CachingForge(fake));
		await services.initServices();
		expect(services.getConfigStore().site('moza-site')?.preview.soort).toBe('bij-label');
		expect(log.info).toHaveBeenCalledWith('config.loaded', { sites: 1, available: 1 });

		await fake.commit(
			MOZA,
			'main',
			[{ path: '.schrijver/site.yaml', content: structureFile('kennisbank', 'site.yaml') }],
			'm'
		);
		const body = JSON.stringify({
			ref: 'refs/heads/main',
			repository: { id: 2, full_name: MOZA, default_branch: 'main' }
		});
		const sig = 'sha256=' + createHmac('sha256', 's').update(body).digest('hex');
		const res = await POST({
			request: new Request('http://x', {
				method: 'POST',
				body,
				headers: { 'x-github-event': 'push', 'x-hub-signature-256': sig }
			})
		} as never);
		expect(res.status).toBe(204);
		expect(services.getConfigStore().site('moza-site')?.preview.soort).toBe('geen');
	});

	it('initServices is idempotent', async () => {
		services.setForge(fake);
		const a = services.initServices();
		const store = services.getConfigStore();
		const b = services.initServices();
		await Promise.all([a, b]);
		expect(services.getConfigStore()).toBe(store);
	});

	it('runs one more whole load when a reload arrives during one', async () => {
		const { store, load, release } = heldStore();
		services.setConfigStore(store);
		const p1 = services.reloadConfig();
		const p2 = services.reloadConfig();
		const p3 = services.reloadConfig();
		release();
		await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		release();
		await Promise.all([p1, p2, p3]);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('runs the loads of single sites one at a time, after a whole load that runs', async () => {
		const { store, load, reload, release } = heldStore();
		services.setConfigStore(store);
		const whole = services.reloadConfig();
		const one = services.reloadSite('moza-site');
		const again = services.reloadSite('moza-site');
		const other = services.reloadSite('digi-handboek');
		expect(reload).not.toHaveBeenCalled();
		release();
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
		release();
		await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
		release();
		await Promise.all([whole, one, again, other]);
		expect(load).toHaveBeenCalledTimes(1);
		expect(reload.mock.calls).toEqual([['moza-site'], ['digi-handboek']]);
	});

	it('prepares every read of the registry, and tries again in a minute when that fails', async () => {
		services.setForge(fake);
		const prepare = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(Object.assign(new Error('geen database'), { code: 'ECONNREFUSED' }))
			.mockResolvedValue(undefined);
		await services.initServices(prepare);
		expect(services.getConfigStore().sites()).toEqual([]);
		expect(log.error).toHaveBeenCalledWith('config.load_failed', {
			error: 'Error',
			code: 'ECONNREFUSED'
		});
		await vi.advanceTimersByTimeAsync(60000);
		expect(prepare).toHaveBeenCalledTimes(2);
		expect(
			services
				.getConfigStore()
				.sites()
				.map((s) => s.id)
		).toEqual(['moza-site']);
		await vi.advanceTimersByTimeAsync(120000);
		expect(prepare).toHaveBeenCalledTimes(2);
	});

	it('tries again while a site cannot be read from GitHub, and not after stopServices', async () => {
		services.setForge(fake);
		fake.failNext('repository', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await services.initServices();
		expect(services.getConfigStore().site('moza-site')).toBeUndefined();
		await vi.advanceTimersByTimeAsync(60000);
		expect(services.getConfigStore().site('moza-site')).toBeDefined();

		fake.setInstalled(MOZA, false);
		await services.reloadSite('moza-site');
		const load = vi.spyOn(services.getConfigStore(), 'load');
		const reload = vi.spyOn(services.getConfigStore(), 'reload');
		services.stopServices();
		await vi.advanceTimersByTimeAsync(120000);
		expect(load).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it('keeps reading after a retry that finds nothing left to read', async () => {
		services.setForge(fake);
		fake.failNext('repository', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await services.initServices();
		await services.reloadSite('moza-site');
		expect(services.getConfigStore().site('moza-site')).toBeDefined();
		await vi.advanceTimersByTimeAsync(60_000);

		await fake.commit(
			MOZA,
			'main',
			[{ path: '.schrijver/site.yaml', content: structureFile('kennisbank', 'site.yaml') }],
			'm'
		);
		await services.reloadSite('moza-site');
		expect(services.getConfigStore().site('moza-site')?.preview.soort).toBe('geen');
	});

	it('reads every site again every quarter of an hour, so a missed webhook cannot keep a site open', async () => {
		fake.setPublic(MOZA, true);
		services.setForge(fake);
		await services.initServices();
		expect(services.getConfigStore().status('moza-site')?.isPublic).toBe(true);

		fake.setPublic(MOZA, false);
		await vi.advanceTimersByTimeAsync(14 * 60_000);
		expect(services.getConfigStore().status('moza-site')?.isPublic).toBe(true);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(services.getConfigStore().status('moza-site')?.isPublic).toBe(false);

		const load = vi.spyOn(services.getConfigStore(), 'load');
		services.stopServices();
		await vi.advanceTimersByTimeAsync(30 * 60_000);
		expect(load).not.toHaveBeenCalled();
	});

	it('tries again every minute only the sites that could not be read, not every site', async () => {
		fake.seedRepo('Org/weg', 'main', structure(), { id: 3, installed: false });
		await team.addSite(
			{ id: 'weg', repoId: 3, repo: 'Org/weg', standaardbranch: 'main' },
			startingSettings('Weg'),
			null,
			null
		);
		services.setForge(fake);
		await services.initServices();
		expect(services.getConfigStore().status('weg')?.errors).toEqual([NOT_INSTALLED('Org/weg')]);
		const repository = vi.spyOn(fake, 'repository');
		const load = vi.spyOn(services.getConfigStore(), 'load');
		await vi.advanceTimersByTimeAsync(60000);
		expect(repository.mock.calls).toEqual([['Org/weg']]);
		expect(load).not.toHaveBeenCalled();

		fake.setInstalled('Org/weg', true);
		await vi.advanceTimersByTimeAsync(60000);
		expect(repository.mock.calls).toEqual([['Org/weg'], ['Org/weg']]);
		expect(services.getConfigStore().status('weg')).toMatchObject({ available: true, errors: [] });
		await vi.advanceTimersByTimeAsync(120000);
		expect(repository).toHaveBeenCalledTimes(2);
	});

	it('shows a site whose App was removed as a problem at once, and takes it back at once', async () => {
		services.setForge(new CachingForge(fake));
		await services.initServices();
		const change = (action: 'added' | 'removed') => ({
			action,
			repositories_added: [],
			repositories_removed: [],
			[`repositories_${action}`]: [{ id: 2, name: 'moza-site', full_name: MOZA, private: false }]
		});

		fake.setInstalled(MOZA, false);
		expect((await webhook('installation_repositories', change('removed'))).status).toBe(204);
		expect(services.getConfigStore().status('moza-site')).toMatchObject({
			available: true,
			errors: [NOT_INSTALLED(MOZA)]
		});

		fake.setInstalled(MOZA, true);
		await webhook('installation_repositories', change('added'));
		expect(services.getConfigStore().status('moza-site')).toMatchObject({
			available: true,
			errors: []
		});
	});

	it('follows a renamed repository at once, also when another one takes its old name', async () => {
		services.setForge(new CachingForge(fake));
		await services.initServices();
		fake.renameRepo(MOZA, 'MinBZK/moza-nieuw');
		fake.seedRepo(MOZA, 'main', structure(), { id: 99 });
		const renamed = {
			action: 'renamed',
			changes: { repository: { name: { from: 'moza-site' } } },
			repository: { id: 2, full_name: 'MinBZK/moza-nieuw', default_branch: 'main' }
		};
		expect((await webhook('repository', renamed)).status).toBe(204);
		expect(services.getConfigStore().status('moza-site')).toMatchObject({
			available: true,
			errors: [],
			site: { repo: 'MinBZK/moza-nieuw', repoId: 2 }
		});
		expect(services.getConfigStore().site('moza-site')?.repo).toBe('MinBZK/moza-nieuw');
	});

	it('logs a site whose files are not valid by its id and the number of problems only', async () => {
		services.setForge(fake);
		await fake.commit(MOZA, 'main', [{ path: '.schrijver/site.yaml', content: 'naam: x\n' }], 'm');
		await services.initServices();
		expect(log.warn).toHaveBeenCalledWith('config.site_invalid', { site: 'moza-site', errors: 3 });
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain('naam');
	});

	it('a load finishing after stop does not re-arm the timer', async () => {
		const { store, load, release } = heldStore();
		services.setConfigStore(store);
		const p = services.reloadConfig();
		services.stopServices();
		release();
		await p;
		await vi.advanceTimersByTimeAsync(120000);
		expect(load).toHaveBeenCalledTimes(1);
	});
});
