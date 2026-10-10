import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseSchemaYaml, parseSitesYaml } from '../../src/lib/config/types';

const fixture = (p: string) => readFileSync(`tests/fixtures/config/${p}`, 'utf8');

describe('parseSitesYaml', () => {
	it('parses the fixture', () => {
		const sites = parseSitesYaml(fixture('sites.yaml'));
		expect(sites.map((s) => s.id)).toEqual(['digi-handboek', 'moza-site']);
		expect(sites[1].preview).toMatchObject({ soort: 'bij-label', label: 'preview' });
		expect(sites[1].content.uitsluiten).toEqual(['documenten/**']);
	});

	it('applies defaults', () => {
		const [site] = parseSitesYaml(`
- id: x
  naam: X
  forge: github
  repo: o/r
  standaardbranch: main
  content: { pad: docs, patroon: "**/*.md", schema: x }
  review: { model: goedkeuring }
  preview: { soort: geen }
`);
		expect(site.concepten).toBe('openbaar');
		expect(site.seed).toEqual({
			naam: 'X',
			omschrijving: null,
			adres: null,
			mergenVanuitSchrijver: true,
			vierOgen: true,
			identiteitToegestaan: ['anoniem', 'gekoppeld', 'op-naam'],
			redactie: []
		});
	});

	it('keeps naam, omschrijving, adres, review and identiteit only as starting values', () => {
		const [digi, moza] = parseSitesYaml(fixture('sites.yaml'));
		expect(digi.seed).toEqual({
			naam: 'Digi Handboek',
			omschrijving: 'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.',
			adres: 'https://digihandboek.rijks.app/',
			mergenVanuitSchrijver: true,
			vierOgen: false,
			identiteitToegestaan: ['anoniem', 'gekoppeld', 'op-naam'],
			redactie: ['naam@rijksoverheid.nl']
		});
		for (const key of ['naam', 'omschrijving', 'adres', 'review', 'identiteit'])
			expect(moza, key).not.toHaveProperty(key);
		expect(moza.seed).toMatchObject({
			vierOgen: true,
			identiteitToegestaan: ['anoniem', 'gekoppeld']
		});
	});

	it('names a site after its id when the configuration gives no name', () => {
		const text = fixture('sites.yaml').replace('  naam: Digi Handboek\n', '');
		expect(parseSitesYaml(text)[0].seed.naam).toBe('digi-handboek');
	});

	it('says that a value which only starts the settings is one', () => {
		const base = fixture('sites.yaml');
		for (const text of [
			base.replace('vier-ogen: false', 'vier-ogen: misschien'),
			base.replace('toegestaan: [anoniem, gekoppeld]', 'toegestaan: [anoniem, iedereen]'),
			base.replace('adres: https://digihandboek.rijks.app/', 'adres: digihandboek.rijks.app')
		]) {
			expect(() => parseSitesYaml(text)).toThrow(
				'a starting value: once the site has its settings in Schrijver, those apply'
			);
		}
	});

	it('drops a trailing slash from content.pad', () => {
		const sites = parseSitesYaml(fixture('sites.yaml').replace('pad: docs\n', 'pad: docs/\n'));
		expect(sites[0].content.pad).toBe('docs');
	});

	it('refuses concepten: privé with a Dutch message', () => {
		const text = fixture('sites.yaml').replace(
			'- id: moza-site',
			'- concepten: privé\n  id: moza-site'
		);
		expect(() => parseSitesYaml(text)).toThrow('concepten: privé wordt nog niet ondersteund');
	});

	it('refuses review.model: direct with a Dutch message', () => {
		const text = fixture('sites.yaml').replace('model: goedkeuring', 'model: direct');
		expect(() => parseSitesYaml(text)).toThrow('review.model: direct wordt nog niet ondersteund');
	});

	it('requires label for bij-label and {nummer} in url', () => {
		const base = fixture('sites.yaml');
		expect(() => parseSitesYaml(base.replace('    label: preview\n', ''))).toThrow(ZodError);
		expect(() => parseSitesYaml(base.replace('pr-{nummer}', 'pr-1'))).toThrow(ZodError);
	});

	it('accepts a web address as the adres of a site, over https or http', () => {
		const base = fixture('sites.yaml');
		for (const adres of ['https://digihandboek.rijks.app/', 'http://example.org/pad?x=1#kop']) {
			const text = base.replace('adres: https://digihandboek.rijks.app/', `adres: ${adres}`);
			expect(parseSitesYaml(text)[0].seed.adres).toBe(adres);
		}
	});

	it('refuses an adres that is not a web address', () => {
		const base = fixture('sites.yaml');
		for (const adres of [
			'javascript:alert(1)',
			'JavaScript:alert(1)',
			'data:text/html,<p>x</p>',
			'ftp://example.org',
			'mailto:naam@example.org',
			'https:example.org',
			'example.org'
		]) {
			const text = base.replace(
				'adres: https://digihandboek.rijks.app/',
				`adres: ${JSON.stringify(adres)}`
			);
			expect(() => parseSitesYaml(text), adres).toThrow('must be a web address');
		}
	});

	it('reads the Mermaid token colours of a site', () => {
		const [digi, moza] = parseSitesYaml(fixture('sites.yaml'));
		expect(digi.mermaid).toBeUndefined();
		expect(moza.mermaid?.tokens['--color-bg-light']).toEqual({
			licht: '#f0f7ff',
			donker: '#172538'
		});
	});

	it('accepts only hex colours and custom property names as Mermaid tokens', () => {
		const base = fixture('sites.yaml');
		expect(() => parseSitesYaml(base.replace("licht: '#e17000'", 'licht: oranje'))).toThrow(
			'must be a hex colour'
		);
		expect(() => parseSitesYaml(base.replace('--color-text:', 'color-text:'))).toThrow(
			'must be a custom property name'
		);
		expect(() =>
			parseSitesYaml(base.replace("donker: '#ebeef2' }", "donker: '#ebeef2', hoog: '#fff' }"))
		).toThrow(ZodError);
	});

	it('rejects unknown keys', () => {
		expect(() =>
			parseSitesYaml(fixture('sites.yaml').replace('forge: github', 'forge: github\n  extra: 1'))
		).toThrow(ZodError);
	});
});

describe('parseSchemaYaml', () => {
	it('parses both fixtures', () => {
		const digi = parseSchemaYaml(fixture('schemas/digi-handboek.yaml'));
		expect(digi.titel).toBe('uit-h1');
		expect(digi.velden.hero.verborgen).toBe(true);
		expect(digi.velden.description.verplicht).toBe(false);
		const moza = parseSchemaYaml(fixture('schemas/moza-site.yaml'));
		expect(moza.titel).toBe('veld:title');
		expect(moza.velden.date['alleen-in']).toEqual(['weekly/**']);
		expect('soorten' in moza['nieuwe-pagina']).toBe(true);
	});

	it('rejects an unknown field type with path velden.foo.type', () => {
		try {
			parseSchemaYaml(
				'titel: uit-h1\nvelden:\n  foo: { type: kleur }\nnieuwe-pagina: { mappen: [a] }\n'
			);
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(ZodError);
			expect((e as ZodError).issues[0].path).toEqual(['velden', 'foo', 'type']);
		}
	});

	it('rejects a titel that is neither uit-h1 nor veld:', () => {
		expect(() =>
			parseSchemaYaml('titel: iets\nvelden: {}\nnieuwe-pagina: { mappen: [a] }\n')
		).toThrow(ZodError);
	});
});
