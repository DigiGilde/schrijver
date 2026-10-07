import { describe, expect, it, vi } from 'vitest';
import { CachingForge } from '$lib/forge/cache';
import { FakeForge } from '$lib/forge/fake';

function setup() {
	const fake = new FakeForge();
	fake.seedRepo('o/site', 'main', { 'a.md': 'one', 'docs/b.md': 'two' });
	const readFile = vi.spyOn(fake, 'readFile');
	const readTree = vi.spyOn(fake, 'readTree');
	let now = 1000;
	const cache = new CachingForge(fake, 60000, () => now);
	return { fake, cache, readFile, readTree, advance: (ms: number) => (now += ms) };
}

describe('CachingForge', () => {
	it('serves a second readTree from cache', async () => {
		const { cache, readTree } = setup();
		await cache.readTree('o/site', 'main', '');
		await cache.readTree('o/site', 'main', '');
		expect(readTree).toHaveBeenCalledTimes(1);
	});

	it('serves a second readFile from cache', async () => {
		const { cache, readFile } = setup();
		await cache.readFile('o/site', 'main', 'a.md');
		await cache.readFile('o/site', 'main', 'a.md');
		expect(readFile).toHaveBeenCalledTimes(1);
	});

	it('refetches after the TTL', async () => {
		const { cache, readFile, advance } = setup();
		await cache.readFile('o/site', 'main', 'a.md');
		advance(60001);
		await cache.readFile('o/site', 'main', 'a.md');
		expect(readFile).toHaveBeenCalledTimes(2);
	});

	it('refetches after invalidate(repo)', async () => {
		const { cache, readFile, readTree } = setup();
		await cache.readFile('o/site', 'main', 'a.md');
		await cache.readTree('o/site', 'main', '');
		cache.invalidate('o/site');
		await cache.readFile('o/site', 'main', 'a.md');
		await cache.readTree('o/site', 'main', '');
		expect(readFile).toHaveBeenCalledTimes(2);
		expect(readTree).toHaveBeenCalledTimes(2);
	});

	it('coalesces concurrent identical reads', async () => {
		const { cache, readFile } = setup();
		const [a, b] = await Promise.all([
			cache.readFile('o/site', 'main', 'a.md'),
			cache.readFile('o/site', 'main', 'a.md')
		]);
		expect(readFile).toHaveBeenCalledTimes(1);
		expect(a).toEqual(b);
	});

	it('does not cache failures', async () => {
		const { cache, readFile } = setup();
		readFile.mockRejectedValueOnce(new Error('boom'));
		await expect(cache.readFile('o/site', 'main', 'a.md')).rejects.toThrow('boom');
		await expect(cache.readFile('o/site', 'main', 'a.md')).resolves.not.toBeNull();
	});

	it('invalidates the repo on a write', async () => {
		const { cache, readFile } = setup();
		await cache.readFile('o/site', 'main', 'a.md');
		await cache.createBranch('o/site', 'main', 'feat');
		const res = await cache.commit('o/site', 'feat', [{ path: 'a.md', content: 'new' }], 'msg');
		expect(res.sha).toBeTruthy();
		const f = await cache.readFile('o/site', 'feat', 'a.md');
		expect(new TextDecoder().decode(f!.content)).toBe('new');
		await cache.readFile('o/site', 'main', 'a.md');
		expect(readFile).toHaveBeenCalledTimes(3);
	});

	it('keeps other repos cached on invalidate', async () => {
		const { fake, cache, readFile } = setup();
		fake.seedRepo('o/other', 'main', { 'x.md': 'x' });
		await cache.readFile('o/other', 'main', 'x.md');
		cache.invalidate('o/site');
		await cache.readFile('o/other', 'main', 'x.md');
		expect(readFile).toHaveBeenCalledTimes(1);
	});

	it('caches isPublic per repo until the TTL passes', async () => {
		const { fake, cache, advance } = setup();
		const spy = vi.spyOn(fake, 'isPublic');
		fake.setPublic('o/site', true);
		expect(await cache.isPublic('o/site')).toBe(true);
		fake.setPublic('o/site', false);
		expect(await cache.isPublic('o/site')).toBe(true);
		expect(spy).toHaveBeenCalledTimes(1);
		advance(60001);
		expect(await cache.isPublic('o/site')).toBe(false);
	});
});
