import { Document, parseDocument } from 'yaml';

export type ParsedPage =
	| {
			ok: true;
			frontmatter: Record<string, unknown>;
			rawFrontmatter: string | null;
			body: string;
			newlineAtEnd: boolean;
	  }
	| { ok: false; reason: 'toml' | 'yaml-error' | 'unterminated'; message: string };

type PageData = {
	frontmatter: Record<string, unknown>;
	rawFrontmatter: string | null;
	body: string;
	newlineAtEnd: boolean;
};

const TO_STRING_OPTIONS = { lineWidth: 0 };

function detectEol(text: string): string {
	const index = text.indexOf('\n');
	return index > 0 && text[index - 1] === '\r' ? '\r\n' : '\n';
}

export function parsePage(text: string): ParsedPage {
	const newlineAtEnd = text.endsWith('\n');

	if (text.startsWith('+++')) {
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

export function serializePage(page: PageData, changedKeys: string[]): string {
	const eol = detectEol(page.rawFrontmatter ?? page.body);
	let raw = page.rawFrontmatter;

	if (changedKeys.length > 0) {
		const doc = raw === null ? new Document({}) : parseDocument(raw);
		for (const key of changedKeys) {
			const value = page.frontmatter[key];
			if (value === undefined) doc.delete(key);
			else doc.set(key, value);
		}
		const yaml = doc.contents && doc.toString(TO_STRING_OPTIONS) !== '{}\n' ? doc.toString(TO_STRING_OPTIONS) : '';
		raw = yaml === '' && page.rawFrontmatter === null ? null : yaml.replace(/\r?\n/g, eol);
	}

	if (raw === null) return page.body;
	const closing = page.body === '' && !page.newlineAtEnd ? '---' : `---${eol}`;
	return `---${eol}${raw}${closing}${page.body}`;
}
