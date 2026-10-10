import { describe, expect, it } from 'vitest';
import { parsePage, serializePage } from '../../src/lib/content/frontmatter';

function ok(text: string) {
	const page = parsePage(text);
	if (!page.ok) throw new Error(`expected ok, got ${page.reason}`);
	return page;
}

describe('parsePage', () => {
	it('handles a file without frontmatter', () => {
		const text = '# Title\n\nBody\n';
		const page = ok(text);
		expect(page.rawFrontmatter).toBeNull();
		expect(page.frontmatter).toEqual({});
		expect(page.body).toBe(text);
		expect(page.newlineAtEnd).toBe(true);
		expect(serializePage(page, [])).toBe(text);
	});

	it('returns toml for +++ frontmatter', () => {
		const page = parsePage('+++\ntitle = "x"\n+++\nBody\n');
		expect(page).toMatchObject({ ok: false, reason: 'toml' });
	});

	it('returns yaml-error for invalid YAML', () => {
		const page = parsePage('---\nfoo: [\n---\nBody\n');
		expect(page).toMatchObject({ ok: false, reason: 'yaml-error' });
	});

	it('returns unterminated without a closing fence', () => {
		const page = parsePage('---\nfoo: 1\nBody\n');
		expect(page).toMatchObject({ ok: false, reason: 'unterminated' });
	});

	it('says in Dutch what is wrong with the properties, without the word frontmatter', () => {
		const messages = [
			parsePage('+++\ntitle = "x"\n+++\nBody\n'),
			parsePage('---\nfoo: 1\nBody\n'),
			parsePage('---\n- a\n- b\n---\nBody\n')
		].map((page) => (page.ok ? '' : page.message));
		expect(messages).toEqual([
			'Eigenschappen in TOML worden niet ondersteund',
			'Na de eigenschappen ontbreekt een regel met ---',
			'De eigenschappen zijn geen lijst met namen en waarden'
		]);
	});

	it('reads fields and keeps a leading blank line in the body', () => {
		const page = ok('---\ntitle: "A"\n---\n\nBody');
		expect(page.frontmatter).toEqual({ title: 'A' });
		expect(page.rawFrontmatter).toBe('title: "A"\n');
		expect(page.body).toBe('\nBody');
		expect(page.newlineAtEnd).toBe(false);
	});
});

describe('serializePage', () => {
	const text = '---\n# keep me\ntitle: "Quoted"\ndescription: old\n---\n\nBody\n';

	it('round-trips verbatim when nothing changed', () => {
		expect(serializePage(ok(text), [])).toBe(text);
	});

	it('round-trips empty frontmatter and a missing final newline', () => {
		for (const t of ['---\n---\nBody', '---\n---', '---\na: 1\n---\n', '---\na: 1\n---']) {
			expect(serializePage(ok(t), [])).toBe(t);
		}
	});

	it('changes one key and leaves comment, order and quoting alone', () => {
		const page = ok(text);
		page.frontmatter.description = 'new';
		expect(serializePage(page, ['description'])).toBe(
			'---\n# keep me\ntitle: "Quoted"\ndescription: new\n---\n\nBody\n'
		);
	});

	it('appends new keys at the end', () => {
		const page = ok(text);
		page.frontmatter.draft = true;
		expect(serializePage(page, ['draft'])).toBe(
			'---\n# keep me\ntitle: "Quoted"\ndescription: old\ndraft: true\n---\n\nBody\n'
		);
	});

	it('deletes a key when the value is undefined', () => {
		const page = ok(text);
		page.frontmatter.description = undefined;
		expect(serializePage(page, ['description'])).toBe(
			'---\n# keep me\ntitle: "Quoted"\n---\n\nBody\n'
		);
	});

	it('creates frontmatter when none existed and a key is set', () => {
		const page = ok('Body\n');
		page.frontmatter.title = 'Hi';
		expect(serializePage(page, ['title'])).toBe('---\ntitle: Hi\n---\nBody\n');
	});

	it('sets a key in empty frontmatter', () => {
		const page = ok('---\n---\nBody\n');
		page.frontmatter.title = 'Hi';
		expect(serializePage(page, ['title'])).toBe('---\ntitle: Hi\n---\nBody\n');
	});

	it('preserves CRLF when unchanged and when editing', () => {
		const crlf = '---\r\ntitle: "T"\r\ndescription: old\r\n---\r\n\r\nBody\r\n';
		const page = ok(crlf);
		expect(page.frontmatter).toEqual({ title: 'T', description: 'old' });
		expect(serializePage(page, [])).toBe(crlf);
		page.frontmatter.description = 'new';
		expect(serializePage(page, ['description'])).toBe(
			'---\r\ntitle: "T"\r\ndescription: new\r\n---\r\n\r\nBody\r\n'
		);
	});

	it('keeps CRLF when the block is empty', () => {
		const page = ok('---\r\n---\r\nBody\r\n');
		page.frontmatter.title = 'Hi';
		expect(serializePage(page, ['title'])).toBe('---\r\ntitle: Hi\r\n---\r\nBody\r\n');
	});

	it('keeps a trailing comment at the end of the block without a stray blank line', () => {
		const page = ok('---\na: 1\n# trailing\n---\n');
		page.frontmatter.b = 2;
		expect(serializePage(page, ['b'])).toBe('---\na: 1\nb: 2\n# trailing\n---\n');
	});

	it('puts a new key after a comment-only block without a blank line', () => {
		const page = ok('---\n# only comment\n---\n');
		page.frontmatter.b = 2;
		expect(serializePage(page, ['b'])).toBe('---\n# only comment\nb: 2\n---\n');
	});

	it('keeps only the comment when the last key is deleted', () => {
		const page = ok('---\na: 1\n# c\n---\n');
		page.frontmatter.a = undefined;
		expect(serializePage(page, ['a'])).toBe('---\n# c\n---\n');
	});

	it('writes an empty block when the last key is deleted', () => {
		const page = ok('---\na: 1\n---\nBody\n');
		page.frontmatter.a = undefined;
		expect(serializePage(page, ['a'])).toBe('---\n---\nBody\n');
	});

	it('restores a byte order mark and does not add a second block', () => {
		const text = '\uFEFF---\na: 1\n---\nBody\n';
		const page = ok(text);
		expect(page.frontmatter).toEqual({ a: 1 });
		expect(serializePage(page, [])).toBe(text);
		page.frontmatter.a = 2;
		expect(serializePage(page, ['a'])).toBe('\uFEFF---\na: 2\n---\nBody\n');
	});

	it('keeps a byte order mark in a file without frontmatter', () => {
		const text = '\uFEFF# Title\n';
		expect(serializePage(ok(text), [])).toBe(text);
	});

	it('only treats +++ followed by a line break as TOML', () => {
		expect(parsePage('+++\nx\n+++\n')).toMatchObject({ ok: false, reason: 'toml' });
		expect(parsePage('+++ not toml\n')).toMatchObject({ ok: true });
	});
});
