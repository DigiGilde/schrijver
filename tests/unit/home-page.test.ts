import { afterEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../../src/lib/config/load';
import { setConfigStore } from '../../src/lib/server/services';
import { load } from '../../src/routes/+page.server';

const failing = new ConfigStore({
	readFile: async () => {
		throw new Error('Not Found');
	},
	listFiles: async () => []
});

afterEach(() => setConfigStore(null));

describe('home page', () => {
	it('reports a configuration that could not be loaded', async () => {
		await failing.load();
		setConfigStore(failing);
		const data = (await load({} as never)) as { configNotLoaded: boolean; sites: unknown[] };
		expect(data).toEqual({ configNotLoaded: true, sites: [] });
	});

	it('says nothing before a first load was attempted', async () => {
		setConfigStore(new ConfigStore({ readFile: async () => null, listFiles: async () => [] }));
		const data = (await load({} as never)) as { configNotLoaded: boolean };
		expect(data.configNotLoaded).toBe(false);
	});
});
