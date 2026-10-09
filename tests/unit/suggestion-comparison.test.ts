// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { changesLine, compare, comparisonTitle } from '../../src/lib/client/suggestion';
import { sourceDiff } from '../../src/lib/content/source-diff';

describe('comparisonTitle', () => {
	it('names the action', () => {
		expect(comparisonTitle('Korter')).toBe('Voorstel van Schrijfhulp: Korter');
		expect(comparisonTitle('Kopjes voorstellen')).toBe(
			'Voorstel van Schrijfhulp: Kopjes voorstellen'
		);
	});

	it('has no action to name for an own instruction', () => {
		expect(comparisonTitle(null)).toBe('Voorstel van Schrijfhulp');
	});
});

describe('changesLine', () => {
	it('counts the changes in the text column', () => {
		expect(changesLine(3)).toBe('3 wijzigingen staan in de tekstkolom');
		expect(changesLine(2)).toBe('2 wijzigingen staan in de tekstkolom');
	});

	it('uses the singular for one change', () => {
		expect(changesLine(1)).toBe('1 wijziging staat in de tekstkolom');
	});

	it('says so when the suggestion changes nothing', () => {
		expect(changesLine(0)).toBe('Het voorstel verandert niets in je tekst');
	});

	it('does not count a comparison that is too large to make', () => {
		expect(changesLine(null)).toBe('De wijzigingen staan in de tekstkolom');
	});
});

describe('compare', () => {
	const before =
		'# Titel\n\nEerste zin. Tweede zin.\n\n## Kop\n\nEen alinea.\n\n## Slot\n\nEinde.\n';

	it('carries the texts, the heading and the source lines of the comparison', () => {
		const after = '# Titel\n\nEerste zin.\n\n## Kop\n\nEen alinea.\n\n## Slot\n\nEinde.\n';
		const result = compare('Korter', before, after);
		expect(result.title).toBe('Voorstel van Schrijfhulp: Korter');
		expect(result.before).toBe(before);
		expect(result.after).toBe(after);
		expect(result.source).toEqual(sourceDiff(before, after));
	});

	it('counts the separate stretches of changed blocks', () => {
		const one = before.replace('Eerste zin. Tweede zin.', 'Eerste zin.');
		expect(compare(null, before, one).count).toBe(1);
		const two = one.replace('Einde.', 'Het einde.');
		expect(compare(null, before, two).count).toBe(2);
	});

	it('counts none for a suggestion equal to the text', () => {
		expect(compare(null, before, before).count).toBe(0);
	});

	it('leaves the lines above the text out of the count, as the comparison does', () => {
		const withFields = (title: string) => `---\ntitle: ${title}\n---\n# Titel\n\nTekst.\n`;
		expect(compare(null, withFields('Een'), withFields('Twee')).count).toBe(0);
	});

	it('has no count when the comparison is too large', () => {
		const large = 'woord '.repeat(45_000);
		expect(compare(null, large, `${large}extra`).count).toBeNull();
	});
});
