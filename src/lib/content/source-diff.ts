import { diffLines, diffWordsWithSpace } from 'diff';

export type Word = { text: string; changed: boolean };
export type SourcePart =
	| { kind: 'added' | 'removed' | 'same'; text: string; words?: Word[] }
	| { kind: 'skip'; lines: number };

const CONTEXT = 3;
/** The word diff of long, very different texts is expensive and shows little: those lines stay marked as a whole. */
const MAX_WORD_EDITS = 1000;

function splitLines(text: string): string[] {
	const lines = text.split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines.map((l) => l + '\n');
}

function wordsOf(removed: string, added: string): { removed: Word[]; added: Word[] } | null {
	const changes = diffWordsWithSpace(removed, added, { maxEditLength: MAX_WORD_EDITS });
	if (!changes) return null;
	return {
		removed: changes.filter((c) => !c.added).map((c) => ({ text: c.value, changed: c.removed })),
		added: changes.filter((c) => !c.removed).map((c) => ({ text: c.value, changed: c.added }))
	};
}

/** Line diff of two raw files; long unchanged stretches are shortened to a few lines of context. */
export function sourceDiff(before: string | null, after: string | null): SourcePart[] {
	const parts: SourcePart[] = [];
	const changes = diffLines(before ?? '', after ?? '');
	changes.forEach((change, index) => {
		if (change.added || change.removed) {
			const part: SourcePart = { kind: change.added ? 'added' : 'removed', text: change.value };
			const previous = parts[parts.length - 1];
			if (part.kind === 'added' && previous?.kind === 'removed') {
				const words = wordsOf(previous.text, part.text);
				if (words) {
					previous.words = words.removed;
					part.words = words.added;
				}
			}
			parts.push(part);
			return;
		}
		const lines = splitLines(change.value);
		const head = index === 0 ? 0 : CONTEXT;
		const tail = index === changes.length - 1 ? 0 : CONTEXT;
		if (lines.length <= head + tail + 1) {
			parts.push({ kind: 'same', text: change.value });
			return;
		}
		if (head > 0) parts.push({ kind: 'same', text: lines.slice(0, head).join('') });
		parts.push({ kind: 'skip', lines: lines.length - head - tail });
		if (tail > 0) parts.push({ kind: 'same', text: lines.slice(lines.length - tail).join('') });
	});
	return parts;
}
