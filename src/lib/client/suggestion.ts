import { markdownToHtml } from '$lib/content/markdown-preview';
import { comparePages } from '$lib/content/rendered-diff';
import { sourceDiff, type SourcePart } from '$lib/content/source-diff';

/** A suggestion for the whole text, set against the current text in the text column. */
export type Comparison = {
	title: string;
	before: string;
	after: string;
	source: SourcePart[];
	/** The number of changes the comparison shows; null when it is too large to make. */
	count: number | null;
};

/** Whether a selection takes in all of the text but white space at either end: that asks for the whole text. */
export function selectsWholeText(selection: { from: number; to: number }, text: string): boolean {
	return text.slice(0, selection.from).trim() === '' && text.slice(selection.to).trim() === '';
}

export const comparisonTitle = (label: string | null) =>
	label ? `Suggestie van Schrijfhulp: ${label}` : 'Suggestie van Schrijfhulp';

/** The line in the panel that points to the comparison. */
export function changesLine(count: number | null): string {
	if (count === null) return 'De wijzigingen staan in de tekstkolom';
	if (count === 0) return 'De suggestie verandert niets in je tekst';
	return count === 1
		? '1 wijziging staat in de tekstkolom'
		: `${count} wijzigingen staan in de tekstkolom`;
}

export function compare(label: string | null, before: string, after: string): Comparison {
	return {
		title: comparisonTitle(label),
		before,
		after,
		source: sourceDiff(before, after),
		count: comparePages(before, after, (md) => markdownToHtml(md), document).count
	};
}
