import { parsePage } from '$lib/content/frontmatter';
import { markdownToHtml } from '$lib/content/markdown-preview';
import { countChanges, renderedDiff } from '$lib/content/rendered-diff';
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

export const comparisonTitle = (label: string | null) =>
	label ? `Voorstel van Schrijfhulp: ${label}` : 'Voorstel van Schrijfhulp';

/** The line in the panel that points to the comparison. */
export function changesLine(count: number | null): string {
	if (count === null) return 'De wijzigingen staan in de tekstkolom';
	if (count === 0) return 'Het voorstel verandert niets in je tekst';
	return count === 1
		? '1 wijziging staat in de tekstkolom'
		: `${count} wijzigingen staan in de tekstkolom`;
}

const bodyOf = (text: string) => {
	const page = parsePage(text);
	return page.ok ? page.body : text;
};

/** Counts as Diff does, so the panel and the comparison give the same number. */
function countChanged(before: string, after: string): number | null {
	const blocks = renderedDiff(bodyOf(before), bodyOf(after), (md) => markdownToHtml(md), document);
	return blocks.some((block) => block.kind === 'te-groot') ? null : countChanges(blocks);
}

export function compare(label: string | null, before: string, after: string): Comparison {
	return {
		title: comparisonTitle(label),
		before,
		after,
		source: sourceDiff(before, after),
		count: countChanged(before, after)
	};
}
