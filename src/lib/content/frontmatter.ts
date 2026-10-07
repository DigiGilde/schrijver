import { Document, parseDocument } from 'yaml';

export type ParsedPage =
	| {
			ok: true;
			frontmatter: Record<string, unknown>;
			/** Text between the fences, including the line break that ends its last line ('' when empty). */
			rawFrontmatter: string | null;
			body: string;
			newlineAtEnd: boolean;
			/** True when the file started with a U+FEFF byte order mark, restored on serialise. */
			bom?: boolean;
	  }
	| { ok: false; reason: 'toml' | 'yaml-error' | 'unterminated'; message: string };

type PageData = {
	frontmatter: Record<string, unknown>;
	rawFrontmatter: string | null;
	body: string;
	newlineAtEnd: boolean;
	bom?: boolean;
};

const TO_STRING_OPTIONS = { lineWidth: 0 };

function detectEol(text: string): string {
	const index = text.indexOf('\n');
	return index > 0 && text[index - 1] === '\r' ? '\r\n' : '\n';
}

export function parsePage(input: string): ParsedPage {
	const bom = input.startsWith('\uFEFF');
	const text = bom ? input.slice(1) : input;
	const result = parseText(text);
	if (!bom) return result;
	if (!result.ok) return result;
	return result.rawFrontmatter === null ? parseText(input) : { ...result, bom };
}

function parseText(text: string): ParsedPage {
	const newlineAtEnd = text.endsWith('\n');

	if (/^\+\+\+\r?(\n|$)/.test(text)) {
		return { ok: false, reason: 'toml', message: 'TOML frontmatter is not supported' };
	}

	const opening = text.startsWith('---\r\n') ? 5 : text.startsWith('---\n') ? 4 : 0;
	if (!opening) {
		return { ok: true, frontmatter: {}, rawFrontmatter: null, body: text, newlineAtEnd };
	}

	let lineStart = opening;
	while (lineStart <= text.length) {
		const newline = text.indexOf('\n', lineStart);
		const lineEnd = newline === -1 ? text.length : newline;
		const line = text.slice(lineStart, lineEnd).replace(/\r$/, '');
		if (line === '---') {
			const rawFrontmatter = text.slice(opening, lineStart);
			const body = newline === -1 ? '' : text.slice(newline + 1);
			return parseYaml(rawFrontmatter, body, newlineAtEnd);
		}
		if (newline === -1) break;
		lineStart = newline + 1;
	}
	return { ok: false, reason: 'unterminated', message: 'Frontmatter has no closing --- line' };
}

function parseYaml(rawFrontmatter: string, body: string, newlineAtEnd: boolean): ParsedPage {
	const doc = parseDocument(rawFrontmatter);
	if (doc.errors.length > 0) {
		return { ok: false, reason: 'yaml-error', message: doc.errors[0].message };
	}
	const value = doc.toJS() ?? {};
	if (typeof value !== 'object' || Array.isArray(value)) {
		return { ok: false, reason: 'yaml-error', message: 'Frontmatter is not a mapping' };
	}
	return { ok: true, frontmatter: value, rawFrontmatter, body, newlineAtEnd };
}

function collapseCommentGap(yaml: string, doc: Document, raw: string): string {
	const block = (comment: string) =>
		comment
			.split('\n')
			.map((line) => `#${line}`)
			.join('\n') + '\n';
	// The library separates a trailing or leading document comment from the content with a blank line.
	// A trailing comment stays at the end of the block, after any newly added key.
	if (doc.comment) {
		const trailing = block(doc.comment);
		if (yaml.endsWith(`\n\n${trailing}`)) yaml = yaml.slice(0, -trailing.length - 1) + trailing;
	}
	if (doc.commentBefore) {
		const leading = block(doc.commentBefore);
		if (yaml.startsWith(`${leading}\n`) && !raw.replace(/\r/g, '').startsWith(`${leading}\n`)) {
			yaml = leading + yaml.slice(leading.length + 1);
		}
	}
	return yaml;
}

export function serializePage(page: PageData, changedKeys: string[]): string {
	const eol = detectEol(page.rawFrontmatter || page.body);
	const bom = page.bom ? '\uFEFF' : '';
	let raw = page.rawFrontmatter;

	if (changedKeys.length > 0) {
		const doc = raw === null ? new Document({}) : parseDocument(raw);
		for (const key of changedKeys) {
			const value = page.frontmatter[key];
			if (value === undefined) doc.delete(key);
			else doc.set(key, value);
		}
		let yaml = doc.toString(TO_STRING_OPTIONS);
		// An emptied mapping prints as `{}`; keep only the comments that remain.
		yaml = yaml.replace(/^\{\}\n\n?/, '');
		yaml = collapseCommentGap(yaml, doc, raw ?? '');
		raw = yaml === '' && page.rawFrontmatter === null ? null : yaml.replace(/\r?\n/g, eol);
	}

	if (raw === null) return page.body;
	const closing = page.body === '' && !page.newlineAtEnd ? '---' : `---${eol}`;
	return `${bom}---${eol}${raw}${closing}${page.body}`;
}
