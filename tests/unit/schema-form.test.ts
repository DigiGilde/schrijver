import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSchemaYaml } from '../../src/lib/config/types';
import {
	applyForm,
	buildForm,
	emptyRequired,
	fieldLabel,
	newPagePath,
	pageTitle,
	summaryField,
	titleOf,
	validateForm,
	withValue
} from '../../src/lib/content/schema-form';

const load = (n: string) =>
	parseSchemaYaml(readFileSync(`tests/fixtures/config/schemas/${n}.yaml`, 'utf8'));
const moza = load('moza-site');
const handboek = load('digi-handboek');

describe('buildForm', () => {
	it('excludes hidden fields', () => {
		expect(buildForm(handboek, {}, 'content/kennis/a.md').map((f) => f.key)).toEqual([
			'description',
			'related'
		]);
	});
	it('applies alleen-in to the path', () => {
		const keys = (p: string) => buildForm(moza, {}, p).map((f) => f.key);
		expect(keys('content/weekly/2026/2026-10-07.md')).toContain('date');
		expect(keys('content/handboek/a.md')).not.toContain('date');
	});
	it('takes values from frontmatter', () => {
		const f = buildForm(moza, { title: 'X' }, 'content/a.md');
		expect(f[0]).toMatchObject({ key: 'title', value: 'X', error: null });
		expect(f[1].value).toBe('');
	});
});

describe('validateForm', () => {
	it('flags required empty fields by their label', () => {
		const r = validateForm(buildForm(moza, {}, 'content/a.md'));
		expect(r.ok).toBe(false);
		expect(r.fields.map((f) => f.error)).toEqual([
			'Titel is verplicht',
			'Beschrijving is verplicht'
		]);
	});
	it('checks datum, getal and max', () => {
		const schema = {
			...moza,
			velden: {
				d: { type: 'datum', verplicht: false, verborgen: false },
				n: { type: 'getal', verplicht: false, verborgen: false },
				r: { type: 'paginaverwijzing', verplicht: false, verborgen: false, meervoud: true, max: 2 }
			}
		} as typeof moza;
		const r = validateForm(
			buildForm(schema, { d: '7-10-2026', n: 'x', r: ['a', 'b', 'c'] }, 'a.md')
		);
		expect(r.fields.map((f) => f.error)).toEqual([
			'D moet de vorm JJJJ-MM-DD hebben',
			'N moet een getal zijn',
			'R mag maximaal 2 verwijzingen bevatten'
		]);
		const ok = validateForm(buildForm(schema, { d: '2026-10-07', n: 3, r: ['a'] }, 'a.md'));
		expect(ok.ok).toBe(true);
	});
});

describe('fieldLabel', () => {
	const def = { type: 'tekst', verplicht: false, verborgen: false } as const;

	it('gives common keys a Dutch label', () => {
		const labels = {
			title: 'Titel',
			description: 'Beschrijving',
			summary: 'Samenvatting',
			date: 'Datum',
			weight: 'Volgorde',
			tags: 'Tags',
			categories: 'Categorieën',
			draft: 'Niet publiceren',
			aliases: 'Andere adressen',
			slug: 'Adres',
			image: 'Afbeelding',
			author: 'Auteur'
		};
		for (const [key, label] of Object.entries(labels)) expect(fieldLabel({ key, def })).toBe(label);
	});

	it("keeps the schema's own label", () => {
		expect(fieldLabel({ key: 'description', def: { ...def, label: 'Samenvatting' } })).toBe(
			'Samenvatting'
		);
		expect(buildForm(handboek, {}, 'docs/a.md').map(fieldLabel)).toEqual([
			'Samenvatting',
			'Lees ook'
		]);
	});

	it('shows any other key with a capital', () => {
		expect(fieldLabel({ key: 'hero', def })).toBe('Hero');
		expect(fieldLabel({ key: 'constructor', def })).toBe('Constructor');
	});
});

describe('emptyRequired', () => {
	it('counts the required fields without a value', () => {
		expect(emptyRequired(buildForm(moza, {}, 'content/a.md'))).toBe(2);
		expect(emptyRequired(buildForm(moza, { title: 'Contact' }, 'content/a.md'))).toBe(1);
		expect(emptyRequired(buildForm(moza, { title: 'Contact', description: ' ' }, 'a.md'))).toBe(1);
		expect(emptyRequired(buildForm(moza, { title: 'Contact', description: 'x' }, 'a.md'))).toBe(0);
		expect(emptyRequired(buildForm(handboek, {}, 'docs/a.md'))).toBe(0);
	});
});

describe('applyForm', () => {
	it('writes values back, deletes empties and reports changes', () => {
		const schema = {
			...moza,
			velden: {
				n: { type: 'getal', verplicht: false, verborgen: false },
				b: { type: 'ja-nee', verplicht: false, verborgen: false },
				t: { type: 'tekst', verplicht: false, verborgen: false },
				r: { type: 'paginaverwijzing', verplicht: false, verborgen: false, meervoud: true }
			}
		} as typeof moza;
		const fm = { n: 1, t: 'oud', r: ['a'], extra: 1 };
		const fields = buildForm(schema, fm, 'a.md');
		fields[0].value = '2';
		fields[1].value = true;
		fields[2].value = '';
		const r = applyForm(fields, fm);
		expect(r.frontmatter).toEqual({ n: 2, b: true, r: ['a'], extra: 1 });
		expect(r.changedKeys).toEqual(['n', 'b', 't']);
	});
});

describe('titleOf', () => {
	it('reads the first H1', () => {
		expect(titleOf(handboek, {}, 'intro\n# Het Digi Handboek \n\ntext')).toBe('Het Digi Handboek');
		expect(titleOf(handboek, {}, 'geen kop')).toBe('');
	});
	it('reads a frontmatter field', () => {
		expect(titleOf(moza, { title: 'Hoi' }, '')).toBe('Hoi');
		expect(titleOf(moza, {}, '')).toBe('');
	});
});

describe('pageTitle', () => {
	it('takes the title the schema points at', () => {
		expect(pageTitle(handboek, {}, '# Het Digi Handboek\n\ntext', 'docs/index.md')).toBe(
			'Het Digi Handboek'
		);
		expect(pageTitle(moza, { title: ' Contact ' }, '# Kop', 'content/contact.md')).toBe('Contact');
		expect(pageTitle({ titel: 'veld:title' }, { title: 'Los' }, '', 'a.md')).toBe('Los');
	});
	it('falls back to the file name', () => {
		expect(pageTitle(handboek, {}, 'geen kop', 'docs/kennis/privacy.md')).toBe('privacy.md');
		expect(pageTitle(moza, { title: '   ' }, '', 'content/contact.md')).toBe('contact.md');
		expect(pageTitle(moza, {}, '', 'index.md')).toBe('index.md');
	});
});

describe('newPagePath', () => {
	const now = new Date(2026, 9, 7);
	it('resolves MOZa Weekly (content prefix is the caller job)', () => {
		expect(newPagePath(moza, 'Weekly', '', 'Weekly', now)).toBe('weekly/2026/2026-10-07.md');
	});
	it('accepts a folder matching a glob', () => {
		expect(newPagePath(moza, 'Handboekpagina', 'handboek/start', 'Één pagina', now)).toBe(
			'handboek/start/een-pagina.md'
		);
	});
	it('rejects unknown soort and disallowed folders', () => {
		expect(() => newPagePath(moza, 'Nope', '', 'x', now)).toThrow();
		expect(() => newPagePath(moza, 'Handboekpagina', 'elders', 'x', now)).toThrow();
		expect(() => newPagePath(handboek, null, 'elders', 'x', now)).toThrow();
	});
	it('uses uit-titel for flat schemas', () => {
		expect(newPagePath(handboek, null, 'kennis', 'Nieuwe pagina', now)).toBe(
			'kennis/nieuwe-pagina.md'
		);
	});
});

describe('summary field', () => {
	const field = (key: string, type: 'tekst' | 'getal') => ({
		key,
		def: { type, verplicht: false, verborgen: false },
		value: '',
		error: 'oud'
	});

	it('finds a description text field and fills only that one', () => {
		const fields = [field('title', 'tekst'), field('description', 'tekst')];
		expect(summaryField(fields)).toBe('description');
		const next = withValue(fields, 'description', 'Kort.');
		expect(next[1]).toMatchObject({ value: 'Kort.', error: null });
		expect(next[0]).toBe(fields[0]);
	});

	it('has none when the page has no description text field', () => {
		expect(summaryField([field('title', 'tekst'), field('description', 'getal')])).toBeNull();
	});
});
