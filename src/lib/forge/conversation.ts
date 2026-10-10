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
/** A name that reads as the anonymous or the GitHub form of the header, in any case. */
const OTHER_FORM = /^(anoniem, codenaam [0-9a-f]{12}|github: [a-z0-9-]+)$/i;
/** Bounds on what a page shows of a conversation: anyone can comment on GitHub, also at length. */
const MAX_TEXT = 10_000;
const MAX_TOTAL = 200_000;

/** Breaks what GitHub reads as an HTML comment, which hides text, or as a mention, which notifies someone. */
const disarm = (line: string) =>
	line.replaceAll('<!--', `<${JOINER}!--`).replace(/@(?=[A-Za-z0-9])/g, `@${JOINER}`);

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

/** The text as typed, from the quote that commentBody made of it; text in another form stays as it is. */
function unquote(text: string): string {
	const lines = text.split('\n');
	if (!lines.every((line) => line === '>' || line.startsWith('> '))) return text;
	return lines.map((line) => line.slice(2)).join('\n');
}

/** The person as their identity choice allows: never an e-mail address. */
function signature(identity: Identity): string {
	switch (identity.kind) {
		case 'anoniem':
			return `anoniem, codenaam ${identity.pseudoniem}`;
		case 'gekoppeld':
			return `GitHub: ${identity.login}`;
		case 'op-naam': {
			const name = disarm(identity.name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim());
			return OTHER_FORM.test(name) ? `"${name}"` : name;
		}
	}
}

/** What Schrijver posts: a hidden marker and a line on who wrote it and as what, then the text. */
export function commentBody(text: string, author: CommentAuthor): string {
	const header = `**${KIND[author.kind]} van de ${author.role} via Schrijver** (${signature(author.identity)}):`;
	return `${MARKER}\n${header}\n\n${quote(text)}`;
}

/**
 * Reads back exactly what commentBody wrote, with the text as it was typed, or what Schrijver wrote
 * before it named the person.
 */
export function readComment(
	body: string
): { kind: CommentKind; role: Role; who: string | null; text: string } | null {
	const text = body.replace(/\r\n/g, '\n');
	if (text.startsWith(BEFORE)) {
		return { kind: 'reactie', role: 'redactie', who: null, text: text.slice(BEFORE.length) };
	}
	if (!text.startsWith(`${MARKER}\n`)) return null;
	const rest = text.slice(MARKER.length + 1);
	const end = rest.indexOf('\n\n');
	const match = end === -1 ? null : HEADER.exec(rest.slice(0, end));
	if (!match) return null;
	const [, kind, role, signed] = match;
	const anonymous = ANONYMOUS.exec(signed);
	const who = anonymous
		? `Anoniem, codenaam ${anonymous[1]}`
		: (LINKED.exec(signed)?.[1] ?? signed);
	return {
		kind: kind === 'Reactie' ? 'reactie' : 'aanpassing',
		role: role as Role,
		who,
		text: unquote(rest.slice(end + 2))
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
