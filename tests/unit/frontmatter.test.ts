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
});
