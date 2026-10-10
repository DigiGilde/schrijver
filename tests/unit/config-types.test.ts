import { describe, expect, it } from 'vitest';
import { parseSchemaFile, parseSiteFile } from '../../src/lib/config/types';
import { structureFile } from './sites-fixture';

const DIGI = structureFile('digi-handboek', 'site.yaml');
const MOZA = structureFile('moza-site', 'site.yaml');

const errorsOf = (parsed: { ok: boolean; errors?: string[] }) => (parsed.ok ? [] : parsed.errors);

describe('parseSiteFile', () => {
	it('reads the fixtures of both pilot sites', () => {
		const digi = parseSiteFile(DIGI);
		const moza = parseSiteFile(MOZA);
		expect(digi).toMatchObject({
			ok: true,
			value: {
				concepten: 'openbaar',
				content: { pad: 'docs', patroon: '**/*.md' },
				preview: { soort: 'bij-push' }
			}
		});
		expect(moza).toMatchObject({
			ok: true,
			value: {
				content: { uitsluiten: ['documenten/**'] },
				preview: { soort: 'bij-label', label: 'preview' }
			}
		});
		expect(moza.ok && moza.value.mermaid?.tokens['--color-bg-light']).toEqual({
			licht: '#f0f7ff',
			donker: '#172538'
		});
		expect(digi.ok && digi.value.mermaid).toBeUndefined();
	});

	it('drops a trailing slash from content.pad', () => {
		const parsed = parseSiteFile(DIGI.replace('pad: docs\n', 'pad: docs/\n'));
		expect(parsed.ok && parsed.value.content.pad).toBe('docs');
	});

	it('names each field that moved to Schrijver, and where it is set now', () => {
		const parsed = parseSiteFile(structureFile('oude-site', 'site.yaml'));
		expect(errorsOf(parsed)).toEqual([
			'naam: hoort niet meer in dit bestand. Je stelt het in bij Beheer van de site in Schrijver, onder Instellingen van de site.',
			'review: hoort niet meer in dit bestand. Samenvoegen, vier ogen en de redactie stel je in bij Beheer van de site in Schrijver.',
			'repo: hoort niet meer in dit bestand. Schrijver weet van GitHub welke repository het is.',
			'content.schema: hoort niet meer in dit bestand. Het schema staat in .schrijver/schema.yaml.'
		]);
		for (const field of ['id', 'omschrijving', 'adres', 'identiteit', 'team', 'schrijfwijzer']) {
			expect(errorsOf(parseSiteFile(`${field}: x\n${DIGI}`)), field).toEqual([
				expect.stringMatching(new RegExp(`^${field}: hoort niet meer in dit bestand. `))
			]);
		}
		// Every beheerder of a site reads these under Structuur: no word of GitHub's own.
		for (const field of ['forge', 'repo', 'standaardbranch']) {
			const [error] = errorsOf(parseSiteFile(`${field}: x\n${DIGI}`));
			expect(error.slice(field.length + 1), field).toBe(
				' hoort niet meer in dit bestand. Schrijver weet van GitHub welke repository het is.'
			);
		}
	});

	it('refuses concepten: privé in Dutch', () => {
		expect(errorsOf(parseSiteFile(`concepten: privé\n${DIGI}`))).toEqual([
			'concepten: privé wordt nog niet ondersteund'
		]);
	});

	it('wants a label for bij-label, and a preview address with {nummer} on the web', () => {
		expect(errorsOf(parseSiteFile(MOZA.replace('  label: preview\n', '')))).toEqual([
			'preview.label: is nodig bij soort: bij-label'
		]);
		expect(errorsOf(parseSiteFile(DIGI.replace('pr-{nummer}', 'pr-1')))).toEqual([
			'preview.url: moet {nummer} bevatten'
		]);
		for (const url of [
			'javascript:alert({nummer})',
			'data:text/html,{nummer}',
			'ftp://example.org/{nummer}',
			'{nummer}.example.org'
		]) {
			const text = DIGI.replace(
				"'https://plak.rijks.app/digigilde/handboek/_preview/pr-{nummer}/'",
				JSON.stringify(url)
			);
			expect(errorsOf(parseSiteFile(text)), url).toEqual([
				'preview.url: moet een webadres zijn dat begint met https:// of http://'
			]);
		}
		expect(
			parseSiteFile(DIGI.replace('soort: bij-push', 'soort: geen').replace(/ {2}url: .*\n/, '')).ok
		).toBe(true);
	});

	it('accepts only hex colours and custom property names as Mermaid tokens', () => {
		expect(errorsOf(parseSiteFile(MOZA.replace("licht: '#e17000'", 'licht: oranje')))).toEqual([
			'mermaid.tokens.--color-rijks-oranje.licht: moet een hexkleur zijn, zoals #f0f7ff'
		]);
		expect(errorsOf(parseSiteFile(MOZA.replace('--color-text:', 'color-text:')))).toEqual([
			'mermaid.tokens.color-text: moet de naam van een custom property zijn, zoals --color-text'
		]);
	});

	it('names an unknown field, a missing one and a wrong value in Dutch', () => {
		expect(errorsOf(parseSiteFile(DIGI.replace('patroon:', 'extra: 1\n  patroon:')))).toEqual([
			'content.extra: is geen veld dat Schrijver kent'
		]);
		expect(errorsOf(parseSiteFile(DIGI.replace("  patroon: '**/*.md'\n", '')))).toEqual([
			'content.patroon: ontbreekt'
		]);
		expect(errorsOf(parseSiteFile(DIGI.replace('soort: bij-push', 'soort: altijd')))).toEqual([
			'preview.soort: moet een van deze waarden zijn: bij-push, bij-label, geen'
		]);
		expect(errorsOf(parseSiteFile(DIGI.replace('pad: docs\n', 'pad: [docs]\n')))).toEqual([
			'content.pad: moet tekst zijn'
		]);
	});

	it('refuses a folder outside the repository', () => {
		for (const pad of ['/docs', '../docs', 'docs/../..', 'docs\\\\x']) {
			expect(errorsOf(parseSiteFile(DIGI.replace('pad: docs\n', `pad: '${pad}'\n`))), pad).toEqual([
				'content.pad: moet een map in de repository zijn, zonder / vooraan en zonder ..'
			]);
		}
	});

	it('says where the YAML breaks, and that an empty file is no structure', () => {
		expect(errorsOf(parseSiteFile('content: [kapot\n'))).toEqual([
			expect.stringMatching(/^geen geldige YAML \(regel \d+\)$/)
		]);
		expect(errorsOf(parseSiteFile(`${DIGI}content: {}\n`))).toEqual([
			expect.stringMatching(/^geen geldige YAML/)
		]);
		expect(errorsOf(parseSiteFile(''))).toEqual(['is leeg, of geen blok met velden']);
		expect(errorsOf(parseSiteFile('- een lijst\n'))).toEqual(['is leeg, of geen blok met velden']);
	});

	it('refuses a file that would grow without bound through aliases', () => {
		const bomb = [
			'a: &a [x, x, x, x, x, x, x, x, x, x]',
			...Array.from({ length: 12 }, (_, i) => {
				const prev = i === 0 ? 'a' : `l${i - 1}`;
				return `l${i}: &l${i} [*${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}]`;
			})
		].join('\n');
		expect(errorsOf(parseSiteFile(bomb))).toEqual([expect.stringMatching(/^geen geldige YAML/)]);
	});
});

describe('parseSchemaFile', () => {
	it('reads the schemas of both pilot sites', () => {
		const digi = parseSchemaFile(structureFile('digi-handboek', 'schema.yaml'));
		const moza = parseSchemaFile(structureFile('moza-site', 'schema.yaml'));
		expect(digi.ok && digi.value.titel).toBe('uit-h1');
		expect(digi.ok && digi.value.velden.hero.verborgen).toBe(true);
		expect(digi.ok && digi.value.velden.description.verplicht).toBe(false);
		expect(moza.ok && moza.value.titel).toBe('veld:title');
		expect(moza.ok && moza.value.velden.date['alleen-in']).toEqual(['weekly/**']);
		expect(moza.ok && 'soorten' in moza.value['nieuwe-pagina']).toBe(true);
	});

	it('names the field with an unknown type, by its path', () => {
		expect(errorsOf(parseSchemaFile(structureFile('intranet', 'schema.yaml')))).toEqual([
			'velden.kleur.type: moet een van deze waarden zijn: tekst, getal, ja-nee, datum, paginaverwijzing'
		]);
	});

	it('says what a titel and nieuwe-pagina may be', () => {
		expect(
			errorsOf(parseSchemaFile('titel: iets\nvelden: {}\nnieuwe-pagina: { mappen: [a] }\n'))
		).toEqual(['titel: moet uit-h1 zijn, of veld: met de naam van een veld, zoals veld:title']);
		expect(
			errorsOf(parseSchemaFile('titel: uit-h1\nvelden: {}\nnieuwe-pagina: { map: a }\n'))
		).toEqual(['nieuwe-pagina: moet mappen hebben, of soorten met elk een naam']);
	});
});
