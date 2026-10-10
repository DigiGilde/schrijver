import type { Identity } from './trailers';
import { MAX_CONVERSATION, type PrComment, type PrReview } from './types';

export type Role = 'schrijver' | 'redactie';
export type CommentKind = 'reactie' | 'aanpassing';

export interface CommentAuthor {
	identity: Identity;
	role: Role;
	kind: CommentKind;
}

/** One comment or review, as the conversation on the proposal page shows it. */
export interface ConversationItem {
	id: string;
	who: string;
	/** As the writer or the editors through Schrijver, on GitHub, or Schrijver's own message. */
	as: Role | 'github' | 'app';
	at: string;
	verdict: string | null;
	/** Markdown, for the preview pipeline. */
	text: string;
	/** Where GitHub shows what this conversation leaves out: comments on lines, or the rest of a long text. */
	url: string | null;
}

const MARKER = '<!-- schrijver -->';
const KIND: Record<CommentKind, string> = { reactie: 'Reactie', aanpassing: 'Vraag om aanpassing' };
const HEADER =
	/^\*\*(Reactie|Vraag om aanpassing) van de (schrijver|redactie) via Schrijver\*\* \((.+)\):$/;
const BEFORE = 'Opmerking van de redactie via Schrijver:\n\n';
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const JOINER = '⁠';
const ANONYMOUS = /^anoniem, codenaam ([0-9a-f]{12})$/;
const LINKED = /^GitHub: ([A-Za-z0-9-]+)$/;
/**
 * A name as the header carries it: behind a marker of its own, so it never reads as the anonymous or
 * the GitHub form, in words of letters, marks, digits and .,'’- one space apart.
 */
const NAMED = /^naam: ([\p{L}\p{M}\p{N}.,'’-]+(?: [\p{L}\p{M}\p{N}.,'’-]+)*)$/u;
/** A word that GitHub would turn into a link. */
const WWW = /(^| )(www)\./giu;
const UNKNOWN_NAME = 'Naam onbekend';
/** Bounds on what a page shows of a conversation: anyone can comment on GitHub, also at length. */
const MAX_TEXT = 10_000;
const MAX_TOTAL = 200_000;

/**
 * Breaks what GitHub reads as HTML, which can hide text or close the quote around a reaction, and
 * what it reads as a mention, which notifies someone.
 */
const disarm = (line: string) =>
	line.replace(/<(?=[A-Za-z/!?])/g, `<${JOINER}`).replace(/@(?=[A-Za-z0-9])/g, `@${JOINER}`);

/**
 * The text of a reaction as the App posts it: quoted as a whole, code blocks included, so that no line
 * of it passes for Schrijver's own on GitHub. Split at every line ending Markdown knows, a lone CR too.
 */
function quote(text: string): string {
	let fence = '';
	return text
		.split(/\r\n?|\n/)
		.map((line) => {
			const mark = FENCE.exec(line)?.[1];
			if (fence) {
				if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = '';
			} else if (mark) {
				fence = mark;
			} else {
				line = disarm(line);
			}
			return line === '' ? '>' : `> ${line}`;
		})
		.join('\n');
}

/** The text as typed, from the quote that commentBody made of it; null for text in another form. */
function unquote(text: string): string | null {
	const lines = text.split('\n');
	if (!lines.every((line) => line === '>' || line.startsWith('> '))) return null;
	return lines.map((line) => line.slice(2)).join('\n');
}

/** A name as the header carries it: nothing that Markdown, HTML or the header itself would read. */
function headerName(typed: string): string {
	return (
		typed
			.replace(/\s+/g, ' ')
			.replace(/[^\p{L}\p{M}\p{N} .,'’-]/gu, '')
			.replace(WWW, '$1$2')
			.replace(/ {2,}/g, ' ')
			.trim() || UNKNOWN_NAME
	);
}

/** The person as their identity choice allows: never an e-mail address. */
function signature(identity: Identity): string {
	switch (identity.kind) {
		case 'anoniem':
			return `anoniem, codenaam ${identity.pseudoniem}`;
		case 'gekoppeld':
			return `GitHub: ${identity.login}`;
		case 'op-naam':
			return `naam: ${headerName(identity.name)}`;
	}
}

/** Who signed, from a signature in a form that commentBody writes; null for any other. */
function signerOf(signed: string): { signer: Identity['kind']; who: string } | null {
	const pseudonym = ANONYMOUS.exec(signed)?.[1];
	if (pseudonym) return { signer: 'anoniem', who: `Anoniem, codenaam ${pseudonym}` };
	const login = LINKED.exec(signed)?.[1];
	if (login) return { signer: 'gekoppeld', who: login };
	const name = NAMED.exec(signed)?.[1];
	return name && !name.match(WWW) ? { signer: 'op-naam', who: name } : null;
}

/** What Schrijver posts: a hidden marker and a line on who wrote it and as what, then the text. */
export function commentBody(text: string, author: CommentAuthor): string {
	const header = `**${KIND[author.kind]} van de ${author.role} via Schrijver** (${signature(author.identity)}):`;
	return `${MARKER}\n${header}\n\n${quote(text)}`;
}

/**
 * Reads back exactly what commentBody writes, with who signed it, as what kind of identity, and the
 * text as it was typed; or what Schrijver wrote before it named the person. Null for anything else.
 */
export function readComment(body: string): {
	kind: CommentKind;
	role: Role;
	who: string | null;
	signer: Identity['kind'] | null;
	text: string;
} | null {
	const text = body.replace(/\r\n/g, '\n');
	if (text.startsWith(BEFORE)) {
		const typed = text.slice(BEFORE.length);
		return { kind: 'reactie', role: 'redactie', who: null, signer: null, text: typed };
	}
	if (!text.startsWith(`${MARKER}\n`)) return null;
	const rest = text.slice(MARKER.length + 1);
	const end = rest.indexOf('\n\n');
	const match = end === -1 ? null : HEADER.exec(rest.slice(0, end));
	const signed = match ? signerOf(match[3]) : null;
	const typed = match ? unquote(rest.slice(end + 2)) : null;
	if (!match || !signed || typed === null) return null;
	return {
		kind: match[1] === 'Reactie' ? 'reactie' : 'aanpassing',
		role: match[2] as Role,
		...signed,
		text: typed
	};
}

const onGitHub = (url: string) => (url.startsWith('https://github.com/') ? url : null);

function shorten(text: string, url: string): { text: string; url: string | null } {
	return text.length > MAX_TEXT
		? { text: `${text.slice(0, MAX_TEXT)}…`, url: onGitHub(url) }
		: { text, url: null };
}

function fromComment(comment: PrComment): ConversationItem {
	const base = { id: `c${comment.id}`, at: comment.createdAt };
	const signed = comment.byApp ? readComment(comment.body) : null;
	if (signed) {
		return {
			...base,
			who: signed.who ?? 'Iemand van de redactie',
			as: signed.role,
			verdict: signed.kind === 'aanpassing' ? 'Vraagt om een aanpassing' : null,
			...shorten(signed.text, comment.url)
		};
	}
	return comment.byApp
		? { ...base, who: 'Schrijver', as: 'app', verdict: null, ...shorten(comment.body, comment.url) }
		: {
				...base,
				who: comment.login || 'Onbekend',
				as: 'github',
				verdict: null,
				...shorten(comment.body, comment.url)
			};
}

function verdictOf(review: PrReview): string | null {
	switch (review.state) {
		case 'approved':
			return `Goedgekeurd op GitHub door ${review.login}`;
		case 'changes_requested':
			return `Vraagt om aanpassing op GitHub: ${review.login}`;
		case 'dismissed':
			return `Beoordeling van ${review.login} op GitHub is ingetrokken`;
		case 'commented':
			return review.body.trim() ? null : 'Plaatste opmerkingen in de tekst op GitHub';
	}
}

function fromReview(review: PrReview): ConversationItem {
	const { text, url } = shorten(review.body, review.url);
	return {
		id: `r${review.id}`,
		who: review.login || 'Onbekend',
		as: 'github',
		at: review.submittedAt,
		verdict: verdictOf(review),
		text,
		url: review.state === 'commented' ? onGitHub(review.url) : url
	};
}

/**
 * Comments and reviews in time order, within the bounds of one page; incomplete when GitHub may hold more.
 * The line on who wrote a comment counts only on a comment of Schrijver's own App account.
 */
export function conversation(
	comments: PrComment[],
	reviews: PrReview[]
): { items: ConversationItem[]; complete: boolean } {
	const all = [...comments.map(fromComment), ...reviews.map(fromReview)].sort(
		(a, b) => Date.parse(a.at) - Date.parse(b.at)
	);
	const items: ConversationItem[] = [];
	let total = 0;
	for (const item of all) {
		total += item.text.length;
		if (total > MAX_TOTAL) return { items, complete: false };
		items.push(item);
	}
	return {
		items,
		complete: comments.length < MAX_CONVERSATION && reviews.length < MAX_CONVERSATION
	};
}
