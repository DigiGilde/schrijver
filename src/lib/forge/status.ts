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

/** Why four eyes keeps a member of the redactie from deciding on a proposal. */
export const FOUR_EYES = {
	zelf: 'Je schreef dit voorstel zelf.',
	mee: 'Je schreef mee aan dit voorstel.',
	onbekend: 'Schrijver kan niet nagaan of je dit voorstel zelf schreef.'
} as const;

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
const time = new Intl.DateTimeFormat('nl-NL', {
	hour: '2-digit',
	minute: '2-digit',
	timeZone: zone
});

/** "8 oktober", with the year only when it is not this year; empty for an unreadable date. */
export function dateText(iso: string, now: Date = new Date()): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const format = year.format(date) === year.format(now) ? dayMonth : dayMonthYear;
	return format.format(date);
}

/** "8 oktober om 14:05", with the year only when it is not this year. */
export function momentText(iso: string, now: Date = new Date()): string {
	const day = dateText(iso, now);
	return day && `${day} om ${time.format(new Date(iso))}`;
}

/** "Bijgewerkt 8 oktober", with the year only when it is not this year. */
export function updatedText(iso: string, now: Date = new Date()): string {
	const day = dateText(iso, now);
	return day ? `Bijgewerkt ${day}` : 'Bijgewerkt';
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

export type Action =
	| 'insturen'
	| 'verder-bewerken'
	| 'opnieuw-insturen'
	| 'samenvoegen'
	| 'vraag-om-aanpassing'
	| 'goedkeuren-op-github'
	| 'beoordelen-op-github'
	| 'bekijk-de-site';

/** Where a proposal stands and who reads it: what "wat nu" is decided from. */
export interface Situation {
	status: Status;
	/** The reader made the proposal. */
	writer: boolean;
	editor: boolean;
	/** Why four eyes keeps this member of the redactie from deciding, if they do. */
	blocked: keyof typeof FOUR_EYES | null;
	/** From a fork or into another branch: Schrijver does not act on it. */
	outside: boolean;
	mergeInSchrijver: boolean;
	/** GitHub waits for an approval the site requires before a merge. */
	approvalMissing: boolean;
	/** The adjustment was asked in Schrijver, so Opnieuw insturen can take its label off. */
	adjustmentLabel: boolean;
	/** Schrijver can open the proposal's pages in the editor. */
	canEdit: boolean;
	mergedAt: string | null;
	siteAddress: boolean;
}

/** One sentence on what is expected of the reader, the actions for it and the main one among them. */
export function whatNow(
	s: Situation,
	now: Date = new Date()
): { sentence: string; actions: Action[]; primary: Action | null } {
	const say = (sentence: string, actions: Action[] = [], primary: Action | null = null) => ({
		sentence,
		actions,
		primary
	});
	const edit: Action[] = s.canEdit ? ['verder-bewerken'] : [];
	if (s.status === 'samengevoegd') {
		const day = s.mergedAt ? dateText(s.mergedAt, now) : '';
		return say(
			`Samengevoegd${day ? ` op ${day}` : ''}. Na de volgende publicatie staat de wijziging op de site.`,
			s.siteAddress ? ['bekijk-de-site'] : []
		);
	}
	if (s.status === 'gesloten')
		return say('Gesloten zonder samenvoegen. De wijziging komt niet op de site.');
	if (s.outside)
		return say(
			'Dit voorstel staat buiten de repository van de site. De redactie beoordeelt het op GitHub.'
		);
	if (s.status === 'concept') {
		return s.writer
			? say(
					'Je voorstel is nog een concept. Klaar? Stuur het in, dan beoordeelt de redactie het.',
					['insturen', ...edit],
					'insturen'
				)
			: say('Dit voorstel is nog een concept. De schrijver stuurt het in als het klaar is.');
	}
	if (s.status === 'aanpassing-gevraagd') {
		const again: Action[] = s.adjustmentLabel ? ['opnieuw-insturen'] : [];
		if (s.writer)
			return say(
				'De redactie vraagt je iets aan te passen. Lees het gesprek hieronder.',
				[...edit, ...again],
				edit[0] ?? again[0] ?? null
			);
		return say(
			'De schrijver past dit voorstel aan. Daarna beoordeelt de redactie het opnieuw.',
			s.editor ? again : []
		);
	}
	if (s.editor && s.blocked)
		return say(`${FOUR_EYES[s.blocked]} Een ander lid van de redactie beslist.`, edit);
	if (s.writer && !s.editor)
		return say('De redactie beoordeelt je voorstel. Je hoeft nu niets te doen.', edit);
	if (!s.editor) return say('De redactie beoordeelt dit voorstel.');
	if (!s.mergeInSchrijver)
		return say(
			'Bij deze site gebeurt samenvoegen op GitHub.',
			['beoordelen-op-github', 'vraag-om-aanpassing'],
			'beoordelen-op-github'
		);
	if (s.approvalMissing)
		return say(
			'Deze site vraagt eerst een goedkeuring op GitHub. Daarna kun je hier samenvoegen.',
			['goedkeuren-op-github', 'vraag-om-aanpassing'],
			'goedkeuren-op-github'
		);
	return say(
		'Jij beslist. Klopt de wijziging, voeg hem dan samen; na de volgende publicatie staat hij op de site. Moet er iets anders, vraag dan om een aanpassing.',
		['samenvoegen', 'vraag-om-aanpassing'],
		'samenvoegen'
	);
}
