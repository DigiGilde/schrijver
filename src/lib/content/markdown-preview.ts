import DOMPurify from 'dompurify';
import type { Element, Properties } from 'hast';
import type { Code, Html, Paragraph, Root } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

export type Sanitize = (html: string) => string;

export const PURIFY_CONFIG = {
	ADD_TAGS: ['nldd-code-viewer'],
	ADD_ATTR: ['language', 'data-src']
};

const LANGUAGE_ALIASES: Record<string, string> = {
	shell: 'bash',
	sh: 'bash',
	yml: 'yaml',
	js: 'javascript'
};

const NOTICE = 'Niet in voorbeeld';

function notice(node: Paragraph | Html): void {
	const target = node as unknown as Paragraph;
	target.type = 'paragraph';
	target.children = [];
	target.data = {
		hName: 'p',
		hProperties: { className: ['niet-in-voorbeeld'] },
		hChildren: [{ type: 'text', value: NOTICE }]
	} as Paragraph['data'];
}

function startsWithShortcode(paragraph: Paragraph): boolean {
	const first = paragraph.children[0];
	return first?.type === 'text' && /^\{\{[<%]/.test(first.value);
}

function markUnsupported() {
	return (tree: Root) => {
		for (const node of tree.children) {
			if (node.type === 'html' || (node.type === 'paragraph' && startsWithShortcode(node))) {
				notice(node);
			}
		}
		const dropInlineHtml = (parent: { children: unknown[] }) => {
			parent.children = parent.children.filter(
				(child) => (child as { type: string }).type !== 'html'
			);
			for (const child of parent.children) {
				if (child && typeof child === 'object' && 'children' in child) {
					dropInlineHtml(child as { children: unknown[] });
				}
			}
		};
		for (const node of tree.children) {
			if (node.type !== 'paragraph' || node.data) continue;
			dropInlineHtml(node);
		}
	};
}

function codeHandler(_state: unknown, node: Code): Element {
	const text = { type: 'text' as const, value: node.value };
	if (node.lang === 'mermaid') {
		return {
			type: 'element',
			tagName: 'div',
			// Percent-encoded: DOMPurify drops attribute values that contain `-->`.
			properties: { className: ['mermaid'], dataSrc: encodeURIComponent(node.value) },
			children: [{ type: 'element', tagName: 'pre', properties: {}, children: [text] }]
		};
	}
	const language = node.lang ? (LANGUAGE_ALIASES[node.lang] ?? node.lang) : '';
	const properties: Properties = language ? { language } : {};
	return { type: 'element', tagName: 'nldd-code-viewer', properties, children: [text] };
}

const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(markUnsupported)
	.use(remarkRehype, { allowDangerousHtml: false, handlers: { code: codeHandler } })
	.use(rehypeStringify);

let browserPurify: Sanitize | undefined;

function defaultSanitize(html: string): string {
	if (!DOMPurify.isSupported)
		throw new Error('DOMPurify needs a browser DOM; pass a sanitize function');
	browserPurify ??= (value) => DOMPurify.sanitize(value, PURIFY_CONFIG);
	return browserPurify(html);
}

export function markdownToHtml(md: string, sanitize: Sanitize = defaultSanitize): string {
	const html = String(processor.processSync(md));
	return sanitize(html);
}
