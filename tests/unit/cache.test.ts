import { describe, expect, it, vi } from 'vitest';
import { CachingForge, LruMap } from '$lib/forge/cache';
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

	it('keys repositories case-insensitively', async () => {
		const { cache, readFile } = setup();
		await cache.readFile('o/site', 'main', 'a.md');
		await cache.readFile('O/Site', 'main', 'a.md');
		expect(readFile).toHaveBeenCalledTimes(1);
		cache.invalidate('O/SITE');
		await cache.readFile('o/site', 'main', 'a.md');
		expect(readFile).toHaveBeenCalledTimes(2);
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

	it('reads a deleted file as gone once the commit is through', async () => {
		const { cache } = setup();
		expect(await cache.readFile('o/site', 'main', 'docs/b.md')).not.toBeNull();
		expect(await cache.readTree('o/site', 'main', '')).toHaveLength(2);
		await cache.commit('o/site', 'main', [{ path: 'docs/b.md', deleted: true }], 'weg');
		expect(await cache.readFile('o/site', 'main', 'docs/b.md')).toBeNull();
		expect((await cache.readTree('o/site', 'main', '')).map((e) => e.path)).toEqual(['a.md']);
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

	it('caches pull request lists briefly and drops them on a write', async () => {
		const { fake, cache, advance } = setup();
		const listPrs = vi.spyOn(fake, 'listPrs');
		await cache.listPrs('o/site', 'open');
		await cache.listPrs('o/site', 'open');
		expect(listPrs).toHaveBeenCalledTimes(1);
		advance(15001);
		await cache.listPrs('o/site', 'open');
		expect(listPrs).toHaveBeenCalledTimes(2);
		await cache.createBranch('o/site', 'main', 'x');
		await cache.listPrs('o/site', 'open');
		expect(listPrs).toHaveBeenCalledTimes(3);
	});

	it('asks the forge every time for the review decision and the conversation', async () => {
		const { fake, cache } = setup();
		await fake.createBranch('o/site', 'main', 'p');
		const pr = await fake.openDraftPr('o/site', 'p', 'main', 'P', '');
		const spies = [
			vi.spyOn(fake, 'reviewDecision'),
			vi.spyOn(fake, 'prComments'),
			vi.spyOn(fake, 'prReviews')
		];
		for (let i = 0; i < 2; i++) {
			await cache.reviewDecision('o/site', pr.number);
			await cache.prComments('o/site', pr.number);
			await cache.prReviews('o/site', pr.number);
		}
		for (const spy of spies) expect(spy).toHaveBeenCalledTimes(2);
	});

	it('drops what it holds of a repository when a label is added or taken off', async () => {
		const { fake, cache } = setup();
		await fake.createBranch('o/site', 'main', 'p');
		const pr = await fake.openDraftPr('o/site', 'p', 'main', 'P', '');
		const listPrs = vi.spyOn(fake, 'listPrs');
		await cache.listPrs('o/site', 'open');
		await cache.addLabel('o/site', pr.number, 'preview');
		expect((await cache.listPrs('o/site', 'open'))[0].labels).toEqual(['preview']);
		await cache.removeLabel('o/site', pr.number, 'preview');
		expect((await cache.listPrs('o/site', 'open'))[0].labels).toEqual([]);
		expect(listPrs).toHaveBeenCalledTimes(3);
	});

	it('passes the head sha on to merge', async () => {
		const { fake, cache } = setup();
		const merge = vi.spyOn(fake, 'merge').mockResolvedValue();
		await cache.merge('o/site', 1, 'm', 'abc1234');
		expect(merge).toHaveBeenCalledWith('o/site', 1, 'm', 'abc1234');
	});
});

describe('LruMap', () => {
	const lru = () => new LruMap<string>(10, (value) => value.length);

	it('drops the least recently used entries once the weight passes the budget', () => {
		const map = lru();
		map.set('a', 'xx');
		map.set('b', 'xx');
		expect(map.get('a')).toBe('xx');
		map.set('c', 'xxxx');
		expect(map.get('b')).toBeUndefined();
		expect(map.get('a')).toBe('xx');
		expect(map.get('c')).toBe('xxxx');
	});

	it('keeps nothing heavier than the whole budget, and replaces a key', () => {
		const map = lru();
		map.set('a', 'x'.repeat(10));
		expect(map.get('a')).toBeUndefined();
		map.set('a', 'xx');
		map.set('a', 'yyy');
		expect(map.get('a')).toBe('yyy');
		map.clear();
		expect(map.get('a')).toBeUndefined();
	});
});

describe('CachingForge reading past the cache', () => {
	it('neither serves nor keeps an uncached read', async () => {
		const { cache, readFile } = setup();
		await cache.readFile('o/site', 'main', 'a.md');
		await cache.readFile('o/site', 'main', 'a.md', { uncached: true });
		await cache.readFile('o/site', 'main', 'docs/b.md', { uncached: true });
		await cache.readFile('o/site', 'main', 'docs/b.md');
		expect(readFile).toHaveBeenCalledTimes(4);
	});
});
