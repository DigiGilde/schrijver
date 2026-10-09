import { identityFromPrBody, trailersFromMessage, type Identity } from './trailers';
import { MAX_PR_COMMITS, type PrCommit, type PrSummary } from './types';

/** Yes or no where Schrijver can tell, null where it cannot. */
export type Answer = boolean | null;

export interface Reader {
	/** Every identity the reader can sign with now. */
	identities: Identity[];
	githubLogin: string | null;
}

export interface Writing {
	/** The reader made the proposal: opened it on GitHub, or signed it in Schrijver. */
	own: Answer;
	/** One of its commits is the reader's. */
	along: Answer;
}

const PSEUDONYM = /^Schrijver-Auteur: (\S+)$/;
const LINKED = /^Co-authored-by: [^<>]+ <(\d+)\+[^@<>\s]+@users\.noreply\.github\.com>$/;
const NAMED = /^Co-authored-by: [^<>]+ <([^@<>\s]+@[^@<>\s]+)>$/;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** True when one answer is, null when none is but one cannot tell. */
const anyOf = (answers: Answer[]): Answer =>
	answers.includes(true) ? true : answers.includes(null) ? null : false;

/** Whether a signature is the reader's; null when it is malformed, or the reader has no identity of its kind now. */
export function signedBy(trailer: string | null, reader: Reader): Answer {
	const line = trailer?.trim() ?? '';
	const pseudonym = PSEUDONYM.exec(line)?.[1];
	if (pseudonym) {
		const own = reader.identities.find((id) => id.kind === 'anoniem');
		return own ? own.pseudoniem === pseudonym : null;
	}
	const githubId = LINKED.exec(line)?.[1];
	if (githubId) {
		const own = reader.identities.find((id) => id.kind === 'gekoppeld');
		return own ? String(own.githubId) === githubId : null;
	}
	const email = NAMED.exec(line)?.[1];
	if (email) {
		const own = reader.identities.find((id) => id.kind === 'op-naam');
		return own ? same(own.email.trim(), email) : null;
	}
	return null;
}

function commitBy(commit: PrCommit, reader: Reader, app: string | null): Answer {
	if (!commit.author || app === null) return null;
	if (same(commit.author, app)) {
		const trailers = trailersFromMessage(commit.message);
		return trailers.length === 0 ? null : anyOf(trailers.map((t) => signedBy(t, reader)));
	}
	return reader.githubLogin === null ? null : same(commit.author, reader.githubLogin);
}

/**
 * Whether the reader made a proposal, from what GitHub says now. Its signature counts only when Schrijver's
 * App opened it; a proposal made on GitHub is its opener's, whatever its text says.
 */
export function madeBy(pr: PrSummary, reader: Reader, app: string | null): Answer {
	if (app === null || !pr.author) return null;
	if (same(pr.author, app)) return signedBy(identityFromPrBody(pr.body), reader);
	return reader.githubLogin === null ? null : same(pr.author, reader.githubLogin);
}

/** Whether the reader made a proposal or wrote one of its commits. */
export function authorship(
	pr: PrSummary,
	commits: PrCommit[],
	reader: Reader,
	app: string | null
): Writing {
	const own = madeBy(pr, reader, app);
	const along = commits.map((c) => commitBy(c, reader, app));
	// GitHub lists no more commits than this, so one beyond them could be the reader's.
	if (commits.length >= MAX_PR_COMMITS) along.push(null);
	return { own, along: anyOf(along) };
}

/** Why four eyes keeps the reader from merging: wrote it, wrote along, or Schrijver cannot tell. */
export function fourEyes(writing: Writing): 'zelf' | 'mee' | 'onbekend' | null {
	if (writing.own === true) return 'zelf';
	if (writing.along === true) return 'mee';
	if (writing.own === null || writing.along === null) return 'onbekend';
	return null;
}
