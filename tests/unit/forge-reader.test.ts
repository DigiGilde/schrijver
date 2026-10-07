import { describe, expect, it } from 'vitest';
import { forgeConfigReader } from '$lib/config/forge-reader';
import { FakeForge } from '$lib/forge/fake';

const fake = new FakeForge();
fake.seedRepo('o/config', 'main', {
	'sites.yaml': 'hello',
	'schemas/a.yaml': 'a',
	'schemas/sub/b.yaml': 'b',
	'other/c.yaml': 'c'
});

describe('forgeConfigReader', () => {
	const reader = forgeConfigReader(fake, 'o/config');

	it('reads a file as utf8', async () => {
		expect(await reader.readFile('sites.yaml')).toBe('hello');
	});

	it('returns null for a missing file', async () => {
		expect(await reader.readFile('nope.yaml')).toBeNull();
	});

	it('lists paths relative to dir', async () => {
		expect((await reader.listFiles('schemas')).sort()).toEqual(['a.yaml', 'sub/b.yaml']);
	});

	it('honours an explicit ref', async () => {
		await fake.createBranch('o/config', 'main', 'next');
		await fake.commit('o/config', 'next', [{ path: 'sites.yaml', content: 'on next' }], 'm');
		const r = forgeConfigReader(fake, 'o/config', 'next');
		expect(await r.readFile('sites.yaml')).toBe('on next');
		expect(await reader.readFile('sites.yaml')).toBe('hello');
	});
});
