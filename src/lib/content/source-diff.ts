import { diffLines } from 'diff';

export type SourcePart =
	{ kind: 'added' | 'removed' | 'same'; text: string } | { kind: 'skip'; lines: number };

const CONTEXT = 3;

function splitLines(text: string): string[] {
	const lines = text.split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines.map((l) => l + '\n');
}

/** Line diff of two raw files; long unchanged stretches are shortened to a few lines of context. */
export function sourceDiff(before: string | null, after: string | null): SourcePart[] {
	const parts: SourcePart[] = [];
	const changes = diffLines(before ?? '', after ?? '');
	changes.forEach((change, index) => {
		if (change.added || change.removed) {
			parts.push({ kind: change.added ? 'added' : 'removed', text: change.value });
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
