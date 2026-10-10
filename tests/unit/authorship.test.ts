import { describe, expect, it } from 'vitest';
import {
	authorName,
	authorship,
	fourEyes,
	signedBy,
	type Reader
} from '../../src/lib/forge/authorship';
import type { Identity } from '../../src/lib/forge/trailers';
import type { PrCommit, PrSummary } from '../../src/lib/forge/types';

const APP = 'schrijver[bot]';
const ANONIEM: Identity = { kind: 'anoniem', pseudoniem: '9f86d081884c' };
const GEKOPPELD: Identity = { kind: 'gekoppeld', name: 'jansen', githubId: 7, login: 'jansen' };
const OP_NAAM: Identity = { kind: 'op-naam', name: 'Jan Jansen', email: 'Jan@Example.org' };

/** A reader who can sign in each of the three ways. */
const ALL: Reader = {
	sub: 'jan',
	identities: [ANONIEM, GEKOPPELD, OP_NAAM],
	githubLogin: 'jansen'
};
/** Someone known by address only: no linked GitHub account. */
const BY_ADDRESS: Reader = {
	sub: 'adres',
	identities: [{ kind: 'anoniem', pseudoniem: '000000000000' }, OP_NAAM],
	githubLogin: null
};
/** A member of the redactie who wrote nothing here, known by address only. */
const OTHER: Reader = {
	sub: 'ander',
	identities: [{ kind: 'anoniem', pseudoniem: 'aaaaaaaaaaaa' }],
	githubLogin: null
};

const LINKED_JANSEN = 'Co-authored-by: jansen <7+jansen@users.noreply.github.com>';
const NAMED_JAN = 'Co-authored-by: Jan Jansen <jan@example.org>';

const pr = (over: Partial<PrSummary>): PrSummary =>
	({
		body: 'Voorgesteld.\n\nSchrijver-Auteur: 111111111111',
		author: APP,
		...over
	}) as PrSummary;
const signed = (line: string) => pr({ body: `Voorgesteld.\n\n${line}` });
const commit = (message: string, author: string | null = APP): PrCommit => ({
	sha: 'abc',
	message,
	author
});
const why = (
	proposal: PrSummary,
	reader: Reader,
	{ commits = [] as PrCommit[], writers = [] as string[], app = APP as string | null } = {}
) => fourEyes(authorship(proposal, commits, reader, app, writers));

describe('signedBy', () => {
	it('compares each kind of signature with the identity of that kind', () => {
		expect(signedBy('Schrijver-Auteur: 9f86d081884c', ALL)).toBe(true);
		expect(signedBy('Schrijver-Auteur: 111111111111', ALL)).toBe(false);
		expect(signedBy(LINKED_JANSEN, ALL)).toBe(true);
		expect(signedBy('Co-authored-by: ander <8+ander@users.noreply.github.com>', ALL)).toBe(false);
		expect(signedBy(NAMED_JAN, ALL)).toBe(true);
		expect(signedBy('Co-authored-by: Piet <piet@example.org>', ALL)).toBe(false);
	});

	it('cannot tell for a signature of a kind the reader holds no identity of', () => {
		expect(signedBy(LINKED_JANSEN, BY_ADDRESS)).toBe(null);
		const linkedOnly = { sub: 'jan', identities: [ANONIEM, GEKOPPELD], githubLogin: 'jansen' };
		expect(signedBy(NAMED_JAN, linkedOnly)).toBeNull();
	});

	it('cannot tell for a missing or malformed signature', () => {
		for (const line of [
			null,
			'',
			'Schrijver-Auteur:',
			'Schrijver-Auteur: twee woorden',
			'Co-authored-by: zonder adres',
			'Co-authored-by: <>',
			'Iets anders'
		]) {
			expect(signedBy(line, ALL), String(line)).toBeNull();
		}
	});
});

describe('four eyes with the writers Schrijver recorded', () => {
	it('blocks the recorded writer who opened it, and a co-writer through Verder bewerken', () => {
		const writers = ['jan', 'piet'];
		const proposal = signed('Schrijver-Auteur: 111111111111');
		expect(why(proposal, ALL, { writers })).toBe('zelf');
		expect(why(proposal, { ...OTHER, sub: 'piet' }, { writers })).toBe('mee');
		expect(why(proposal, OTHER, { writers })).toBeNull();
	});

	it('lets another editor decide where a signature cannot be compared, once a writer is recorded', () => {
		for (const line of [LINKED_JANSEN, NAMED_JAN, 'Zonder ondertekening']) {
			const proposal = signed(line);
			const commits = [commit(`Bewerk\n\n${line}`)];
			expect(why(proposal, OTHER, { commits }), `${line}, no record`).toBe('onbekend');
			expect(why(proposal, OTHER, { commits, writers: ['jan'] }), line).toBeNull();
		}
	});

	it("still counts a signature that is the reader's, for a writer from before the records", () => {
		const proposal = signed('Schrijver-Auteur: 9f86d081884c');
		expect(why(proposal, ALL, { writers: ['piet'] })).toBe('zelf');
		const along = [commit(`Bewerk\n\n${NAMED_JAN}`)];
		expect(
			why(signed('Schrijver-Auteur: 111111111111'), ALL, { commits: along, writers: ['piet'] })
		).toBe('mee');
	});

	it('falls back to the signatures without any record, and blocks where they cannot tell', () => {
		for (const [line, mine] of [
			['Schrijver-Auteur: 9f86d081884c', 'Schrijver-Auteur: 111111111111'],
			[LINKED_JANSEN, 'Co-authored-by: ander <8+ander@users.noreply.github.com>'],
			[NAMED_JAN, 'Co-authored-by: Piet <piet@example.org>']
		]) {
			expect(why(signed(line), ALL), line).toBe('zelf');
			expect(why(signed(mine), ALL), mine).toBeNull();
		}
		expect(why(signed('Schrijver-Auteur: 9f86d081884c'), OTHER)).toBeNull();
		expect(why(signed(LINKED_JANSEN), BY_ADDRESS)).toBe('onbekend');
		expect(why(signed(NAMED_JAN), OTHER)).toBe('onbekend');
		expect(why(pr({ body: 'Geen ondertekening' }), ALL)).toBe('onbekend');
	});
});

describe('four eyes for what was made on GitHub', () => {
	it("takes a proposal opened on GitHub as its opener's, whatever its text says", () => {
		const forged = pr({ author: 'jansen', body: 'x\n\nSchrijver-Auteur: 111111111111' });
		expect(why(forged, ALL)).toBe('zelf');
		expect(why(pr({ author: 'pietersen' }), ALL)).toBeNull();
	});

	it('does not count a reader without a linked GitHub account as its writer, with or without records', () => {
		const github = pr({ author: 'pietersen', body: 'Op GitHub gemaakt.' });
		const commits = [commit('Fix', 'pietersen'), commit('Nog een', null)];
		expect(why(github, BY_ADDRESS, { commits })).toBeNull();
		expect(why(github, BY_ADDRESS, { commits, writers: ['jan'] })).toBeNull();
		expect(
			why(pr({ author: undefined, body: 'Op GitHub, door een verwijderd account' }), OTHER)
		).toBeNull();
	});

	it('counts a commit made on GitHub under the linked account as writing along', () => {
		const commits = [commit('Fix', 'jansen')];
		expect(why(signed('Schrijver-Auteur: 111111111111'), ALL, { commits })).toBe('mee');
		expect(why(signed('Schrijver-Auteur: 111111111111'), ALL, { commits, writers: ['piet'] })).toBe(
			'mee'
		);
		expect(
			why(signed('Schrijver-Auteur: 111111111111'), { ...ALL, githubLogin: 'piet' }, { commits })
		).toBeNull();
	});
});

describe('four eyes where GitHub does not tell everything', () => {
	it('cannot tell without the App account, unless a record or the linked account answers', () => {
		const proposal = signed('Schrijver-Auteur: 111111111111');
		expect(why(proposal, OTHER, { app: null })).toBe('onbekend');
		expect(why(proposal, OTHER, { app: null, writers: ['jan'] })).toBeNull();
		expect(why(proposal, ALL, { app: null, writers: ['jan'] })).toBe('zelf');
		expect(why(pr({ author: 'jansen' }), ALL, { app: null })).toBe('zelf');
	});

	it('cannot tell from a list as long as GitHub gives, but for a recorded proposal and a reader without a link', () => {
		const commits = Array(250).fill(commit('Bewerk\n\nSchrijver-Auteur: 111111111111'));
		const proposal = signed('Schrijver-Auteur: 111111111111');
		expect(why(proposal, OTHER, { commits: commits.slice(1) })).toBeNull();
		expect(why(proposal, OTHER, { commits })).toBe('onbekend');
		expect(why(proposal, OTHER, { commits, writers: ['jan'] })).toBeNull();
		expect(why(proposal, { ...OTHER, githubLogin: 'ander' }, { commits, writers: ['jan'] })).toBe(
			'onbekend'
		);
	});
});

describe('authorship', () => {
	it('reads who made a proposal in Schrijver from its signature, and who wrote along from its commits', () => {
		const made = pr({ body: 'x\n\nSchrijver-Auteur: 9f86d081884c' });
		expect(authorship(made, [], ALL, APP, [])).toEqual({ own: true, along: false });
		const other = pr({});
		const commits = [
			commit('Bewerk\n\nSchrijver-Auteur: 111111111111'),
			commit(`Bijgewerkt\n\n${NAMED_JAN}`)
		];
		expect(authorship(other, commits, ALL, APP, [])).toEqual({ own: false, along: true });
		expect(authorship(other, commits.slice(0, 1), ALL, APP, [])).toEqual({
			own: false,
			along: false
		});
	});
});

describe('authorName', () => {
	it('names the writer as their signature allows, and a proposal made on GitHub by its login', () => {
		const named = (line: string) => authorName(signed(line), APP);
		expect(named('Schrijver-Auteur: 9f86d081884c')).toBe('een anonieme collega');
		expect(named(LINKED_JANSEN)).toBe('jansen');
		expect(named(NAMED_JAN)).toBe('Jan Jansen');
		expect(authorName(pr({ body: 'Zonder' }), APP)).toBe('een onbekende collega');
		expect(authorName(pr({ author: 'pietersen', body: 'Op GitHub' }), APP)).toBe('pietersen');
		const forged = pr({ author: 'pietersen', body: 'x\n\nCo-authored-by: Jan <jan@example.org>' });
		expect(authorName(forged, APP)).toBe('pietersen');
	});
});

describe('fourEyes', () => {
	it('names why the reader may not decide, and fails closed when it cannot tell', () => {
		expect(fourEyes({ own: true, along: null })).toBe('zelf');
		expect(fourEyes({ own: false, along: true })).toBe('mee');
		expect(fourEyes({ own: null, along: false })).toBe('onbekend');
		expect(fourEyes({ own: false, along: null })).toBe('onbekend');
		expect(fourEyes({ own: false, along: false })).toBeNull();
	});
});
