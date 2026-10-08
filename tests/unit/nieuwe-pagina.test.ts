import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseSchemaYaml } from '../../src/lib/config/types';
import { filePreview, isoDate } from '../../src/routes/sites/[site]/nieuw/new-page';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { actions } from '../../src/routes/sites/[site]/nieuw/+page.server';

const schema = (name: string) =>
	parseSchemaYaml(readFileSync(`tests/fixtures/config/schemas/${name}.yaml`, 'utf8'));
const moza = schema('moza-site');
const handboek = schema('digi-handboek');
const today = '2026-10-08';

describe('isoDate', () => {
	it('gives the local date, as the server names a new file', () => {
		expect(isoDate(new Date(2026, 9, 8, 23, 59))).toBe('2026-10-08');
		expect(isoDate(new Date(2026, 0, 2))).toBe('2026-01-02');
	});
});

describe('filePreview', () => {
	it('names the file as the server does', () => {
		expect(filePreview(handboek, null, 'kennis', 'Mijn pagina', today)).toBe(
			'kennis/mijn-pagina.md'
		);
		expect(filePreview(moza, 'Onderwerp', 'onderwerpen', 'Één loket', today)).toBe(
			'onderwerpen/een-loket.md'
		);
		expect(filePreview(moza, 'Weekly', '', 'Wat dan ook', today)).toBe('weekly/2026/2026-10-08.md');
	});
	it('waits for a title only when the name comes from it', () => {
		expect(filePreview(handboek, null, 'kennis', ' ?! ', today)).toBeNull();
		expect(filePreview(moza, 'Weekly', '', '', today)).toBe('weekly/2026/2026-10-08.md');
	});
	it('refuses a folder the schema does not allow', () => {
		expect(() => filePreview(handboek, null, 'elders', 'x', today)).toThrow();
	});
});

describe('the new-page form on the server', () => {
	beforeAll(async () => {
		const services = await buildFakeServices();
		setForge(services.forge);
		setConfigStore(services.store);
	});

	async function submit(site: string, fields: Record<string, string>) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.set(k, v);
		const request = new Request(`http://x/sites/${site}/nieuw`, { method: 'POST', body });
		try {
			return await actions.default({ request, params: { site } } as never);
		} catch (thrown) {
			return thrown as { status: number; location: string };
		}
	}

	it('opens the editor for a new file', async () => {
		const result = (await submit('digi-handboek', { map: 'kennis', titel: 'Koffie' })) as {
			location: string;
		};
		expect(result.location).toBe(
			'/sites/digi-handboek/bewerken/kennis/koffie.md?nieuw=1&map=kennis&titel=Koffie'
		);
	});

	it('refuses a file that already exists, keeping the title', async () => {
		const result = await submit('digi-handboek', { map: 'onboarding', titel: 'Accounts' });
		expect(result).toMatchObject({
			status: 409,
			data: {
				error: 'Er is al een pagina met het bestand onboarding/accounts.md',
				titel: 'Accounts'
			}
		});
	});
});
