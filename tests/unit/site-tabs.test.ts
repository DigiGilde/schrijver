import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSitesYaml } from '../../src/lib/config/types';
import { filterOf, proposalsAddress, siteHeader } from '../../src/lib/server/site-tabs';

describe('proposalsAddress', () => {
	it('leaves a site page without ?tab= where it is', () => {
		expect(proposalsAddress('digi-handboek', null)).toBeNull();
	});

	it('sends an old ?tab= link to the proposals tab with the same filter', () => {
		expect(proposalsAddress('digi-handboek', 'alle')).toBe(
			'/sites/digi-handboek/voorstellen?filter=alle'
		);
		expect(proposalsAddress('digi-handboek', 'mijn')).toBe(
			'/sites/digi-handboek/voorstellen?filter=mijn'
		);
		expect(proposalsAddress('digi-handboek', 'beoordelen')).toBe(
			'/sites/digi-handboek/voorstellen?filter=beoordelen'
		);
	});

	it('drops a value it does not know', () => {
		expect(proposalsAddress('digi-handboek', '')).toBe('/sites/digi-handboek/voorstellen');
		expect(proposalsAddress('digi-handboek', '<x>')).toBe('/sites/digi-handboek/voorstellen');
	});
});

describe('filterOf', () => {
	it('defaults to the own proposals', () => {
		expect(filterOf(null, true)).toBe('mijn');
		expect(filterOf('iets', true)).toBe('mijn');
		expect(filterOf('alle', false)).toBe('alle');
	});

	it('offers Te beoordelen to editorial members only', () => {
		expect(filterOf('beoordelen', true)).toBe('beoordelen');
		expect(filterOf('beoordelen', false)).toBe('mijn');
	});
});

describe('siteHeader', () => {
	it('carries the description and public address, not the repository', () => {
		const [digi] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
		expect(siteHeader(digi)).toEqual({
			id: 'digi-handboek',
			naam: 'Digi Handboek',
			omschrijving: 'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.',
			adres: 'https://digihandboek.rijks.app/'
		});
		expect(siteHeader({ ...digi, omschrijving: undefined, adres: undefined })).toMatchObject({
			omschrijving: null,
			adres: null
		});
	});
});
