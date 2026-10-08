const MARGIN = 8;

type Editor = { getSelection(): { empty: boolean; rect: DOMRect | null } };

/**
 * Scrolls the window up when the caret sits under the sticky bars. CodeMirror scrolls the caret into
 * view with its own margins and ignores scroll-padding-top: upstream, nldd-text-editor does not pass
 * --context-inset-top on to EditorView.scrollMargins yet.
 */
export function keepCaretBelow(editor: Editor, bars: Element): void {
	const { empty, rect } = editor.getSelection();
	if (!empty || !rect) return;
	const below = bars.getBoundingClientRect().bottom + MARGIN;
	if (rect.top < below) window.scrollBy({ top: rect.top - below, behavior: 'instant' });
}
