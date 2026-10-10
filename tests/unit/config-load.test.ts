import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigStore, UnknownSiteError, type ConfigReader } from '../../src/lib/config/load';

const fixture = (p: string) => readFileSync(`tests/fixtures/config/${p}`, 'utf8');

function memoryReader(files: Map<string, string>): ConfigReader {
	return {
		async readFile(path) {
			return files.get(path) ?? null;
		},
		async listFiles(dir) {
			return [...files.keys()].filter((p) => p.startsWith(`${dir}/`));
		}
	};
}

function fixtureFiles() {
	return new Map([
		['sites.yaml', fixture('sites.yaml')],
		['schemas/digi-handboek.yaml', fixture('schemas/digi-handboek.yaml')],
		['schemas/moza-site.yaml', fixture('schemas/moza-site.yaml')],
		['schrijfwijzer/moza-site.md', fixture('schrijfwijzer/moza-site.md')]
	]);
}

describe('ConfigStore', () => {
	it('loads sites, schemas and schrijfwijzers', async () => {
		const store = new ConfigStore(memoryReader(fixtureFiles()), () => 42);
		await store.load();
		expect(store.sites().map((s) => s.id)).toEqual(['digi-handboek', 'moza-site']);
		expect(store.site('moza-site')?.repo).toBe('MinBZK/moza-site');
		expect(store.site('nope')).toBeUndefined();
		expect(store.schema('moza-site')).toBeTruthy();
		expect(store.schrijfwijzer('moza-site')).toBe(fixture('schrijfwijzer/moza-site.md'));
		expect(store.schrijfwijzer('digi-handboek')).toBe('');
		expect(store.state()).toEqual({ loadedAt: 42, lastError: null });
	});

	it('starts unloaded', () => {
		const store = new ConfigStore(memoryReader(new Map()));
		expect(store.sites()).toEqual([]);
		expect(store.state()).toEqual({ loadedAt: null, lastError: null });
	});

	it('keeps the previous state when sites.yaml is broken', async () => {
		const files = fixtureFiles();
		let now = 1;
		const store = new ConfigStore(memoryReader(files), () => now++);
		await store.load();
		files.set('sites.yaml', 'id: [unclosed');
		await store.load();
		expect(store.sites().map((s) => s.id)).toEqual(['digi-handboek', 'moza-site']);
		const { loadedAt, lastError } = store.state();
		expect(loadedAt).toBe(1);
		expect(lastError).toContain('sites.yaml');
		expect(lastError).not.toContain('\n');
	});

	it('names the field and what is wrong with it when sites.yaml does not validate', async () => {
		const files = fixtureFiles();
		files.set(
			'sites.yaml',
			fixture('sites.yaml').replace(
				'adres: https://mijnoverheidzakelijk.nl/',
				'adres: mijnoverheidzakelijk.nl'
			)
		);
		const store = new ConfigStore(memoryReader(files));
		await store.load();
		expect(store.state().lastError).toBe(
			'sites.yaml: 1.adres: must be a web address such as https://example.org (a starting value: once the site has its settings in Schrijver, those apply)'
		);
	});

	it('keeps the previous state when a schema file is missing', async () => {
		const files = fixtureFiles();
		const store = new ConfigStore(memoryReader(files));
		await store.load();
		files.delete('schemas/moza-site.yaml');
		await store.load();
		expect(store.schema('moza-site')).toBeTruthy();
		expect(store.state().lastError).toContain('schemas/moza-site.yaml');
	});

	it('keeps the previous state when the reader throws, and recovers', async () => {
		const files = fixtureFiles();
		let fail = false;
		const base = memoryReader(files);
		const store = new ConfigStore({
			readFile: (p) => (fail ? Promise.reject(new Error('boom')) : base.readFile(p)),
			listFiles: (d) => base.listFiles(d)
		});
		await store.load();
		fail = true;
		await store.load();
		expect(store.sites()).toHaveLength(2);
		expect(store.state().lastError).toContain('boom');
		fail = false;
		await store.load();
		expect(store.state().lastError).toBeNull();
	});

	it('fails when sites.yaml is absent on first load', async () => {
		const store = new ConfigStore(memoryReader(new Map()));
		await store.load();
		expect(store.sites()).toEqual([]);
		expect(store.state().lastError).toContain('sites.yaml');
	});

	it('throws UnknownSiteError for unknown ids', async () => {
		const store = new ConfigStore(memoryReader(fixtureFiles()));
		await store.load();
		expect(() => store.schema('nope')).toThrow(UnknownSiteError);
		expect(() => store.schrijfwijzer('nope')).toThrow(UnknownSiteError);
	});
});
