import { diffArrays, diffWordsWithSpace } from 'diff';
import type { RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type DiffBlock =
	| { kind: 'gelijk'; html: string }
	| { kind: 'toegevoegd'; html: string }
	| { kind: 'verwijderd'; html: string }
	| { kind: 'gewijzigd'; was: string; wordt: string }
	| { kind: 'overgeslagen'; aantal: number };

type Block = { type: string; source: string };
type Body = { blocks: Block[]; definitions: string };
type Span = [start: number, end: number];
type Render = (markdown: string) => string;

const ATOMIC = new Set(['code', 'html', 'thematicBreak']);
/** The prefix for screen readers goes in front of these, not inside a link name or a mark. */
const INLINE = new Set(['a', 'code', 'del', 'em', 'ins', 'strong', 'sup']);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
/** The word diff of long, very different blocks is expensive and shows little: those blocks stay unmarked. */
const MAX_WORD_EDITS = 1000;

const parser = unified().use(remarkParse).use(remarkGfm);

function typeOf(node: RootContent): string {
	if (node.type === 'heading') return `heading-${node.depth}`;
	if (node.type === 'list') return node.ordered ? 'list-ordered' : 'list-unordered';
	return node.type;
}

function splitBody(markdown: string): Body {
	// Offsets count after a leading BOM, and a change of line endings alone is no change.
	const text = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const blocks: Block[] = [];
	const definitions: string[] = [];
	for (const node of parser.parse(text).children) {
		const source = text.slice(node.position!.start.offset, node.position!.end.offset);
		if (node.type === 'definition' || node.type === 'footnoteDefinition') definitions.push(source);
		else blocks.push({ type: typeOf(node), source });
	}
	return { blocks, definitions: definitions.join('\n') };
}

/** Reference-style links and footnotes need their definitions, which are blocks of their own: they render nothing alone. */
function renderBlock(body: Body, block: Block, render: Render): string {
	return render(body.definitions ? `${block.source}\n\n${body.definitions}` : block.source);
}

function parseHtml(html: string, doc: Document): HTMLTemplateElement {
	const template = doc.createElement('template');
	template.innerHTML = html;
	return template;
}

/** Text nodes in document order; code and diagrams are not text to mark words in. */
function textNodes(root: Node): Text[] {
	const found: Text[] = [];
	const visit = (node: Node) => {
		for (const child of node.childNodes) {
			if (child.nodeType === TEXT_NODE) found.push(child as Text);
			else if (child.nodeType === ELEMENT_NODE) {
				const element = child as Element;
				if (element.localName !== 'nldd-code-viewer' && !element.classList.contains('mermaid')) {
					visit(element);
				}
			}
		}
	};
	visit(root);
	return found;
}

function wrapSpans(nodes: Text[], ranges: Span[], tag: 'ins' | 'del'): void {
	let offset = 0;
	for (const node of nodes) {
		const start = offset;
		const end = start + node.data.length;
		offset = end;
		const inside = ranges
			.filter(([from, to]) => from < end && to > start)
			.map(([from, to]): Span => [Math.max(from, start) - start, Math.min(to, end) - start]);
		// Right to left: splitting keeps the left part in `node`, so its offsets stay valid.
		for (const [from, to] of inside.reverse()) {
			if (to < node.data.length) node.splitText(to);
			const piece = from > 0 ? node.splitText(from) : node;
			if (!/\S/.test(piece.data)) continue;
			const mark = piece.ownerDocument.createElement(tag);
			piece.replaceWith(mark);
			mark.append(piece);
		}
	}
}

function markWords(oldHtml: string, newHtml: string, doc: Document) {
	const oldTemplate = parseHtml(oldHtml, doc);
	const newTemplate = parseHtml(newHtml, doc);
	const oldNodes = textNodes(oldTemplate.content);
	const newNodes = textNodes(newTemplate.content);
	const changes =
		diffWordsWithSpace(
			oldNodes.map((node) => node.data).join(''),
			newNodes.map((node) => node.data).join(''),
			{ maxEditLength: MAX_WORD_EDITS }
		) ?? [];
	const removed: Span[] = [];
	const added: Span[] = [];
	let oldOffset = 0;
	let newOffset = 0;
	for (const change of changes) {
		const length = change.value.length;
		if (change.removed) {
			removed.push([oldOffset, oldOffset + length]);
			oldOffset += length;
		} else if (change.added) {
			added.push([newOffset, newOffset + length]);
			newOffset += length;
		} else {
			oldOffset += length;
			newOffset += length;
		}
	}
	wrapSpans(oldNodes, removed, 'del');
	wrapSpans(newNodes, added, 'ins');
	return { was: oldTemplate.innerHTML, wordt: newTemplate.innerHTML };
}

function pair(
	old: Body,
	nieuw: Body,
	a: Block,
	b: Block,
	render: Render,
	doc: Document
): DiffBlock[] {
	const was = renderBlock(old, a, render);
	const wordt = renderBlock(nieuw, b, render);
	if (a.type !== b.type || ATOMIC.has(a.type)) {
		return [
			{ kind: 'verwijderd', html: was },
			{ kind: 'toegevoegd', html: wordt }
		];
	}
	return [{ kind: 'gewijzigd', ...markWords(was, wordt, doc) }];
}

export function renderedDiff(
	before: string,
	after: string,
	render: Render,
	doc: Document
): DiffBlock[] {
	const old = splitBody(before);
	const nieuw = splitBody(after);
	const changes = diffArrays(
		old.blocks.map((block) => block.source),
		nieuw.blocks.map((block) => block.source)
	);
	const blocks: DiffBlock[] = [];
	let oldIndex = 0;
	let newIndex = 0;
	let i = 0;
	while (i < changes.length) {
		const change = changes[i];
		if (!change.added && !change.removed) {
			for (const block of nieuw.blocks.slice(newIndex, newIndex + change.count)) {
				blocks.push({ kind: 'gelijk', html: renderBlock(nieuw, block, render) });
			}
			oldIndex += change.count;
			newIndex += change.count;
			i++;
			continue;
		}
		let removed = 0;
		let added = 0;
		for (; i < changes.length && (changes[i].added || changes[i].removed); i++) {
			if (changes[i].removed) removed += changes[i].count;
			else added += changes[i].count;
		}
		const gone = old.blocks.slice(oldIndex, oldIndex + removed);
		const come = nieuw.blocks.slice(newIndex, newIndex + added);
		oldIndex += removed;
		newIndex += added;
		const paired = Math.min(gone.length, come.length);
		for (let k = 0; k < paired; k++) {
			blocks.push(...pair(old, nieuw, gone[k], come[k], render, doc));
		}
		for (const block of gone.slice(paired)) {
			blocks.push({ kind: 'verwijderd', html: renderBlock(old, block, render) });
		}
		for (const block of come.slice(paired)) {
			blocks.push({ kind: 'toegevoegd', html: renderBlock(nieuw, block, render) });
		}
	}
	return blocks;
}

export function withContext(blocks: DiffBlock[], context = 1): DiffBlock[] {
	const changed = blocks.map((block) => block.kind !== 'gelijk');
	if (!changed.includes(true)) {
		return blocks.length === 0 ? [] : [{ kind: 'overgeslagen', aantal: blocks.length }];
	}
	const keep = blocks.map((_, i) => {
		for (let j = Math.max(0, i - context); j <= Math.min(blocks.length - 1, i + context); j++) {
			if (changed[j]) return true;
		}
		return false;
	});
	const result: DiffBlock[] = [];
	let i = 0;
	while (i < blocks.length) {
		if (keep[i]) {
			result.push(blocks[i++]);
			continue;
		}
		let end = i;
		while (end < blocks.length && !keep[end]) end++;
		if (end - i >= 2) result.push({ kind: 'overgeslagen', aantal: end - i });
		else result.push(...blocks.slice(i, end));
		i = end;
	}
	return result;
}

/** Number of separate stretches of changed blocks. */
export function countChanges(blocks: DiffBlock[]): number {
	return blocks.filter(
		(block, i) => block.kind !== 'gelijk' && (i === 0 || blocks[i - 1].kind === 'gelijk')
	).length;
}

function annotate(html: string, state: string, label: string, doc: Document): string {
	const template = parseHtml(html, doc);
	const content = template.content;
	const elements = [...content.children];
	if (elements.length === 0) return html;
	for (const element of elements) element.setAttribute('data-diff', state);
	const prefix = doc.createElement('span');
	prefix.className = 'sr-only';
	prefix.textContent = label;
	let anchor: Node | undefined = textNodes(content).find((node) => /\S/.test(node.data));
	if (!anchor) {
		content.insertBefore(prefix, elements[0]);
		return template.innerHTML;
	}
	while (anchor.parentElement && INLINE.has(anchor.parentElement.localName)) {
		anchor = anchor.parentElement;
	}
	anchor.parentNode!.insertBefore(prefix, anchor);
	return template.innerHTML;
}

const skipped = (aantal: number) =>
	aantal === 1 ? '1 ongewijzigde alinea' : `${aantal} ongewijzigde alinea's`;

/** The blocks as HTML for `nldd-rich-text`: every top-level element stays a direct child of it. */
export function toHtml(blocks: DiffBlock[], doc: Document): string {
	return blocks
		.map((block) => {
			switch (block.kind) {
				case 'gelijk':
					return block.html;
				case 'toegevoegd':
					return annotate(block.html, 'toegevoegd', 'Toegevoegd: ', doc);
				case 'verwijderd':
					return annotate(block.html, 'verwijderd', 'Verwijderd: ', doc);
				case 'gewijzigd':
					return [
						annotate(block.was, 'was', 'Oude tekst: ', doc),
						annotate(block.wordt, 'wordt', 'Nieuwe tekst: ', doc)
					].join('\n');
				case 'overgeslagen':
					return `<p class="diff-overgeslagen">${skipped(block.aantal)}</p>`;
			}
		})
		.join('\n');
}
