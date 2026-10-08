import { mermaidScaffold } from '$lib/content/mermaid';
import type { PendingImage } from './pending-images';

export interface EditorHandle {
	insertAtCursor(text: string): unknown;
	replaceRange(from: number, to: number, text: string): unknown;
	getSelection(): { start: number; end: number; empty: boolean } | null | undefined;
	setAnnotations(list: { id: string; start: number; end: number; quote?: string }[]): void;
	focus(): unknown;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export function imageFrom(list: FileList | null | undefined): File | null {
	return Array.from(list ?? []).find((f) => IMAGE_TYPES.includes(f.type)) ?? null;
}

export function dropHandlers(open: (file: File) => void) {
	const take = (event: Event, files: FileList | null | undefined) => {
		const file = imageFrom(files);
		if (!file) return;
		event.preventDefault();
		event.stopPropagation();
		open(file);
	};
	return {
		ondrop: (e: DragEvent) => take(e, e.dataTransfer?.files),
		onpaste: (e: ClipboardEvent) => take(e, e.clipboardData?.files),
		ondragover: (e: DragEvent) => {
			if (
				Array.from(e.dataTransfer?.items ?? []).some(
					(i) => i.kind === 'file' && IMAGE_TYPES.includes(i.type)
				)
			) {
				e.preventDefault();
			}
		}
	};
}

/** The element to hand focus back to when an overlay closes. */
export function focusTarget(): HTMLElement | null {
	const active = document.activeElement;
	return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Hands focus back once an overlay has closed, when the browser left it on the body or, until its
 * next rendering update, inside the closed overlay. A host without a focusable part ignores focus(),
 * such as the toolbar whose menu opened the overlay; `fallback` takes it then.
 */
export function restoreFocus(overlay: Element, target: HTMLElement | null, fallback: () => void) {
	setTimeout(() => {
		const active = document.activeElement;
		if (active && active !== document.body && !overlay.contains(active)) return;
		target?.focus();
		if (!target || document.activeElement !== target) fallback();
	}, 0);
}

export function insertImage(
	editor: EditorHandle | undefined,
	alt: string,
	result: { repoPath: string; markdownRef: string; base64: string }
): PendingImage {
	editor?.insertAtCursor(`![${alt.replace(/[[\]]/g, '')}](${result.markdownRef})`);
	return { path: result.repoPath, base64: result.base64 };
}

/** The commands of nldd-text-editor the toolbar uses beyond those the Editor component passes on. */
export interface FormattingEditor {
	readonly value: string;
	setList(type: 'none' | 'bullet' | 'ordered'): void;
	toggleCodeBlock(): void;
	indent(): void;
	outdent(): void;
	insertAtCursor(text: string): void;
	replaceRange(from: number, to: number, text: string): void;
	getSelection(): { start: number; end: number };
}

/** The editor a toolbar drives: Schrijfvlak renders the two under one parent. */
export function editorBeside(toolbar: Element | undefined): FormattingEditor | null {
	return (
		toolbar?.parentElement?.querySelector<HTMLElement & FormattingEditor>('nldd-text-editor') ??
		null
	);
}

/** Sets or clears a list type; toggleBulletList would put `- ` in front of `1. ` instead. */
export function toggleList(
	editor: FormattingEditor | null,
	type: 'bullet' | 'ordered',
	active: boolean
) {
	editor?.setList(active ? 'none' : type);
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** The editor leaves the caret before the opening fence, where typing breaks it; this moves it in. */
export function toggleCodeBlock(editor: FormattingEditor | null) {
	if (!editor) return;
	editor.toggleCodeBlock();
	const text = editor.value;
	const caret = editor.getSelection().start;
	const lineEnd = text.indexOf('\n', caret);
	const atLineStart = caret === 0 || text[caret - 1] === '\n';
	if (atLineStart && lineEnd !== -1 && FENCE.test(text.slice(caret, lineEnd))) {
		editor.replaceRange(lineEnd + 1, lineEnd + 1, '');
	}
}

export const TABLE_TEMPLATE = '| Kolom 1 | Kolom 2 |\n| ------- | ------- |\n| Tekst   | Tekst   |';
export const RULE = '---';

/**
 * Puts a block at the caret with a blank line on either side: a table would otherwise take in the
 * line after it as a row, and `---` right under a paragraph turns that paragraph into a heading.
 */
export function insertBlock(editor: FormattingEditor | null, block: string) {
	if (!editor) return;
	const { start, end } = editor.getSelection();
	const before = editor.value.slice(0, start);
	const after = editor.value.slice(end);
	const open =
		before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
	const close = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
	editor.insertAtCursor(open + block + close);
}

export function insertMermaid(editor: EditorHandle | undefined, body: string) {
	const sel = editor?.getSelection();
	const before = sel ? body.slice(0, sel.start) : body;
	const prefix =
		before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
	editor?.insertAtCursor(prefix + mermaidScaffold());
	editor?.focus();
}

export function currentSelection(editor: EditorHandle | undefined, body: string) {
	const sel = editor?.getSelection();
	return sel && !sel.empty
		? { text: body.slice(sel.start, sel.end), from: sel.start, to: sel.end }
		: null;
}

export function markRange(
	editor: EditorHandle | undefined,
	body: string,
	from: number,
	to: number
) {
	editor?.setAnnotations([
		{ id: 'schrijfhulp', start: from, end: to, quote: body.slice(from, to) }
	]);
}

export function applySuggestion(
	editor: EditorHandle | undefined,
	body: string,
	from: number,
	to: number,
	replacement: string,
	original: string
): string | null {
	if (body.slice(from, to) !== original) {
		return 'De tekst is intussen veranderd, het voorstel is niet overgenomen';
	}
	editor?.replaceRange(from, to, replacement);
	return null;
}
