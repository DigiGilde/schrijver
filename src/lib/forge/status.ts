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

/** Who merges a proposal whose writer Schrijver cannot tell: four eyes keeps every other editor from it. */
export const FOUR_EYES_UNKNOWN =
	'Een beheerder van de site voegt het samen, of iemand met rechten op GitHub.';

/** Proposals the editors still have to act on: the ones in "Te beoordelen". */
export const waitsForReview = (status: Status): boolean =>
	status === 'ingestuurd' || status === 'goedgekeurd';

/** The proposals in a reader's "Te beoordelen"; their own ones only with `own`. */
export const forReview = <P extends { status: Status; mine: boolean }>(
	proposals: P[],
	own: boolean
): P[] => proposals.filter((p) => waitsForReview(p.status) && (own || !p.mine));

/** What a proposal that GitHub cannot merge is told, on its page and when a merge is refused. */
export const NOT_MERGEABLE =
	'De pagina is intussen op de site veranderd. Daardoor kan dit voorstel niet worden samengevoegd.';

/** Why Schrijver does not merge a proposal with as many commits as GitHub lists. */
export const TOO_MANY_COMMITS =
	'Dit voorstel is zo vaak bewaard dat Schrijver niet alles kan nakijken.';

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
	| 'pagina-opnieuw-bewerken'
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
	/** The site asks for an approval on GitHub before a merge. */
	approvalRequired: boolean;
	/** GitHub waits for an approval the site requires before a merge. */
	approvalMissing: boolean;
	/** The reader has a GitHub account that may approve and merge there. */
	actsOnGitHub: boolean;
	/** GitHub cannot merge the proposal: the page changed on the site in the meantime. */
	notMergeable: boolean;
	/** The list of commits is as long as GitHub gives, so Schrijver cannot check the whole proposal. */
	tooManyCommits: boolean;
	/** Schrijver can open the proposal's pages in the editor. */
	canEdit: boolean;
	/** The titles of the proposal's pages as the site has them now, to make the change on again. */
	pagesOnSite: string[];
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
	if (s.notMergeable && s.writer) {
		const [one, ...more] = s.pagesOnSite;
		const page =
			one && more.length === 0
				? `De pagina ${one}`
				: more.length
					? 'Een pagina van je voorstel'
					: 'De pagina';
		const redo = one
			? 'Kies "Pagina opnieuw bewerken" en maak je wijziging nog een keer in een nieuw voorstel.'
			: 'Maak je wijziging nog een keer in een nieuw voorstel.';
		return say(
			`${page} is intussen op de site veranderd. Daardoor kan je voorstel niet worden samengevoegd, en Schrijver kan het niet bijwerken. ${redo} Dit voorstel blijft open tot iemand het op GitHub sluit.`,
			one ? ['pagina-opnieuw-bewerken'] : [],
			one ? 'pagina-opnieuw-bewerken' : null
		);
	}
	if (s.status === 'concept') {
		return s.writer
			? say(
					'Je voorstel is nog een concept. Klaar? Kies "Stuur in", dan beoordeelt de redactie het.',
					['insturen', ...edit],
					'insturen'
				)
			: say('Dit voorstel is nog een concept. De schrijver stuurt het in als het klaar is.');
	}
	if (s.status === 'aanpassing-gevraagd') {
		if (s.writer)
			return say(
				`De redactie vraagt je iets aan te passen. Lees het gesprek hieronder. Klaar? Kies "Stuur opnieuw in", dan beoordeelt de redactie het${s.approvalRequired ? ' op GitHub' : ''} opnieuw.`,
				[...edit, 'opnieuw-insturen'],
				edit[0] ?? 'opnieuw-insturen'
			);
		if (s.notMergeable)
			return say(`${NOT_MERGEABLE} De schrijver maakt de wijziging opnieuw in een nieuw voorstel.`);
		return say('De schrijver past dit voorstel aan. Daarna beoordeelt de redactie het opnieuw.');
	}
	if (s.editor && s.blocked) {
		const instead =
			s.blocked !== 'onbekend'
				? 'Een ander lid van de redactie beslist.'
				: s.mergeInSchrijver && !s.tooManyCommits
					? FOUR_EYES_UNKNOWN
					: 'Iemand met rechten op GitHub voegt het voorstel daar samen.';
		return say(`${FOUR_EYES[s.blocked]} ${instead}`, edit);
	}
	if (s.writer && !s.editor)
		return say('De redactie beoordeelt je voorstel. Je hoeft nu niets te doen.', edit);
	if (!s.editor) return say('De redactie beoordeelt dit voorstel.');
	if (s.notMergeable)
		return say(
			`${NOT_MERGEABLE} Vraag de schrijver om een aanpassing. De schrijver maakt de wijziging dan opnieuw in een nieuw voorstel.`,
			['vraag-om-aanpassing'],
			'vraag-om-aanpassing'
		);
	/* A writer who may merge an own proposal asks nobody for an adjustment, least of all themselves. */
	const next: Action[] = s.writer ? edit : ['vraag-om-aanpassing'];
	const ask = s.writer ? '' : ' Moet er iets anders, vraag dan om een aanpassing.';
	const main = s.writer ? null : 'vraag-om-aanpassing';
	const onGitHub = (why: string) =>
		s.actsOnGitHub
			? say(why, ['beoordelen-op-github', ...next], 'beoordelen-op-github')
			: say(`${why} Iemand met rechten op GitHub voegt het voorstel daar samen.${ask}`, next, main);
	if (!s.mergeInSchrijver) return onGitHub('Bij deze site gebeurt samenvoegen op GitHub.');
	if (s.tooManyCommits)
		return onGitHub(`${TOO_MANY_COMMITS} Samenvoegen gebeurt daarom op GitHub.`);
	if (s.approvalMissing)
		return s.actsOnGitHub
			? say(
					'Deze site vraagt eerst een goedkeuring op GitHub. Daarna kun je hier samenvoegen.',
					['goedkeuren-op-github', ...next],
					'goedkeuren-op-github'
				)
			: say(
					`Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed; daarna kun je hier samenvoegen.${ask}`,
					next,
					main
				);
	if (s.writer)
		return say(
			'Je schreef dit voorstel zelf en je mag het samenvoegen. Klopt alles, voeg het dan samen.',
			['samenvoegen', ...edit],
			'samenvoegen'
		);
	return say(
		'Jij beslist. Klopt de wijziging, voeg hem dan samen; na de volgende publicatie staat hij op de site. Moet er iets anders, vraag dan om een aanpassing.',
		['samenvoegen', 'vraag-om-aanpassing'],
		'samenvoegen'
	);
}
