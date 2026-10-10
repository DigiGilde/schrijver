import { describe, expect, it } from 'vitest';
import {
	STATUS,
	STEPS,
	dateText,
	listing,
	momentText,
	proposalsTab,
	proposalsTabAddress,
	stepOf,
	updatedText,
	waitsForReview,
	whatNow,
	whoApproves,
	type Situation,
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
			expect(STATUS[status].line).not.toMatch(/[–—]/);
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

describe('dates', () => {
	const now = new Date('2026-10-08T12:00:00Z');

	it('gives day and month in Dutch, and the year only when it is another year', () => {
		expect(updatedText('2026-10-08T09:00:00Z', now)).toBe('Bijgewerkt 8 oktober');
		expect(updatedText('2025-03-01T09:00:00Z', now)).toBe('Bijgewerkt 1 maart 2025');
		expect(dateText('2025-03-01T09:00:00Z', now)).toBe('1 maart 2025');
	});

	it('reads the date as on the wall in the Netherlands', () => {
		expect(updatedText('2026-10-07T22:30:00Z', now)).toBe('Bijgewerkt 8 oktober');
		expect(updatedText('2025-12-31T23:30:00Z', now)).toBe('Bijgewerkt 1 januari');
		expect(momentText('2026-10-07T22:30:00Z', now)).toBe('8 oktober om 00:30');
		expect(momentText('2025-06-01T08:05:00Z', now)).toBe('1 juni 2025 om 10:05');
	});

	it('leaves an unreadable date out', () => {
		expect(updatedText('gisteren', now)).toBe('Bijgewerkt');
		expect(dateText('gisteren', now)).toBe('');
		expect(momentText('gisteren', now)).toBe('');
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

	it('lists the editors by address, or only the people with write access', () => {
		expect(listing([])).toBe('');
		expect(listing(['a@x'])).toBe('a@x');
		expect(listing(['a@x', 'b@x', 'c@x'])).toBe('a@x, b@x en c@x');
		expect(whoApproves(['a@x'])).toBe(
			'Goedkeuren gebeurt op GitHub: door de redactie (a@x) met een GitHub-account, of door iemand met schrijfrechten op de repository.'
		);
		expect(whoApproves([])).toBe(
			'Goedkeuren gebeurt op GitHub: door iemand met schrijfrechten op de repository.'
		);
	});
});

describe('whatNow', () => {
	const base: Situation = {
		status: 'ingestuurd',
		writer: false,
		editor: false,
		blocked: null,
		outside: false,
		mergeInSchrijver: true,
		approvalMissing: false,
		adjustmentLabel: false,
		canEdit: true,
		mergedAt: null,
		siteAddress: true
	};
	const now = new Date('2026-10-10T12:00:00Z');
	const row = (over: Partial<Situation>) => whatNow({ ...base, ...over }, now);

	it('asks the writer of a concept to send it in', () => {
		for (const editor of [false, true]) {
			expect(row({ status: 'concept', writer: true, editor })).toEqual({
				sentence:
					'Je voorstel is nog een concept. Klaar? Stuur het in, dan beoordeelt de redactie het.',
				actions: ['insturen', 'verder-bewerken'],
				primary: 'insturen'
			});
		}
		expect(row({ status: 'concept', writer: true, canEdit: false }).actions).toEqual(['insturen']);
	});

	it('tells the writer of a sent-in proposal that nothing is to be done', () => {
		for (const status of ['ingestuurd', 'goedgekeurd'] as const) {
			expect(row({ status, writer: true })).toEqual({
				sentence: 'De redactie beoordeelt je voorstel. Je hoeft nu niets te doen.',
				actions: ['verder-bewerken'],
				primary: null
			});
		}
	});

	it('sends the writer to the conversation when the editors ask for an adjustment', () => {
		const asked = { status: 'aanpassing-gevraagd' as const, writer: true };
		expect(row({ ...asked, adjustmentLabel: true })).toEqual({
			sentence: 'De redactie vraagt je iets aan te passen. Lees het gesprek hieronder.',
			actions: ['verder-bewerken', 'opnieuw-insturen'],
			primary: 'verder-bewerken'
		});
		expect(row({ ...asked, editor: true, adjustmentLabel: true }).sentence).toBe(
			'De redactie vraagt je iets aan te passen. Lees het gesprek hieronder.'
		);
		expect(row(asked).actions).toEqual(['verder-bewerken']);
	});

	it('lets an editor decide: merge, or ask for an adjustment', () => {
		for (const status of ['ingestuurd', 'goedgekeurd'] as const) {
			expect(row({ status, editor: true })).toEqual({
				sentence:
					'Jij beslist. Klopt de wijziging, voeg hem dan samen; na de volgende publicatie staat hij op de site. Moet er iets anders, vraag dan om een aanpassing.',
				actions: ['samenvoegen', 'vraag-om-aanpassing'],
				primary: 'samenvoegen'
			});
		}
		expect(row({ writer: true, editor: true }).actions).toEqual([
			'samenvoegen',
			'vraag-om-aanpassing'
		]);
	});

	it('sends an editor to GitHub for an approval the site requires first', () => {
		expect(row({ editor: true, approvalMissing: true })).toEqual({
			sentence: 'Deze site vraagt eerst een goedkeuring op GitHub. Daarna kun je hier samenvoegen.',
			actions: ['goedkeuren-op-github', 'vraag-om-aanpassing'],
			primary: 'goedkeuren-op-github'
		});
	});

	it('sends an editor to GitHub where the site merges there', () => {
		expect(row({ editor: true, mergeInSchrijver: false, approvalMissing: true })).toEqual({
			sentence: 'Bij deze site gebeurt samenvoegen op GitHub.',
			actions: ['beoordelen-op-github', 'vraag-om-aanpassing'],
			primary: 'beoordelen-op-github'
		});
	});

	it('leaves the decision to another editor when four eyes keep the reader from it', () => {
		expect(row({ writer: true, editor: true, blocked: 'zelf', approvalMissing: true })).toEqual({
			sentence: 'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.',
			actions: ['verder-bewerken'],
			primary: null
		});
		expect(row({ editor: true, blocked: 'mee' }).sentence).toBe(
			'Je schreef mee aan dit voorstel. Een ander lid van de redactie beslist.'
		);
		expect(row({ editor: true, blocked: 'onbekend', mergeInSchrijver: false }).sentence).toBe(
			'Schrijver kan niet nagaan of je dit voorstel zelf schreef. Een ander lid van de redactie beslist.'
		);
	});

	it('tells anyone else that the editors decide, and that a concept is not sent in yet', () => {
		for (const status of ['ingestuurd', 'goedgekeurd'] as const) {
			expect(row({ status })).toEqual({
				sentence: 'De redactie beoordeelt dit voorstel.',
				actions: [],
				primary: null
			});
		}
		for (const editor of [false, true]) {
			expect(row({ status: 'concept', editor })).toEqual({
				sentence: 'Dit voorstel is nog een concept. De schrijver stuurt het in als het klaar is.',
				actions: [],
				primary: null
			});
		}
	});

	it('says the writer is adjusting the proposal, and lets an editor send it in again', () => {
		const asked = { status: 'aanpassing-gevraagd' as const, adjustmentLabel: true };
		expect(row(asked)).toEqual({
			sentence: 'De schrijver past dit voorstel aan. Daarna beoordeelt de redactie het opnieuw.',
			actions: [],
			primary: null
		});
		expect(row({ ...asked, editor: true }).actions).toEqual(['opnieuw-insturen']);
		expect(row({ ...asked, editor: true, adjustmentLabel: false }).actions).toEqual([]);
	});

	it('says when a proposal was merged and offers the site', () => {
		const merged = { status: 'samengevoegd' as const, mergedAt: '2026-10-09T10:00:00Z' };
		for (const reader of [{}, { writer: true }, { editor: true }]) {
			expect(row({ ...merged, ...reader })).toEqual({
				sentence:
					'Samengevoegd op 9 oktober. Na de volgende publicatie staat de wijziging op de site.',
				actions: ['bekijk-de-site'],
				primary: null
			});
		}
		expect(row({ ...merged, siteAddress: false }).actions).toEqual([]);
		expect(row({ status: 'samengevoegd' }).sentence).toBe(
			'Samengevoegd. Na de volgende publicatie staat de wijziging op de site.'
		);
	});

	it('says a closed proposal will not come on the site', () => {
		expect(row({ status: 'gesloten', writer: true, editor: true })).toEqual({
			sentence: 'Gesloten zonder samenvoegen. De wijziging komt niet op de site.',
			actions: [],
			primary: null
		});
	});

	it('sends a proposal from outside the repository to GitHub', () => {
		expect(row({ outside: true, writer: true, editor: true })).toEqual({
			sentence:
				'Dit voorstel staat buiten de repository van de site. De redactie beoordeelt het op GitHub.',
			actions: [],
			primary: null
		});
	});

	it('writes no dash characters', () => {
		const flags = [false, true];
		for (const status of ALL)
			for (const writer of flags)
				for (const editor of flags)
					expect(row({ status, writer, editor }).sentence).not.toMatch(/[–—]/);
	});
});
