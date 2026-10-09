import { describe, expect, it } from 'vitest';
import {
	STATUS,
	STEPS,
	listing,
	nextStep,
	proposalsTab,
	proposalsTabAddress,
	stepOf,
	updatedText,
	waitsForReview,
	whoApproves,
	whoDecides,
	type Status
} from '../../src/lib/forge/status';

const ALL: Status[] = [
	'concept',
	'ingestuurd',
	'goedgekeurd',
	'aanpassing-gevraagd',
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
		expect(STATUS['aanpassing-gevraagd']).toEqual({
			label: 'Aanpassing gevraagd',
			color: 'warning',
			line: 'Wacht op een aanpassing door de schrijver'
		});
	});

	it('counts what lies with the editors as waiting: sent in or approved, not an adjustment', () => {
		expect(ALL.filter(waitsForReview)).toEqual(['ingestuurd', 'goedgekeurd']);
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

describe('proposalsTabAddress', () => {
	it('opens the list as it is, unless something waits for the editors', () => {
		expect(proposalsTabAddress('digi-handboek', null)).toBe('/sites/digi-handboek/voorstellen');
		expect(proposalsTabAddress('digi-handboek', 0)).toBe('/sites/digi-handboek/voorstellen');
		expect(proposalsTabAddress('digi-handboek', 3)).toBe(
			'/sites/digi-handboek/voorstellen?filter=beoordelen'
		);
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
	it('puts every open status on one of the three steps', () => {
		expect(STEPS).toEqual(['Concept', 'Ingestuurd', 'Samengevoegd']);
		expect(stepOf('concept')).toBe('Concept');
		expect(stepOf('ingestuurd')).toBe('Ingestuurd');
		expect(stepOf('aanpassing-gevraagd')).toBe('Ingestuurd');
		expect(stepOf('goedgekeurd')).toBe('Ingestuurd');
		expect(stepOf('samengevoegd')).toBe('Samengevoegd');
		expect(stepOf('gesloten')).toBeNull();
	});

	it('names the next step and who takes it, addressing the writer where it is theirs', () => {
		expect(nextStep('concept', true)).toMatch(/^Volgende stap: stuur het voorstel in met Insturen/);
		expect(nextStep('concept', false)).toMatch(/^Volgende stap: de schrijver stuurt/);
		expect(nextStep('ingestuurd', true)).toMatch(/de redactie beoordeelt het voorstel/);
		expect(nextStep('aanpassing-gevraagd', true)).toMatch(/Verder bewerken/);
		expect(nextStep('goedgekeurd', false)).toMatch(/de redactie voegt het voorstel samen/);
		expect(nextStep('samengevoegd', false)).toMatch(/^Klaar/);
	});

	it('lists the editors by address, or only the people with write access', () => {
		expect(listing([])).toBe('');
		expect(listing(['a@x'])).toBe('a@x');
		expect(listing(['a@x', 'b@x', 'c@x'])).toBe('a@x, b@x en c@x');
		expect(whoDecides('ingestuurd', ['a@x', 'b@x'], true)).toBe(
			'Goedkeuren gebeurt op GitHub: door de redactie (a@x en b@x) met een GitHub-account, of door iemand met schrijfrechten op de repository.'
		);
		expect(whoDecides('samengevoegd', ['a@x'], true)).toBeNull();
		expect(whoDecides('gesloten', ['a@x'], true)).toBeNull();
	});

	it('says approving happens on GitHub, where an editor known by address needs an account', () => {
		const sentence =
			'Goedkeuren gebeurt op GitHub: door de redactie (a@x) met een GitHub-account, of door iemand met schrijfrechten op de repository.';
		expect(whoApproves(['a@x'])).toBe(sentence);
		for (const status of ['concept', 'ingestuurd', 'aanpassing-gevraagd'] as const) {
			expect(whoDecides(status, ['a@x'], true)).toBe(sentence);
		}
		expect(whoApproves([])).toBe(
			'Goedkeuren gebeurt op GitHub: door iemand met schrijfrechten op de repository.'
		);
	});

	it('says where an approved proposal is merged, as the site allows', () => {
		expect(whoDecides('goedgekeurd', ['a@x'], true)).toBe(
			'Samenvoegen kan de redactie (a@x) in Schrijver, of iemand met schrijfrechten op de repository op GitHub.'
		);
		expect(whoDecides('goedgekeurd', [], true)).toBe(
			'Samenvoegen kan iemand met schrijfrechten op de repository, in Schrijver of op GitHub.'
		);
		expect(whoDecides('goedgekeurd', ['a@x'], false)).toBe(
			'Samenvoegen gebeurt op GitHub: door de redactie (a@x) met een GitHub-account, of door iemand met schrijfrechten op de repository.'
		);
		expect(whoDecides('goedgekeurd', [], false)).toBe(
			'Samenvoegen gebeurt op GitHub: door iemand met schrijfrechten op de repository.'
		);
	});
});
