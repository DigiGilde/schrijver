import type { Proposal } from './proposals';

export type Status = Proposal['status'];

/** How a status reads in Schrijver: the badge, and one line on where the proposal stands and what comes next. */
export const STATUS: Record<
	Status,
	{ label: string; color: 'neutral' | 'accent' | 'success' | 'warning'; line: string }
> = {
	concept: {
		label: 'Concept',
		color: 'neutral',
		line: 'Nog niet ingestuurd, alleen zichtbaar als voorstel'
	},
	ingestuurd: {
		label: 'Ingestuurd',
		color: 'accent',
		line: 'Wacht op beoordeling door de redactie'
	},
	goedgekeurd: {
		label: 'Goedgekeurd',
		color: 'success',
		line: 'Kan worden samengevoegd door de redactie'
	},
	'aanpassing-gevraagd': {
		label: 'Aanpassing gevraagd',
		color: 'warning',
		line: 'Wacht op een aanpassing door de schrijver'
	},
	samengevoegd: {
		label: 'Samengevoegd',
		color: 'success',
		line: 'Staat op de site na de volgende publicatie'
	},
	gesloten: {
		label: 'Gesloten',
		color: 'neutral',
		line: 'Niet samengevoegd, komt niet op de site'
	}
};

/** Proposals the editors still have to act on: the ones in "Te beoordelen". */
export const waitsForReview = (status: Status): boolean =>
	status === 'ingestuurd' || status === 'goedgekeurd';

/** The text and accessible name of the Voorstellen tab; the count is only there for editorial members. */
export function proposalsTab(waiting: number | null): { text: string; label: string | null } {
	if (!waiting) return { text: 'Voorstellen', label: null };
	return {
		text: `Voorstellen (${waiting})`,
		label: `Voorstellen, ${waiting} ${waiting === 1 ? 'wacht' : 'wachten'} op beoordeling`
	};
}

/** Where the Voorstellen tab of a site leads: editorial members land on what waits for them. */
export function proposalsTabAddress(siteId: string, waiting: number | null): string {
	return `/sites/${encodeURIComponent(siteId)}/voorstellen${waiting ? '?filter=beoordelen' : ''}`;
}

/* Dates read as on the wall in the Netherlands, so the server and the browser render the same words. */
const zone = 'Europe/Amsterdam';
const dayMonth = new Intl.DateTimeFormat('nl-NL', {
	day: 'numeric',
	month: 'long',
	timeZone: zone
});
const dayMonthYear = new Intl.DateTimeFormat('nl-NL', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: zone
});
const year = new Intl.DateTimeFormat('nl-NL', { year: 'numeric', timeZone: zone });

/** "Bijgewerkt 8 oktober", with the year only when it is not this year. */
export function updatedText(iso: string, now: Date = new Date()): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return 'Bijgewerkt';
	const format = year.format(date) === year.format(now) ? dayMonth : dayMonthYear;
	return `Bijgewerkt ${format.format(date)}`;
}

export const STEPS = ['Concept', 'Ingestuurd', 'Samengevoegd'] as const;

/** The step a proposal is on, or null for a closed proposal, which left the flow. */
export function stepOf(status: Status): (typeof STEPS)[number] | null {
	switch (status) {
		case 'concept':
			return 'Concept';
		case 'ingestuurd':
		case 'goedgekeurd':
		case 'aanpassing-gevraagd':
			return 'Ingestuurd';
		case 'samengevoegd':
			return 'Samengevoegd';
		case 'gesloten':
			return null;
	}
}

/** One sentence on the next step and who takes it. `mine`: the reader wrote the proposal. */
export function nextStep(status: Status, mine: boolean): string {
	switch (status) {
		case 'concept':
			return mine
				? 'Volgende stap: stuur het voorstel in met Insturen als het klaar is, daarna beoordeelt de redactie het.'
				: 'Volgende stap: de schrijver stuurt het voorstel in, daarna beoordeelt de redactie het.';
		case 'ingestuurd':
			return 'Volgende stap: de redactie beoordeelt het voorstel en keurt het goed of vraagt om aanpassingen.';
		case 'aanpassing-gevraagd':
			return mine
				? 'Volgende stap: pas het voorstel aan met Verder bewerken, daarna beoordeelt de redactie het opnieuw.'
				: 'Volgende stap: de schrijver past het voorstel aan, daarna beoordeelt de redactie het opnieuw.';
		case 'goedgekeurd':
			return 'Volgende stap: de redactie voegt het voorstel samen, daarna staat de wijziging op de site na de volgende publicatie.';
		case 'samengevoegd':
			return 'Klaar: de wijziging staat op de site na de volgende publicatie.';
		case 'gesloten':
			return 'Dit voorstel is gesloten zonder samenvoegen: de wijziging komt niet op de site.';
	}
}

/** "a", "a en b", "a, b en c". */
export function listing(items: string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} en ${items.at(-1)}`;
}

const WRITE_ACCESS = 'iemand met schrijfrechten op de repository';

/** Approving happens on GitHub only, so an editor known by address needs a GitHub account as well. */
export function whoApproves(redactie: string[]): string {
	return redactie.length === 0
		? `Goedkeuren gebeurt op GitHub: door ${WRITE_ACCESS}.`
		: `Goedkeuren gebeurt op GitHub: door de redactie (${listing(redactie)}) met een GitHub-account, of door ${WRITE_ACCESS}.`;
}

/**
 * Who approves or merges an open proposal. `mergeInSchrijver`: the site lets its editors merge from
 * Schrijver, where an editor known by address needs no GitHub account.
 */
export function whoDecides(
	status: Status,
	redactie: string[],
	mergeInSchrijver: boolean
): string | null {
	if (status === 'samengevoegd' || status === 'gesloten') return null;
	if (status !== 'goedgekeurd') return whoApproves(redactie);
	if (mergeInSchrijver) {
		return redactie.length === 0
			? `Samenvoegen kan ${WRITE_ACCESS}, in Schrijver of op GitHub.`
			: `Samenvoegen kan de redactie (${listing(redactie)}) in Schrijver, of ${WRITE_ACCESS} op GitHub.`;
	}
	return redactie.length === 0
		? `Samenvoegen gebeurt op GitHub: door ${WRITE_ACCESS}.`
		: `Samenvoegen gebeurt op GitHub: door de redactie (${listing(redactie)}) met een GitHub-account, of door ${WRITE_ACCESS}.`;
}
