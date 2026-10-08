const MARGIN = 8;

type Editor = { getSelection(): { empty: boolean; rect: DOMRect | null } };

/**
 * Scrolls the window up when the caret sits under the sticky bars: the page header and the bars
 * marked `data-plakt` that stick below it. CodeMirror scrolls the caret into view with its own
 * margins and ignores scroll-padding-top: upstream, nldd-text-editor does not pass
 * --context-inset-top on to EditorView.scrollMargins yet.
 */
export function keepCaretBelow(editor: Editor, header: Element): void {
	const { empty, rect } = editor.getSelection();
	if (!empty || !rect) return;
	const bars = [header, ...document.querySelectorAll('[data-plakt]')];
	const below = Math.max(...bars.map((bar) => bar.getBoundingClientRect().bottom)) + MARGIN;
	if (rect.top < below) window.scrollBy({ top: rect.top - below, behavior: 'instant' });
}
