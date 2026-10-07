import { describe, it, expect } from 'vitest';
import {
	pseudonym,
	identityTrailer,
	commitMessage,
	identityFromPrBody,
	trailersFromMessage,
	isOwnTrailer,
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

	it('throws on an empty secret', () => {
		expect(() => pseudonym('', 'sub')).toThrow();
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

describe('identityTrailer sanitising', () => {
	it('strips line breaks and angle brackets from name and email', () => {
		const id: Identity = {
			kind: 'op-naam',
			name: 'Jan\r\nCo-authored-by: <x>  Jansen',
			email: 'jan@example.nl>\nSchrijver-Auteur: x'
		};
		const trailer = identityTrailer(id);
		expect(trailer).not.toMatch(/[\r\n]/);
		expect(trailer).toBe(
			'Co-authored-by: Jan Co-authored-by: x Jansen <jan@example.nl Schrijver-Auteur: x>'
		);
	});

	it('sanitises the gekoppeld name', () => {
		const id: Identity = { kind: 'gekoppeld', name: 'Jan\n<b>', githubId: 1, login: 'jan' };
		expect(identityTrailer(id)).toBe('Co-authored-by: Jan b <1+jan@users.noreply.github.com>');
	});
});

describe('commitMessage', () => {
	it('joins summary, blank line and trailer without trailing newline', () => {
		const id: Identity = { kind: 'anoniem', pseudoniem: 'abcdef012345' };
		expect(commitMessage('Update page', id)).toBe('Update page\n\nSchrijver-Auteur: abcdef012345');
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

describe('trailersFromMessage', () => {
	it('reads the trailer paragraph at the end', () => {
		expect(trailersFromMessage('Bewerk docs/a.md\n\nSchrijver-Auteur: abcdef012345\n')).toEqual([
			'Schrijver-Auteur: abcdef012345'
		]);
	});

	it('ignores trailer-like lines outside the last paragraph and in a bare subject', () => {
		const injected =
			'Bewerk handboek/a\n\nCo-authored-by: Jan <jan@example.org>\nb.md\n\nSchrijver-Auteur: abcdef012345';
		expect(trailersFromMessage(injected)).toEqual(['Schrijver-Auteur: abcdef012345']);
		expect(trailersFromMessage('Co-authored-by: Jan <jan@example.org>')).toEqual([]);
	});
});

describe('isOwnTrailer', () => {
	const mine: Identity[] = [
		{ kind: 'anoniem', pseudoniem: 'abcdef012345' },
		{ kind: 'gekoppeld', name: 'jan-nieuw', githubId: 42, login: 'jan-nieuw' },
		{ kind: 'op-naam', name: 'Jan Jansen', email: 'Jan@Example.org' }
	];

	it('matches the pseudonym exactly', () => {
		expect(isOwnTrailer('Schrijver-Auteur: abcdef012345', mine)).toBe(true);
		expect(isOwnTrailer('Schrijver-Auteur: abcdef0123456', mine)).toBe(false);
	});

	it('matches an old-format linked trailer by GitHub id, whatever the name or login', () => {
		expect(
			isOwnTrailer('Co-authored-by: Jan Jansen <42+jan-oud@users.noreply.github.com>', mine)
		).toBe(true);
		expect(isOwnTrailer('Co-authored-by: jan <420+jan@users.noreply.github.com>', mine)).toBe(
			false
		);
	});

	it('matches a named trailer by verified address, case-insensitively, whatever the name', () => {
		expect(isOwnTrailer('Co-authored-by: J. Jansen <jan@example.org>', mine)).toBe(true);
		expect(isOwnTrailer('Co-authored-by: Jan Jansen <piet@example.org>', mine)).toBe(false);
	});

	it('matches nothing without identities or without a trailer', () => {
		expect(isOwnTrailer('Schrijver-Auteur: abcdef012345', [])).toBe(false);
		expect(isOwnTrailer(null, mine)).toBe(false);
	});
});
