import type { Identity } from './trailers';
import type { PrComment, PrReview } from './types';

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
	/** Where GitHub shows what this conversation leaves out, such as comments on lines. */
	url: string | null;
}

const KIND: Record<CommentKind, string> = { reactie: 'Reactie', aanpassing: 'Vraag om aanpassing' };
const FIRST_LINE =
	/^(Reactie|Vraag om aanpassing) van de (schrijver|redactie) via Schrijver \((.+)\):$/;
const BEFORE = 'Opmerking van de redactie via Schrijver:';
const ANONYMOUS = /^anoniem, codenaam ([0-9a-f]{12})$/;
const LINKED = /^GitHub: (\S+)$/;

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

/** The person as their identity choice allows: never an e-mail address. */
function signature(identity: Identity): string {
	switch (identity.kind) {
		case 'anoniem':
			return `anoniem, codenaam ${identity.pseudoniem}`;
		case 'gekoppeld':
			return `GitHub: ${identity.login}`;
		case 'op-naam':
			return oneLine(identity.name);
	}
}

/** What Schrijver posts: a first line on who wrote it and as what, then the text. */
export function commentBody(text: string, author: CommentAuthor): string {
	return `${KIND[author.kind]} van de ${author.role} via Schrijver (${signature(author.identity)}):\n\n${text}`;
}

export function readComment(
	body: string
): { kind: CommentKind; role: Role; who: string | null; text: string } | null {
	const end = body.indexOf('\n');
	const first = (end === -1 ? body : body.slice(0, end)).trim();
	const text = end === -1 ? '' : body.slice(end + 1).replace(/^\s*\n/, '');
	if (first === BEFORE) return { kind: 'reactie', role: 'redactie', who: null, text };
	const match = FIRST_LINE.exec(first);
	if (!match) return null;
	const [, kind, role, signed] = match;
	const anonymous = ANONYMOUS.exec(signed);
	const who = anonymous
		? `Anoniem, codenaam ${anonymous[1]}`
		: (LINKED.exec(signed)?.[1] ?? signed);
	return { kind: kind === 'Reactie' ? 'reactie' : 'aanpassing', role: role as Role, who, text };
}

function fromComment(comment: PrComment): ConversationItem {
	const base = { id: `c${comment.id}`, at: comment.createdAt, url: null };
	const signed = comment.viaApp ? readComment(comment.body) : null;
	if (signed) {
		return {
			...base,
			who: signed.who ?? 'Iemand van de redactie',
			as: signed.role,
			verdict: signed.kind === 'aanpassing' ? 'Vraagt om een aanpassing' : null,
			text: signed.text
		};
	}
	return comment.viaApp
		? { ...base, who: 'Schrijver', as: 'app', verdict: null, text: comment.body }
		: {
				...base,
				who: comment.login || 'Onbekend',
				as: 'github',
				verdict: null,
				text: comment.body
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

const fromReview = (review: PrReview): ConversationItem => ({
	id: `r${review.id}`,
	who: review.login || 'Onbekend',
	as: 'github',
	at: review.submittedAt,
	verdict: verdictOf(review),
	text: review.body,
	url: review.state === 'commented' ? review.url : null
});

/** Comments and reviews in time order; a comment's first line counts only when Schrijver's App posted it. */
export function conversation(comments: PrComment[], reviews: PrReview[]): ConversationItem[] {
	return [...comments.map(fromComment), ...reviews.map(fromReview)].sort(
		(a, b) => Date.parse(a.at) - Date.parse(b.at)
	);
}
