import { describe, it, expect } from 'vitest';
import {
	pseudonym,
	identityTrailer,
	commitMessage,
	identityFromPrBody,
	type Identity
} from '../../src/lib/forge/trailers';

describe('pseudonym', () => {
	it('is deterministic, 12 lowercase hex chars', () => {
		const a = pseudonym('secret', 'user-sub-1');
		expect(a).toBe(pseudonym('secret', 'user-sub-1'));
		expect(a).toMatch(/^[0-9a-f]{12}$/);
	});

	it('differs per secret', () => {
		expect(pseudonym('secret-a', 'sub')).not.toBe(pseudonym('secret-b', 'sub'));
	});

	it('differs per sub', () => {
		expect(pseudonym('secret', 'sub-a')).not.toBe(pseudonym('secret', 'sub-b'));
	});
});

describe('identityTrailer', () => {
	it('anoniem', () => {
		const id: Identity = { kind: 'anoniem', pseudoniem: 'abcdef012345' };
		expect(identityTrailer(id)).toBe('Schrijver-Auteur: abcdef012345');
	});

	it('gekoppeld', () => {
		const id: Identity = { kind: 'gekoppeld', name: 'Jan', githubId: 123, login: 'jan' };
		expect(identityTrailer(id)).toBe('Co-authored-by: Jan <123+jan@users.noreply.github.com>');
	});

	it('op-naam', () => {
		const id: Identity = { kind: 'op-naam', name: 'Jan Jansen', email: 'jan@example.nl' };
		expect(identityTrailer(id)).toBe('Co-authored-by: Jan Jansen <jan@example.nl>');
	});
});

describe('commitMessage', () => {
	it('joins summary, blank line and trailer without trailing newline', () => {
		const id: Identity = { kind: 'anoniem', pseudoniem: 'abcdef012345' };
		expect(commitMessage('Update page', id)).toBe(
			'Update page\n\nSchrijver-Auteur: abcdef012345'
		);
	});
});

describe('identityFromPrBody', () => {
	it('finds a Schrijver-Auteur line among other text', () => {
		const body = 'Some intro\n\nSchrijver-Auteur: abcdef012345\n\nMore text';
		expect(identityFromPrBody(body)).toBe('Schrijver-Auteur: abcdef012345');
	});

	it('finds a Co-authored-by line, trimmed', () => {
		const body = 'Intro  \n   Co-authored-by: Jan <123+jan@users.noreply.github.com>  \nOutro';
		expect(identityFromPrBody(body)).toBe('Co-authored-by: Jan <123+jan@users.noreply.github.com>');
	});

	it('returns null when no trailer is present', () => {
		expect(identityFromPrBody('Just a description')).toBeNull();
	});
});
