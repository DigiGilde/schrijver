import { describe, expect, it } from 'vitest';
import {
	carriedFilter,
	filterOf,
	proposalsAddress,
	siteHeader
} from '../../src/lib/server/site-tabs';

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

describe('carriedFilter', () => {
	it('keeps the filter that a proposal was opened from', () => {
		expect(carriedFilter('mijn')).toBe('mijn');
		expect(carriedFilter('alle')).toBe('alle');
		expect(carriedFilter('beoordelen')).toBe('beoordelen');
	});

	it('has none when the address carries none, or one that does not exist', () => {
		expect(carriedFilter(null)).toBeNull();
		expect(carriedFilter('')).toBeNull();
		expect(carriedFilter('iets')).toBeNull();
	});
});

describe('siteHeader', () => {
	it('carries the name, description and public address from the site settings', () => {
		const settings = {
			siteId: 'digi-handboek',
			naam: 'Handboek van het Gilde',
			omschrijving: 'Wat je bij het Digi Gilde nodig hebt.',
			adres: 'https://digihandboek.rijks.app/',
			mergenVanuitSchrijver: true,
			vierOgen: false,
			identiteitToegestaan: ['anoniem' as const],
			zichtbaarheid: 'iedereen' as const,
			updatedAt: new Date(),
			updatedBy: 'baas'
		};
		expect(siteHeader(settings)).toEqual({
			id: 'digi-handboek',
			naam: 'Handboek van het Gilde',
			omschrijving: 'Wat je bij het Digi Gilde nodig hebt.',
			adres: 'https://digihandboek.rijks.app/'
		});
		expect(siteHeader({ ...settings, omschrijving: null, adres: null })).toMatchObject({
			omschrijving: null,
			adres: null
		});
	});
});
