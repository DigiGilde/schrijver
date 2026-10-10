import { identityFromPrBody, trailersFromMessage, type Identity } from './trailers';
import { MAX_PR_COMMITS, type PrCommit, type PrSummary } from './types';

/** Yes or no where Schrijver can tell, null where it cannot. */
export type Answer = boolean | null;

export interface Reader {
	/** The SSO subject, as Schrijver records who writes. */
	sub: string;
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

/**
 * Whether content is the reader's. What the App wrote is the signer's. What was made on GitHub is the
 * account's that made it, so only a reader who linked that account wrote it: only accounts with write
 * permission push to the repository, and they decide on GitHub, under its branch protection.
 */
function writtenBy(
	author: string | null | undefined,
	signature: () => Answer,
	reader: Reader,
	app: string | null
): Answer {
	if (author && app !== null && same(author, app)) return signature();
	if (author && reader.githubLogin !== null && same(author, reader.githubLogin)) return true;
	// Without the App's account, an author it names could still be the App.
	return app === null && author ? null : false;
}

function commitBy(commit: PrCommit, reader: Reader, app: string | null): Answer {
	return writtenBy(
		commit.author,
		() => {
			const trailers = trailersFromMessage(commit.message);
			return trailers.length === 0 ? null : anyOf(trailers.map((t) => signedBy(t, reader)));
		},
		reader,
		app
	);
}

/**
 * Whether the reader made a proposal, from what GitHub says now. Its signature counts only when Schrijver's
 * App opened it; a proposal made on GitHub is its opener's, whatever its text says.
 */
export function madeBy(pr: PrSummary, reader: Reader, app: string | null): Answer {
	return writtenBy(pr.author, () => signedBy(identityFromPrBody(pr.body), reader), reader, app);
}

/**
 * Whether the reader made a proposal or wrote one of its commits. `writers` are the subs Schrijver
 * recorded as writing in it, the one who opened it first.
 */
export function authorship(
	pr: PrSummary,
	commits: PrCommit[],
	reader: Reader,
	app: string | null,
	writers: readonly string[]
): Writing {
	const recorded = writers.length > 0;
	// Once Schrijver recorded who writes, the record answers for what its App wrote: a signature that
	// cannot be compared no longer counts against the reader, one that is theirs still does.
	const settle = (answer: Answer): Answer => (recorded && answer === null ? false : answer);
	const own = anyOf([writers[0] === reader.sub, settle(madeBy(pr, reader, app))]);
	const along = [
		writers.slice(1).includes(reader.sub),
		...commits.map((c) => settle(commitBy(c, reader, app)))
	];
	// GitHub lists no more commits than this, so one beyond them could be the reader's: made on GitHub
	// under their linked account, or, without a record, by Schrijver for them.
	if (commits.length >= MAX_PR_COMMITS)
		along.push(recorded && reader.githubLogin === null ? false : null);
	return { own, along: anyOf(along) };
}

/** Who made a proposal, as others may read it: the GitHub login, the name, or an anonymous colleague. */
export function authorName(pr: PrSummary, app: string | null): string {
	if (app !== null && pr.author && !same(pr.author, app)) return pr.author;
	const line = identityFromPrBody(pr.body)?.trim() ?? '';
	if (PSEUDONYM.test(line)) return 'een anonieme collega';
	const linked = /<\d+\+([^@<>\s]+)@users\.noreply\.github\.com>$/.exec(line)?.[1];
	if (LINKED.test(line) && linked) return linked;
	const named = NAMED.test(line) ? /^Co-authored-by: ([^<>]+) </.exec(line)?.[1].trim() : null;
	return named || 'een onbekende collega';
}

/** Why four eyes keeps the reader from merging: wrote it, wrote along, or Schrijver cannot tell. */
export function fourEyes(writing: Writing): 'zelf' | 'mee' | 'onbekend' | null {
	if (writing.own === true) return 'zelf';
	if (writing.along === true) return 'mee';
	if (writing.own === null || writing.along === null) return 'onbekend';
	return null;
}
