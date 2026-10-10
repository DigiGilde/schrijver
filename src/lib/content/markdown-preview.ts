import DOMPurify from 'dompurify';
import type { Element, Properties, Root as HtmlRoot } from 'hast';
import type { Code, Definition, Html, Image, ImageReference, Paragraph, Root } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { resolveImageRef } from './image-refs';

export type Sanitize = (html: string) => string;
/** Maps an image `src` from the Markdown to the URL the preview loads; null leaves it as it is. */
export type ResolveImage = (src: string) => string | null;

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

function rewriteImages() {
	return (tree: Root, file: { data: Record<string, unknown> }) => {
		const resolve = file.data.resolveImage as ResolveImage | undefined;
		if (!resolve) return;
		const referenced = new Set<string>();
		const definitions: Definition[] = [];
		const walk = (node: { type: string; children?: unknown[] }) => {
			if (node.type === 'image') {
				const image = node as Image;
				image.url = resolve(image.url) ?? image.url;
			} else if (node.type === 'imageReference') {
				referenced.add((node as ImageReference).identifier);
			} else if (node.type === 'definition') {
				definitions.push(node as Definition);
			}
			for (const child of node.children ?? []) walk(child as { type: string });
		};
		walk(tree);
		for (const d of definitions) if (referenced.has(d.identifier)) d.url = resolve(d.url) ?? d.url;
	};
}

/**
 * Resolves image references relative to the page: images added in this session come from memory,
 * the rest from the site repository through the preview file route. Absolute and site-root URLs stay.
 */
export function previewImages(opts: {
	siteId: string;
	/** Repository path of the page, e.g. docs/kennis/privacy.md. */
	page: string;
	/** Proposal branch; null for the default branch. */
	ref: string | null;
	/** A proposal's number: its images are read at the commit its head points at now. */
	voorstel?: number;
	pending: { path: string; base64: string }[];
}): ResolveImage {
	return (src) => {
		const path = resolveImageRef(opts.page, src);
		if (!path) return null;
		const pending = opts.pending.find((i) => i.path === path);
		if (pending) return `data:${mimeOf(path)};base64,${pending.base64}`;
		const query = new URLSearchParams({ pad: path });
		if (opts.voorstel !== undefined) query.set('voorstel', String(opts.voorstel));
		else if (opts.ref) query.set('ref', opts.ref);
		return `/api/sites/${encodeURIComponent(opts.siteId)}/bestand?${query}`;
	};
}

function mimeOf(path: string): string {
	const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
	if (ext === 'svg') return 'image/svg+xml';
	if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
	return `image/${ext}`;
}

const HEADING = /^h([1-6])$/;

/** Headings keep their look, but sit below the heading of level `below` in the outline of the page. */
function outlineLevels() {
	return (tree: HtmlRoot, file: { data: Record<string, unknown> }) => {
		const below = file.data.below as number | undefined;
		if (!below) return;
		const walk = (node: { type: string; children?: unknown[] }) => {
			const depth = node.type === 'element' ? HEADING.exec((node as Element).tagName)?.[1] : null;
			if (depth) (node as Element).properties.ariaLevel = Math.min(6, below + Number(depth));
			for (const child of node.children ?? []) walk(child as { type: string });
		};
		walk(tree);
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
	.use(rewriteImages)
	.use(remarkRehype, { allowDangerousHtml: false, handlers: { code: codeHandler } })
	.use(outlineLevels)
	.use(rehypeStringify);

let browserPurify: Sanitize | undefined;

function defaultSanitize(html: string): string {
	if (!DOMPurify.isSupported)
		throw new Error('DOMPurify needs a browser DOM; pass a sanitize function');
	browserPurify ??= (value) => DOMPurify.sanitize(value, PURIFY_CONFIG);
	return browserPurify(html);
}

/** With `below`, the headings of the text follow a heading of that level in the outline of the page. */
export function markdownToHtml(
	md: string,
	sanitize: Sanitize = defaultSanitize,
	resolveImage?: ResolveImage,
	below?: number
): string {
	const html = String(processor.processSync({ value: md, data: { resolveImage, below } }));
	return sanitize(html);
}
