import { diffArrays, diffWordsWithSpace, wordsWithSpaceDiff } from 'diff';
import type { RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type DiffBlock =
	| { kind: 'gelijk'; html: string }
	| { kind: 'toegevoegd'; html: string }
	| { kind: 'verwijderd'; html: string }
	| { kind: 'gewijzigd'; was: string; wordt: string }
	| { kind: 'overgeslagen'; aantal: number }
	| { kind: 'te-groot' };

type Block = { type: string; source: string };
type Body = { blocks: Block[]; definitions: string };
type Span = [start: number, end: number];
type Pair = [old: number, nieuw: number];
type Part = {
	type: string;
	html: string;
	text: string;
	words: Map<string, number>;
	chars: number;
};
type Budget = { chars: number };
type Render = (markdown: string) => string;

const ATOMIC = new Set(['code', 'html', 'thematicBreak']);
/** The prefix for screen readers goes in front of these, not inside a link name or a mark. */
const INLINE = new Set(['a', 'code', 'del', 'em', 'ins', 'strong', 'sup']);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
/** A word diff with more edits than this is expensive and says little: those blocks are not paired. */
const MAX_WORD_EDITS = 1000;
/** An old and a new block are paired when the word diff keeps this share of the longer text. */
const SIMILAR = 0.5;
/** Pages with more characters than this, together, are not compared. */
const MAX_CHARS = 500_000;
/** The block diff gives up after this many added and removed blocks, or after `MAX_MS`. */
const MAX_BLOCK_EDITS = 2000;
const MAX_MS = 1000;
/**
 * Every block is rendered on its own, together with all definitions of its page, so many blocks and many
 * definitions make a page slow. Rendering is estimated as the characters it parses, plus a fixed cost per block.
 */
const RENDER_OVERHEAD = 100;
const MAX_RENDER_CHARS = 1_000_000;
/** Longer runs of removed and added blocks are not paired: that takes a word diff for every combination. */
const MAX_RUN = 50;
/** The word diffs that decide on pairing may look at this many characters per comparison. */
const MAX_PAIRING_CHARS = 100_000;

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

const renderChars = (body: Body) =>
	body.blocks.reduce(
		(sum, block) => sum + RENDER_OVERHEAD + block.source.length + body.definitions.length,
		0
	);

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

const withoutSpace = (text: string) => text.replace(/\s/g, '');

function prepare(body: Body, block: Block, render: Render, doc: Document): Part {
	const html = renderBlock(body, block, render);
	const text = textNodes(parseHtml(html, doc).content)
		.map((node) => node.data)
		.join('');
	const words = new Map<string, number>();
	for (const token of wordsWithSpaceDiff.tokenize(text)) {
		if (/\S/.test(token)) words.set(token, (words.get(token) ?? 0) + 1);
	}
	return { type: block.type, html, text, words, chars: withoutSpace(text).length };
}

/**
 * The share of the longer text that the word diff keeps, or 0 below `SIMILAR`. Whitespace does not count:
 * the markup of lists and tables is full of it, and it would make unrelated lists look alike.
 */
function similarity(a: Part, b: Part, budget: Budget): number {
	const longer = Math.max(a.chars, b.chars);
	if (a.type !== b.type || ATOMIC.has(a.type) || longer === 0) return 0;
	// Tokens in common bound what the word diff can keep, and cost far less than the diff.
	let shared = 0;
	for (const [word, count] of a.words) {
		shared += Math.min(count, b.words.get(word) ?? 0) * word.length;
	}
	if (shared < longer * SIMILAR) return 0;
	if (a.chars + b.chars > budget.chars) return 0;
	budget.chars -= a.chars + b.chars;
	const changes = diffWordsWithSpace(a.text, b.text, { maxEditLength: MAX_WORD_EDITS });
	if (!changes) return 0;
	const kept = changes
		.filter((change) => !change.added && !change.removed)
		.reduce((sum, change) => sum + withoutSpace(change.value).length, 0);
	return kept >= longer * SIMILAR ? kept / longer : 0;
}

/** The pairs, in order on both sides, with the highest summed similarity. */
function align(gone: Part[], come: Part[], budget: Budget): Pair[] {
	if (gone.length > MAX_RUN || come.length > MAX_RUN) return [];
	const score = gone.map((a) => come.map((b) => similarity(a, b, budget)));
	const best = Array.from({ length: gone.length + 1 }, () =>
		new Array<number>(come.length + 1).fill(0)
	);
	for (let i = 1; i <= gone.length; i++) {
		for (let j = 1; j <= come.length; j++) {
			best[i][j] = Math.max(
				best[i - 1][j],
				best[i][j - 1],
				best[i - 1][j - 1] + score[i - 1][j - 1]
			);
		}
	}
	const pairs: Pair[] = [];
	let i = gone.length;
	let j = come.length;
	while (i > 0 && j > 0) {
		if (score[i - 1][j - 1] > 0 && best[i][j] === best[i - 1][j - 1] + score[i - 1][j - 1]) {
			pairs.push([--i, --j]);
		} else if (best[i][j] === best[i - 1][j]) i--;
		else j--;
	}
	return pairs.reverse();
}

const unpaired = (gone: Part[], come: Part[]): DiffBlock[] => [
	...gone.map((part): DiffBlock => ({ kind: 'verwijderd', html: part.html })),
	...come.map((part): DiffBlock => ({ kind: 'toegevoegd', html: part.html }))
];

const tooLarge = (): DiffBlock[] => [{ kind: 'te-groot' }];

/** A comparison that is too large gives a single `te-groot` block. */
export function renderedDiff(
	before: string,
	after: string,
	render: Render,
	doc: Document
): DiffBlock[] {
	if (before.length + after.length > MAX_CHARS) return tooLarge();
	const old = splitBody(before);
	const nieuw = splitBody(after);
	if (renderChars(old) + renderChars(nieuw) > MAX_RENDER_CHARS) return tooLarge();
	const changes = diffArrays(
		old.blocks.map((block) => block.source),
		nieuw.blocks.map((block) => block.source),
		{ maxEditLength: MAX_BLOCK_EDITS, timeout: MAX_MS }
	);
	if (!changes) return tooLarge();
	const budget: Budget = { chars: MAX_PAIRING_CHARS };
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
		const gone = old.blocks
			.slice(oldIndex, oldIndex + removed)
			.map((block) => prepare(old, block, render, doc));
		const come = nieuw.blocks
			.slice(newIndex, newIndex + added)
			.map((block) => prepare(nieuw, block, render, doc));
		oldIndex += removed;
		newIndex += added;
		let goneFrom = 0;
		let comeFrom = 0;
		for (const [g, c] of align(gone, come, budget)) {
			blocks.push(...unpaired(gone.slice(goneFrom, g), come.slice(comeFrom, c)));
			blocks.push({ kind: 'gewijzigd', ...markWords(gone[g].html, come[c].html, doc) });
			goneFrom = g + 1;
			comeFrom = c + 1;
		}
		blocks.push(...unpaired(gone.slice(goneFrom), come.slice(comeFrom)));
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

/** Marks the block, and puts the visible word and the prefix for screen readers where its text starts. */
function annotate(html: string, state: string, word: string, label: string, doc: Document): string {
	const template = parseHtml(html, doc);
	const content = template.content;
	const elements = [...content.children];
	if (elements.length === 0) return html;
	for (const element of elements) element.setAttribute('data-diff', state);
	const visible = doc.createElement('span');
	visible.className = 'diff-woord';
	visible.setAttribute('data-woord', state);
	visible.setAttribute('aria-hidden', 'true');
	visible.textContent = word;
	const prefix = doc.createElement('span');
	prefix.className = 'sr-only';
	prefix.textContent = label;
	let anchor: Node | undefined = textNodes(content).find((node) => /\S/.test(node.data));
	if (!anchor) {
		content.insertBefore(prefix, elements[0]);
		content.insertBefore(visible, prefix);
		return template.innerHTML;
	}
	while (anchor.parentElement && INLINE.has(anchor.parentElement.localName)) {
		anchor = anchor.parentElement;
	}
	anchor.parentNode!.insertBefore(prefix, anchor);
	anchor.parentNode!.insertBefore(visible, prefix);
	return template.innerHTML;
}

const skipped = (aantal: number) =>
	aantal === 1 ? '1 alinea ongewijzigd' : `${aantal} alinea's ongewijzigd`;

export const TE_GROOT = 'Deze wijziging is te groot om hier te tonen. Bekijk haar op GitHub.';

/** The blocks as HTML for `nldd-rich-text`: every top-level element stays a direct child of it. */
export function toHtml(blocks: DiffBlock[], doc: Document): string {
	return blocks
		.map((block) => {
			switch (block.kind) {
				case 'gelijk':
					return block.html;
				case 'toegevoegd':
					return annotate(block.html, 'toegevoegd', 'Nieuw', 'Toegevoegd: ', doc);
				case 'verwijderd':
					return annotate(block.html, 'verwijderd', 'Verwijderd', 'Verwijderd: ', doc);
				case 'gewijzigd':
					return [
						annotate(block.was, 'was', 'Was', 'Oude tekst: ', doc),
						annotate(block.wordt, 'wordt', 'Wordt', 'Nieuwe tekst: ', doc)
					].join('\n');
				case 'overgeslagen':
					return `<p class="diff-overgeslagen">${skipped(block.aantal)}</p>`;
				case 'te-groot':
					return `<p class="diff-overgeslagen">${TE_GROOT}</p>`;
			}
		})
		.join('\n');
}
