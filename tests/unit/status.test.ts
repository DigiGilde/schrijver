import { describe, expect, it } from 'vitest';
import {
	STATUS,
	STEPS,
	listing,
	nextStep,
	proposalsTab,
	stepOf,
	updatedText,
	waitsForReview,
	whoDecides,
	type Status
} from '../../src/lib/forge/status';

const ALL: Status[] = [
	'concept',
	'ingestuurd',
	'goedgekeurd',
	'wijzigingen-gevraagd',
	'samengevoegd',
	'gesloten'
];

describe('status texts', () => {
	it('says in words where each status stands, without dash characters', () => {
		for (const status of ALL) {
			expect(STATUS[status].label).not.toBe('');
			expect(STATUS[status].line).not.toMatch(/[\u2013\u2014]/);
			expect(nextStep(status, true)).not.toMatch(/[\u2013\u2014]/);
		}
		expect(STATUS.ingestuurd.line).toBe('Wacht op beoordeling door de redactie');
		expect(STATUS.concept.line).toBe('Nog niet ingestuurd, alleen zichtbaar als voorstel');
		expect(STATUS.goedgekeurd.line).toBe('Kan worden samengevoegd door de redactie');
		expect(STATUS.samengevoegd.line).toBe('Staat op de site na de volgende publicatie');
	});

	it('counts sent-in proposals and those with changes requested as waiting for the editors', () => {
		expect(ALL.filter(waitsForReview)).toEqual(['ingestuurd', 'wijzigingen-gevraagd']);
	});
});

describe('proposalsTab', () => {
	it('shows no count to anyone who is not editorial, or when nothing waits', () => {
		expect(proposalsTab(null)).toEqual({ text: 'Voorstellen', label: null });
		expect(proposalsTab(0)).toEqual({ text: 'Voorstellen', label: null });
	});

	it('names what the count means, singular and plural', () => {
		expect(proposalsTab(1)).toEqual({
			text: 'Voorstellen (1)',
			label: 'Voorstellen, 1 wacht op beoordeling'
		});
		expect(proposalsTab(2)).toEqual({
			text: 'Voorstellen (2)',
			label: 'Voorstellen, 2 wachten op beoordeling'
		});
	});
});

describe('updatedText', () => {
	const now = new Date('2026-10-08T12:00:00Z');

	it('gives day and month in Dutch, and the year only when it is another year', () => {
		expect(updatedText('2026-10-08T09:00:00Z', now)).toBe('Bijgewerkt 8 oktober');
		expect(updatedText('2025-03-01T09:00:00Z', now)).toBe('Bijgewerkt 1 maart 2025');
	});

	it('reads the date as on the wall in the Netherlands', () => {
		expect(updatedText('2026-10-07T22:30:00Z', now)).toBe('Bijgewerkt 8 oktober');
		expect(updatedText('2025-12-31T23:30:00Z', now)).toBe('Bijgewerkt 1 januari');
	});

	it('leaves an unreadable date out', () => {
		expect(updatedText('gisteren', now)).toBe('Bijgewerkt');
	});
});

describe('the flow of a proposal', () => {
	it('puts every open status on one of the four steps', () => {
		expect(STEPS).toEqual(['Concept', 'Ingestuurd', 'Goedgekeurd', 'Samengevoegd']);
		expect(stepOf('concept')).toBe('Concept');
		expect(stepOf('ingestuurd')).toBe('Ingestuurd');
		expect(stepOf('wijzigingen-gevraagd')).toBe('Ingestuurd');
		expect(stepOf('goedgekeurd')).toBe('Goedgekeurd');
		expect(stepOf('samengevoegd')).toBe('Samengevoegd');
		expect(stepOf('gesloten')).toBeNull();
	});

	it('names the next step and who takes it, addressing the writer where it is theirs', () => {
		expect(nextStep('concept', true)).toMatch(/^Volgende stap: stuur het voorstel in met Insturen/);
		expect(nextStep('concept', false)).toMatch(/^Volgende stap: de schrijver stuurt/);
		expect(nextStep('ingestuurd', true)).toMatch(/de redactie beoordeelt het voorstel/);
		expect(nextStep('wijzigingen-gevraagd', true)).toMatch(/Verder bewerken/);
		expect(nextStep('goedgekeurd', false)).toMatch(/de redactie voegt het voorstel samen/);
		expect(nextStep('samengevoegd', false)).toMatch(/^Klaar/);
	});

	it('lists the editors by address, or only the people with write access', () => {
		expect(listing([])).toBe('');
		expect(listing(['a@x'])).toBe('a@x');
		expect(listing(['a@x', 'b@x', 'c@x'])).toBe('a@x, b@x en c@x');
		expect(whoDecides('ingestuurd', ['a@x', 'b@x'])).toBe(
			'Goedkeuren kan de redactie (a@x en b@x) of iemand met schrijfrechten op de repository op GitHub.'
		);
		expect(whoDecides('goedgekeurd', [])).toBe(
			'Samenvoegen kan iemand met schrijfrechten op de repository op GitHub.'
		);
		expect(whoDecides('samengevoegd', ['a@x'])).toBeNull();
		expect(whoDecides('gesloten', ['a@x'])).toBeNull();
	});
});
