import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigStore } from '$lib/config/load';
import { CachingForge } from '$lib/forge/cache';
import { FakeForge } from '$lib/forge/fake';

vi.mock('$lib/log', async (original) => ({
	...(await original<typeof import('$lib/log')>()),
	log: { info: () => {}, warn: () => {}, error: () => {} }
}));

const services = await import('$lib/server/services');
const { POST } = await import('../../src/routes/api/webhook/github/+server');

const fixture = (p: string) => readFileSync(`tests/fixtures/config/${p}`, 'utf8');
const configFiles = () => ({
	'sites.yaml': fixture('sites.yaml'),
	'schemas/digi-handboek.yaml': fixture('schemas/digi-handboek.yaml'),
	'schemas/moza-site.yaml': fixture('schemas/moza-site.yaml'),
	'schrijfwijzer/moza-site.md': fixture('schrijfwijzer/moza-site.md')
});

beforeEach(() => {
	process.env.GITHUB_CONFIG_REPO = 'o/config';
	process.env.GITHUB_WEBHOOK_SECRET = 's';
	vi.useFakeTimers();
});
afterEach(() => {
	services.stopServices();
	services.setForge(null);
	services.setConfigStore(null);
	services.whenConfigLoaded(null);
	vi.useRealTimers();
});

describe('services', () => {
	it('config push through a real CachingForge picks up a changed sites.yaml', async () => {
		const fake = new FakeForge();
		fake.seedRepo('o/config', 'main', configFiles());
		services.setForge(new CachingForge(fake));
		await services.initServices();
		const before = services.getConfigStore().state();
		expect(before.lastError).toBeNull();
		expect(services.getConfigStore().sites()).toHaveLength(2);

		await fake.commit(
			'o/config',
			'main',
			[{ path: 'sites.yaml', content: fixture('sites.yaml').split('\n- ')[0] }],
			'm'
		);
		const body = JSON.stringify({ repository: { full_name: 'o/config' } });
		const sig = 'sha256=' + createHmac('sha256', 's').update(body).digest('hex');
		const res = await POST({
			request: new Request('http://x', {
				method: 'POST',
				body,
				headers: { 'x-github-event': 'push', 'x-hub-signature-256': sig }
			})
		} as never);
		expect(res.status).toBe(204);
		expect(services.getConfigStore().sites()).toHaveLength(1);
	});

	it('initServices is idempotent', async () => {
		const fake = new FakeForge();
		fake.seedRepo('o/config', 'main', configFiles());
		services.setForge(fake);
		const a = services.initServices();
		const store = services.getConfigStore();
		const b = services.initServices();
		await Promise.all([a, b]);
		expect(services.getConfigStore()).toBe(store);
	});

	it('runs another load when a reload arrives during one', async () => {
		const loads: (() => void)[] = [];
		const store = new ConfigStore({ readFile: async () => null, listFiles: async () => [] });
		const load = vi
			.spyOn(store, 'load')
			.mockImplementation(() => new Promise<void>((r) => loads.push(r)));
		services.setConfigStore(store);
		const p1 = services.reloadConfig();
		const p2 = services.reloadConfig();
		loads.shift()!();
		await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		loads.shift()!();
		await Promise.all([p1, p2]);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('retries after load() throws, and not after stopServices', async () => {
		const store = new ConfigStore({ readFile: async () => null, listFiles: async () => [] });
		const load = vi.spyOn(store, 'load').mockRejectedValue(new Error('boom'));
		services.setConfigStore(store);
		await services.reloadConfig();
		await vi.advanceTimersByTimeAsync(60000);
		expect(load).toHaveBeenCalledTimes(2);
		services.stopServices();
		await vi.advanceTimersByTimeAsync(120000);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('hands the sites of every successful load to the listener, and none of a failed one', async () => {
		const fake = new FakeForge();
		fake.seedRepo('o/config', 'main', configFiles());
		services.setForge(fake);
		const seen: string[][] = [];
		services.whenConfigLoaded(async (sites) => {
			seen.push(sites.map((s) => s.id));
		});
		await services.initServices();
		expect(seen).toEqual([['digi-handboek', 'moza-site']]);

		const store = new ConfigStore({ readFile: async () => null, listFiles: async () => [] });
		services.setConfigStore(store);
		await services.reloadConfig();
		expect(seen).toHaveLength(1);
	});

	it('retries the load when the listener fails', async () => {
		const fake = new FakeForge();
		fake.seedRepo('o/config', 'main', configFiles());
		services.setForge(fake);
		const listener = vi
			.fn()
			.mockRejectedValueOnce(new Error('db down'))
			.mockResolvedValue(undefined);
		services.whenConfigLoaded(listener);
		await services.initServices();
		expect(listener).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60000);
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it('a load finishing after stop does not re-arm the timer', async () => {
		let finish!: () => void;
		const store = new ConfigStore({ readFile: async () => null, listFiles: async () => [] });
		const load = vi
			.spyOn(store, 'load')
			.mockImplementation(() => new Promise<void>((r) => (finish = r)));
		services.setConfigStore(store);
		const p = services.reloadConfig();
		services.stopServices();
		finish();
		await p;
		await vi.advanceTimersByTimeAsync(120000);
		expect(load).toHaveBeenCalledTimes(1);
	});
});
