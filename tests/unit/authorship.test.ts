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
const REPO = 'o/moza';
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
const SOMEONE = 'Schrijver-Auteur: 111111111111';

const pr = (over: Partial<PrSummary>): PrSummary =>
	({
		body: `Voorgesteld.\n\n${SOMEONE}`,
		author: APP,
		headRepo: REPO,
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
) => fourEyes(authorship(proposal, commits, reader, { app, repo: REPO, writers }));

describe('signedBy', () => {
	it('compares each kind of signature with the identity of that kind', () => {
		expect(signedBy('Schrijver-Auteur: 9f86d081884c', ALL)).toBe(true);
		expect(signedBy(SOMEONE, ALL)).toBe(false);
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
		expect(why(signed(SOMEONE), ALL, { writers })).toBe('zelf');
		expect(why(signed(SOMEONE), { ...OTHER, sub: 'piet' }, { writers })).toBe('mee');
		expect(why(signed(SOMEONE), OTHER, { writers })).toBeNull();
	});

	it('lets another editor decide where a signature cannot be compared, once the record accounts for it', () => {
		for (const line of [LINKED_JANSEN, NAMED_JAN, 'Zonder ondertekening']) {
			const commits = [commit(`Bewerk\n\n${line}`)];
			expect(why(signed(line), OTHER, { commits }), `${line}, no record`).toBe('onbekend');
			expect(why(signed(line), OTHER, { commits, writers: ['jan'] }), line).toBeNull();
		}
	});

	it('blocks again when a signer is missing from the record: from before it, elsewhere, or not written', () => {
		const commits = [
			commit(`Bewerk\n\n${LINKED_JANSEN}`),
			commit('Bewerk\n\nSchrijver-Auteur: bbbbbbbbbbbb')
		];
		const proposal = signed(LINKED_JANSEN);
		expect(why(proposal, OTHER, { commits, writers: ['mee'] })).toBe('onbekend');
		expect(why(proposal, OTHER, { commits, writers: ['jan', 'mee'] })).toBeNull();
		const renamed = [commit('Bewerk\n\nCo-authored-by: Jan J. <JAN@example.org>')];
		expect(why(signed(NAMED_JAN), OTHER, { commits: renamed, writers: ['jan'] })).toBeNull();
	});

	it("still counts a signature that is the reader's, for a writer from before the records", () => {
		expect(why(signed('Schrijver-Auteur: 9f86d081884c'), ALL, { writers: ['piet'] })).toBe('zelf');
		const along = [commit(`Bewerk\n\n${NAMED_JAN}`)];
		expect(why(signed(SOMEONE), ALL, { commits: along, writers: ['piet'] })).toBe('mee');
	});

	it('counts a recorded writer also where GitHub has made or touched the proposal', () => {
		const jan = { ...BY_ADDRESS, sub: 'jan' };
		const openedOnGitHub = pr({ author: 'pietersen', body: 'Op GitHub gemaakt.' });
		expect(why(openedOnGitHub, jan, { writers: ['jan'] })).toBe('mee');
		const touched = [commit(`Bewerk\n\n${SOMEONE}`), commit('Fix', 'pietersen')];
		expect(why(signed(SOMEONE), jan, { commits: touched, writers: ['jan'] })).toBe('zelf');
	});

	it("without a complete record, counts a signature that is the reader's and cannot tell from any other", () => {
		for (const [line, other] of [
			['Schrijver-Auteur: 9f86d081884c', SOMEONE],
			[LINKED_JANSEN, 'Co-authored-by: ander <8+ander@users.noreply.github.com>'],
			[NAMED_JAN, 'Co-authored-by: Piet <piet@example.org>']
		]) {
			expect(why(signed(line), ALL), line).toBe('zelf');
			expect(why(signed(other), ALL), other).toBe('onbekend');
			expect(why(signed(other), ALL, { writers: ['piet'] }), `${other}, recorded`).toBeNull();
		}
		expect(why(signed('Schrijver-Auteur: 9f86d081884c'), OTHER)).toBe('onbekend');
		expect(why(signed(LINKED_JANSEN), BY_ADDRESS)).toBe('onbekend');
		expect(why(signed(NAMED_JAN), OTHER)).toBe('onbekend');
		expect(why(pr({ body: 'Geen ondertekening' }), ALL)).toBe('onbekend');
	});

	describe('keeps a writer whose signature no longer matches who they are now from merging', () => {
		/** The writer, as they can sign today. */
		const NOW: Reader = {
			sub: 'e',
			identities: [
				{ kind: 'anoniem', pseudoniem: 'eeeeeeeeeeee' },
				{ kind: 'gekoppeld', name: 'e-nieuw', githubId: 8, login: 'e-nieuw' },
				{ kind: 'op-naam', name: 'E', email: 'e-nieuw@example.org' }
			],
			githubLogin: 'e-nieuw'
		};
		const THEN = {
			'anonymous under another pseudonym secret': 'Schrijver-Auteur: 0123456789ab',
			'with the GitHub account they linked before':
				'Co-authored-by: e <7+e@users.noreply.github.com>',
			'with the address they had before': 'Co-authored-by: E <e-oud@example.org>'
		};
		/** One more signer than the record names: someone whose record was not written. */
		const unrecorded = [commit('Bewerk\n\nSchrijver-Auteur: 222222222222')];

		for (const [how, line] of Object.entries(THEN)) {
			it(`who signed ${how}`, () => {
				const commits = [commit(`Bewerk\n\n${line}`)];
				expect(why(signed(line), NOW, { commits }), 'no record').toBe('onbekend');
				expect(
					why(signed(line), NOW, { commits: [...commits, ...unrecorded], writers: ['ander'] }),
					'an incomplete record'
				).toBe('onbekend');
				expect(why(signed(line), NOW, { commits, writers: ['e'] }), 'recorded').toBe('zelf');
				expect(why(signed(line), OTHER, { commits, writers: ['e'] }), 'another editor').toBeNull();
			});
		}

		it('who is recorded, also where the record is not complete', () => {
			const line = THEN['anonymous under another pseudonym secret'];
			const commits = [commit(`Bewerk\n\n${line}`), ...unrecorded];
			expect(why(signed(line), NOW, { commits, writers: ['e'] })).toBe('zelf');
			expect(why(signed(line), { ...OTHER, sub: 'mee' }, { commits, writers: ['e', 'mee'] })).toBe(
				'mee'
			);
			expect(why(signed(line), OTHER, { commits, writers: ['e'] })).toBe('onbekend');
		});
	});
});

describe('four eyes for what was made on GitHub', () => {
	it("takes a proposal opened on GitHub as its opener's, whatever its text says", () => {
		const forged = pr({ author: 'jansen', body: `x\n\n${SOMEONE}` });
		expect(why(forged, ALL)).toBe('zelf');
		expect(why(pr({ author: 'pietersen' }), ALL)).toBeNull();
	});

	it('does not count a reader without a linked GitHub account as its writer, with or without records', () => {
		const github = pr({ author: 'pietersen', body: 'Op GitHub gemaakt.' });
		const commits = [commit('Fix', 'pietersen'), commit('Nog een', null)];
		expect(why(github, BY_ADDRESS, { commits })).toBeNull();
		expect(why(github, BY_ADDRESS, { commits, writers: ['jan'] })).toBeNull();
		const ghost = pr({ author: undefined, body: 'Op GitHub, door een verwijderd account' });
		expect(why(ghost, OTHER)).toBeNull();
	});

	it('counts a commit made on GitHub under the linked account as writing along', () => {
		const commits = [commit('Fix', 'jansen')];
		expect(why(signed(SOMEONE), ALL, { commits })).toBe('mee');
		expect(why(signed(SOMEONE), ALL, { commits, writers: ['piet'] })).toBe('mee');
		expect(
			why(signed(SOMEONE), { ...ALL, githubLogin: 'piet' }, { commits, writers: ['piet'] })
		).toBeNull();
	});

	it('holds only for a head branch in the site repository, not for a fork, a deleted fork or none', () => {
		for (const headRepo of ['iemand/moza', '', undefined]) {
			const fork = pr({ author: 'pietersen', body: 'Uit een fork.', headRepo });
			const commits = [commit('Fix', 'pietersen')];
			expect(why(fork, BY_ADDRESS, { commits }), String(headRepo)).toBe('onbekend');
			expect(why(fork, BY_ADDRESS, { commits, writers: ['jan'] }), String(headRepo)).toBe(
				'onbekend'
			);
			expect(why({ ...fork, author: 'jansen' }, ALL), String(headRepo)).toBe('zelf');
		}
	});
});

describe('four eyes where GitHub does not tell everything', () => {
	it('cannot tell without the App account, record or not', () => {
		expect(why(signed(SOMEONE), OTHER, { app: null })).toBe('onbekend');
		expect(why(signed(SOMEONE), OTHER, { app: null, writers: ['jan'] })).toBe('onbekend');
		expect(why(signed(SOMEONE), ALL, { app: null, writers: ['jan'] })).toBe('mee');
		expect(why(pr({ author: 'jansen' }), ALL, { app: null })).toBe('zelf');
	});

	it('cannot tell from a list as long as GitHub gives, record or not', () => {
		const commits = Array(250).fill(commit(`Bewerk\n\n${SOMEONE}`));
		expect(why(signed(SOMEONE), OTHER, { commits: commits.slice(1), writers: ['jan'] })).toBeNull();
		expect(why(signed(SOMEONE), OTHER, { commits })).toBe('onbekend');
		expect(why(signed(SOMEONE), OTHER, { commits, writers: ['jan'] })).toBe('onbekend');
	});
});

describe('authorship', () => {
	it('reads who made a proposal in Schrijver from its signature, and who wrote along from its commits', () => {
		const context = { app: APP, repo: REPO, writers: [] };
		const made = pr({ body: 'x\n\nSchrijver-Auteur: 9f86d081884c' });
		expect(authorship(made, [], ALL, context)).toEqual({ own: true, along: false });
		const commits = [commit(`Bewerk\n\n${SOMEONE}`), commit(`Bijgewerkt\n\n${NAMED_JAN}`)];
		const recorded = { ...context, writers: ['piet', 'kees'] };
		expect(authorship(pr({}), commits, ALL, recorded)).toEqual({ own: false, along: true });
		expect(authorship(pr({}), commits.slice(0, 1), ALL, recorded)).toEqual({
			own: false,
			along: false
		});
		expect(authorship(pr({}), commits.slice(0, 1), ALL, context)).toEqual({
			own: null,
			along: null
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
