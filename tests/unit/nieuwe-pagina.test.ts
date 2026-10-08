import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseSchemaYaml } from '../../src/lib/config/types';
import {
	draftKey,
	filePreview,
	isoDate,
	startFrontmatter,
	startText,
	templateFor
} from '../../src/routes/sites/[site]/nieuw/new-page';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { actions } from '../../src/routes/sites/[site]/nieuw/+page.server';
import { load as editorLoad } from '../../src/routes/sites/[site]/bewerken/[...pad]/+page.server';

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
	it('shows a long file name capped, as the server will name it', () => {
		expect(filePreview(handboek, null, 'kennis', 'woord '.repeat(40), today)).toBe(
			`kennis/${'woord-'.repeat(12)}woord.md`
		);
	});
});

describe('the starting text of a page from an outline', () => {
	it('puts the outline under the template with the title', () => {
		expect(startText(templateFor(handboek, null), 'Koffie', '\n## Waar\n\nHier.\n\n')).toBe(
			'# Koffie\n\n## Waar\n\nHier.\n'
		);
		expect(startText(templateFor(moza, 'Weekly'), 'Koffie', '## Waar')).toBe('## Waar\n');
	});
	it('falls back to an h1 for a site that takes the title from it', () => {
		const zonder = { ...handboek, 'nieuwe-pagina': { mappen: ['kennis'] } };
		expect(templateFor(zonder, null)).toBe('# {titel}\n\n');
	});
	it('fills the title field where the title is a property', () => {
		expect(startFrontmatter(moza, 'Koffie')).toEqual({ title: 'Koffie' });
		expect(startFrontmatter(handboek, 'Koffie')).toEqual({});
	});
	it('uses the key of the editor draft for a page without a branch', () => {
		expect(draftKey('digi-handboek', 'kennis/koffie.md')).toBe(
			'schrijver:digi-handboek:new:kennis/koffie.md'
		);
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

	it('opens the editor and passes on that an outline comes along', async () => {
		const met = (await submit('digi-handboek', { map: 'kennis', titel: 'Koffie', opzet: '1' })) as {
			location: string;
		};
		expect(met.location).toBe(
			'/sites/digi-handboek/bewerken/kennis/koffie.md?nieuw=1&map=kennis&titel=Koffie&opzet=1'
		);
		const zonder = (await submit('digi-handboek', { map: 'kennis', titel: 'Koffie' })) as {
			location: string;
		};
		expect(zonder.location).not.toContain('opzet');
	});

	it('refuses a title above 300 characters, keeping what was typed', async () => {
		const titel = 'a'.repeat(301);
		expect(await submit('digi-handboek', { map: 'kennis', titel })).toMatchObject({
			status: 400,
			data: { error: 'De titel is te lang: gebruik hoogstens 300 tekens', veld: 'titel', titel }
		});
	});

	it('takes a title of 300 characters and names the file with at most 80', async () => {
		const titel = `${'woord '.repeat(49)}xxxxxx`;
		expect(titel).toHaveLength(300);
		const { location } = (await submit('digi-handboek', { map: 'kennis', titel })) as {
			location: string;
		};
		expect(
			location.startsWith(`/sites/digi-handboek/bewerken/kennis/${'woord-'.repeat(12)}woord.md?`)
		).toBe(true);
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

	it('starts from the same template as the editor', async () => {
		for (const [site, soort, map, title] of [
			['digi-handboek', null, 'kennis', 'Koffie'],
			['moza-site', 'Onderwerp', 'onderwerpen', 'Koffie']
		] as const) {
			const pad = filePreview(site === 'moza-site' ? moza : handboek, soort, map, title, today)!;
			const query = new URLSearchParams({ nieuw: '1', map, titel: title });
			if (soort) query.set('soort', soort);
			const data = (await editorLoad({
				params: { site, pad },
				url: new URL(`http://x/sites/${site}/bewerken/${pad}?${query}`)
			} as never)) as { body: string; frontmatter: Record<string, unknown> };
			const s = site === 'moza-site' ? moza : handboek;
			expect(templateFor(s, soort).replaceAll('{titel}', title)).toBe(data.body);
			expect(startFrontmatter(s, title)).toEqual(data.frontmatter);
		}
	});
});
