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
			if (Array.from(e.dataTransfer?.items ?? []).some((i) => i.kind === 'file' && IMAGE_TYPES.includes(i.type))) {
				e.preventDefault();
			}
		}
	};
}

/** The element to hand focus back to when the dialog closes. */
export function focusTarget(): HTMLElement | null {
	const active = document.activeElement;
	return active instanceof HTMLElement && active !== document.body ? active : null;
}

export function restoreFocus(target: HTMLElement | null, editor: EditorHandle | undefined) {
	setTimeout(() => (target?.isConnected ? target.focus() : editor?.focus()), 0);
}

export function insertImage(
	editor: EditorHandle | undefined,
	alt: string,
	result: { repoPath: string; markdownRef: string; base64: string }
): PendingImage {
	editor?.insertAtCursor(`![${alt.replace(/[[\]]/g, '')}](${result.markdownRef})`);
	return { path: result.repoPath, base64: result.base64 };
}

export function insertMermaid(editor: EditorHandle | undefined, body: string) {
	const sel = editor?.getSelection();
	const before = sel ? body.slice(0, sel.start) : body;
	const prefix = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
	editor?.insertAtCursor(prefix + mermaidScaffold());
	editor?.focus();
}

export function currentSelection(editor: EditorHandle | undefined, body: string) {
	const sel = editor?.getSelection();
	return sel && !sel.empty ? { text: body.slice(sel.start, sel.end), from: sel.start, to: sel.end } : null;
}

export function markRange(editor: EditorHandle | undefined, body: string, from: number, to: number) {
	editor?.setAnnotations([{ id: 'schrijfhulp', start: from, end: to, quote: body.slice(from, to) }]);
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
