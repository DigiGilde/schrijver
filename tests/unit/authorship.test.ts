import { describe, expect, it } from 'vitest';
import { authorship, fourEyes, signedBy } from '../../src/lib/forge/authorship';
import type { Identity } from '../../src/lib/forge/trailers';
import type { PrCommit, PrSummary } from '../../src/lib/forge/types';

const APP = 'schrijver[bot]';
const ANONIEM: Identity = { kind: 'anoniem', pseudoniem: '9f86d081884c' };
const GEKOPPELD: Identity = { kind: 'gekoppeld', name: 'jansen', githubId: 7, login: 'jansen' };
const OP_NAAM: Identity = { kind: 'op-naam', name: 'Jan Jansen', email: 'Jan@Example.org' };

/** A reader who can sign in each of the three ways. */
const ALL = { identities: [ANONIEM, GEKOPPELD, OP_NAAM], githubLogin: 'jansen' };
/** Someone known by address only: no linked GitHub account. */
const BY_ADDRESS = {
	identities: [{ kind: 'anoniem', pseudoniem: '000000000000' } as Identity, OP_NAAM],
	githubLogin: null
};

const pr = (over: Partial<PrSummary>): PrSummary =>
	({
		body: 'Voorgesteld.\n\nSchrijver-Auteur: 111111111111',
		author: APP,
		...over
	}) as PrSummary;
const commit = (message: string, author: string | null = APP): PrCommit => ({
	sha: 'abc',
	message,
	author
});

describe('signedBy', () => {
	it('compares each kind of signature with the identity of that kind', () => {
		expect(signedBy('Schrijver-Auteur: 9f86d081884c', ALL)).toBe(true);
		expect(signedBy('Schrijver-Auteur: 111111111111', ALL)).toBe(false);
		expect(signedBy('Co-authored-by: jansen <7+jansen@users.noreply.github.com>', ALL)).toBe(true);
		expect(signedBy('Co-authored-by: ander <8+ander@users.noreply.github.com>', ALL)).toBe(false);
		expect(signedBy('Co-authored-by: Jan Jansen <jan@example.org>', ALL)).toBe(true);
		expect(signedBy('Co-authored-by: Piet <piet@example.org>', ALL)).toBe(false);
	});

	it('cannot tell for a signature of a kind the reader holds no identity of', () => {
		expect(signedBy('Co-authored-by: jansen <7+jansen@users.noreply.github.com>', BY_ADDRESS)).toBe(
			null
		);
		const linkedOnly = { identities: [ANONIEM, GEKOPPELD], githubLogin: 'jansen' };
		expect(signedBy('Co-authored-by: Jan Jansen <jan@example.org>', linkedOnly)).toBeNull();
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

describe('authorship', () => {
	it('reads who made a proposal in Schrijver from its signature, and who wrote along from its commits', () => {
		const made = pr({ body: 'x\n\nSchrijver-Auteur: 9f86d081884c' });
		expect(authorship(made, [], ALL, APP)).toEqual({ own: true, along: false });
		const other = pr({});
		const commits = [
			commit('Bewerk\n\nSchrijver-Auteur: 111111111111'),
			commit('Bijgewerkt\n\nCo-authored-by: Jan Jansen <jan@example.org>')
		];
		expect(authorship(other, commits, ALL, APP)).toEqual({ own: false, along: true });
		expect(authorship(other, commits.slice(0, 1), ALL, APP)).toEqual({ own: false, along: false });
	});

	it('takes a proposal made on GitHub as written by whoever opened it, whatever its text says', () => {
		const forged = pr({ author: 'jansen', body: 'x\n\nSchrijver-Auteur: 111111111111' });
		expect(authorship(forged, [], ALL, APP).own).toBe(true);
		expect(authorship(pr({ author: 'pietersen' }), [], ALL, APP).own).toBe(false);
		expect(authorship(pr({ author: 'pietersen' }), [], BY_ADDRESS, APP).own).toBeNull();
	});

	it('cannot tell without a signature, without the App account or without an opener', () => {
		expect(authorship(pr({ body: 'Geen ondertekening' }), [], ALL, APP).own).toBeNull();
		expect(authorship(pr({}), [], ALL, null).own).toBeNull();
		expect(authorship(pr({ author: undefined }), [], ALL, APP).own).toBeNull();
	});

	it('reads a commit made on GitHub by its author, and cannot tell without one', () => {
		const other = pr({});
		expect(authorship(other, [commit('Fix', 'jansen')], ALL, APP).along).toBe(true);
		expect(authorship(other, [commit('Fix', 'pietersen')], ALL, APP).along).toBe(false);
		expect(authorship(other, [commit('Fix', 'pietersen')], BY_ADDRESS, APP).along).toBeNull();
		expect(authorship(other, [commit('Fix', null)], ALL, APP).along).toBeNull();
		expect(authorship(other, [commit('Zonder ondertekening')], ALL, APP).along).toBeNull();
	});

	it('cannot tell from a list as long as GitHub gives, which may leave commits out', () => {
		const other = commit('Bewerk\n\nSchrijver-Auteur: 111111111111');
		expect(authorship(pr({}), Array(249).fill(other), ALL, APP).along).toBe(false);
		expect(authorship(pr({}), Array(250).fill(other), ALL, APP).along).toBeNull();
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
