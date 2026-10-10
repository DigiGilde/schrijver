import { describe, expect, it } from 'vitest';
import { sourceDiff, type SourcePart } from '../../src/lib/content/source-diff';

describe('sourceDiff', () => {
	it('shows raw HTML and link targets that the rendered view hides', () => {
		const parts = sourceDiff(
			'[Formulier](https://example.org/a)\n',
			'[Formulier](https://evil.example/a)\n<script>x</script>\n'
		);
		const added = parts.filter((p) => p.kind === 'added').map((p) => ('text' in p ? p.text : ''));
		expect(added.join('')).toContain('https://evil.example/a');
		expect(added.join('')).toContain('<script>x</script>');
		expect(
			parts.some((p) => p.kind === 'removed' && p.text.includes('https://example.org/a'))
		).toBe(true);
	});

	it('shortens long unchanged stretches to context', () => {
		const lines = Array.from({ length: 40 }, (_, i) => `regel ${i}`);
		const after = [...lines.slice(0, 20), 'nieuw', ...lines.slice(20)];
		const parts = sourceDiff(lines.join('\n') + '\n', after.join('\n') + '\n');
		expect(parts.filter((p) => p.kind === 'skip').map((p) => ('lines' in p ? p.lines : 0))).toEqual(
			[17, 17]
		);
		expect(parts.find((p) => p.kind === 'added')).toEqual({ kind: 'added', text: 'nieuw\n' });
	});

	it('treats a new file as all added', () => {
		expect(sourceDiff(null, 'a\n')).toEqual([{ kind: 'added', text: 'a\n' }]);
	});

	describe('word marks', () => {
		const words = (part: SourcePart | undefined) =>
			part && 'words' in part ? part.words : undefined;
		const changed = (part: SourcePart | undefined) =>
			words(part)
				?.filter((w) => w.changed)
				.map((w) => w.text);

		it('marks only the changed word in a removed and added pair', () => {
			const [removed, added] = sourceDiff(
				'Dit is een lange regel met een oud woord midden in de zin.\n',
				'Dit is een lange regel met een nieuw woord midden in de zin.\n'
			);
			expect([removed.kind, added.kind]).toEqual(['removed', 'added']);
			expect(changed(removed)).toEqual(['oud']);
			expect(changed(added)).toEqual(['nieuw']);
			expect(
				words(removed)
					?.map((w) => w.text)
					.join('')
			).toBe('Dit is een lange regel met een oud woord midden in de zin.\n');
			expect(
				words(added)
					?.map((w) => w.text)
					.join('')
			).toBe('Dit is een lange regel met een nieuw woord midden in de zin.\n');
		});

		it('pairs a multi-line removal with the addition that follows it', () => {
			const parts = sourceDiff('een\ntwee\ndrie\n', 'een\nTWEE\nDRIE\n');
			expect(parts.map((p) => p.kind)).toEqual(['same', 'removed', 'added']);
			expect(changed(parts[1])).toEqual(['twee', 'drie']);
			expect(changed(parts[2])).toEqual(['TWEE', 'DRIE']);
		});

		it('gives an added line without a removed partner no words', () => {
			const parts = sourceDiff('een\ntwee\n', 'een\ntwee\ndrie\n');
			expect(parts.find((p) => p.kind === 'added')).toEqual({ kind: 'added', text: 'drie\n' });
		});

		it('gives a removed line without an added partner no words', () => {
			const parts = sourceDiff('een\ntwee\ndrie\n', 'een\ndrie\n');
			expect(parts.find((p) => p.kind === 'removed')).toEqual({ kind: 'removed', text: 'twee\n' });
		});

		it('leaves the lines whole when the texts are too different for a word diff', () => {
			const long = (prefix: string) =>
				Array.from({ length: 1500 }, (_, i) => `${prefix}${i}`).join(' ') + '\n';
			const [removed, added] = sourceDiff(long('a'), long('b'));
			expect(words(removed)).toBeUndefined();
			expect(words(added)).toBeUndefined();
		});

		it('marks whole lines once the word diffs have used their share of the characters', () => {
			const sentence = 'woord '.repeat(4000);
			const hunks = (last: string) =>
				['a', 'b', 'c'].map((id) => `gelijk ${id}\n${sentence}${last}\n`).join('');
			const removed = sourceDiff(hunks('oud'), hunks('nieuw')).filter((p) => p.kind === 'removed');
			expect(removed.map((part) => words(part) !== undefined)).toEqual([true, true, false]);
		});
	});

	describe('size limits', () => {
		const lines = (prefix: string, count: number) =>
			Array.from({ length: count }, (_, i) => `${prefix} ${i}`).join('\n') + '\n';

		it('gives up quickly on 20 000 lines that all changed', () => {
			const started = performance.now();
			const parts = sourceDiff(lines('oud', 20_000), lines('nieuw', 20_000));
			expect(performance.now() - started).toBeLessThan(2000);
			expect(parts).toEqual([{ kind: 'te-groot' }]);
		});

		it('gives up on texts that together exceed the character limit', () => {
			expect(sourceDiff('a'.repeat(300_000), 'b'.repeat(300_000))).toEqual([{ kind: 'te-groot' }]);
			expect(sourceDiff(null, 'a\n'.repeat(300_000))).toEqual([{ kind: 'te-groot' }]);
		});

		it('still compares a large page with a few changes', () => {
			const before = lines('regel', 20_000);
			const parts = sourceDiff(before, before.replace('regel 10000\n', 'tienduizend\n'));
			expect(parts.map((p) => p.kind)).toEqual([
				'skip',
				'same',
				'removed',
				'added',
				'same',
				'skip'
			]);
		});
	});
});
