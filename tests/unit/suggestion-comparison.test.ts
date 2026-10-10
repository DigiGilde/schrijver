// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
	changesLine,
	compare,
	comparisonTitle,
	selectsWholeText
} from '../../src/lib/client/suggestion';
import { markdownToHtml } from '../../src/lib/content/markdown-preview';
import { comparePages } from '../../src/lib/content/rendered-diff';
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

describe('selectsWholeText', () => {
	const text = '# Titel\n\nEen alinea.\n';
	const select = (from: number, to: number) => selectsWholeText({ from, to }, text);

	it('counts a selection of everything', () => {
		expect(select(0, text.length)).toBe(true);
	});

	it('counts a selection that leaves out only white space at either end', () => {
		const padded = '\n  # Titel\n\nEen alinea.\n\n';
		expect(selectsWholeText({ from: 3, to: padded.length - 2 }, padded)).toBe(true);
		expect(selectsWholeText({ from: 0, to: padded.length - 1 }, padded)).toBe(true);
		expect(select(0, text.length - 1)).toBe(true);
	});

	it('does not count a selection that leaves out text', () => {
		expect(select(1, text.length)).toBe(false);
		expect(select(0, text.length - 2)).toBe(false);
		expect(select(9, 20)).toBe(false);
	});

	it('tells a word of a short text from all of it', () => {
		expect(selectsWholeText({ from: 0, to: 6 }, 'Eerste tweede')).toBe(false);
		expect(selectsWholeText({ from: 0, to: 13 }, 'Eerste tweede')).toBe(true);
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

describe('the count in the panel and the one the comparison shows', () => {
	const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n${body}`;
	const text =
		'# Titel\n\nEerste zin. Tweede zin.\n\n## Kop\n\n- een\n- twee\n\n```js\nlet a = 1;\n```\n\nEinde.\n';
	const large = 'woord '.repeat(45_000);
	const cases: [name: string, before: string, after: string, count: number | null][] = [
		['a change in one place', text, text.replace('Tweede zin.', 'Een andere zin.'), 1],
		[
			'a change in two places',
			text,
			text.replace('Tweede zin.', 'Een andere zin.').replace('Einde.', 'Slot.'),
			2
		],
		[
			'a list item and the code block after it, which are one stretch',
			text,
			text.replace('- twee', '- drie').replace('let a = 1;', 'let a = 2;'),
			1
		],
		['a block less', text, text.replace('## Kop\n\n', ''), 1],
		['no change', text, text, 0],
		['a change in the frontmatter only', page('Een', text), page('Twee', text), 0],
		[
			'a change below frontmatter',
			page('Een', text),
			page('Een', text.replace('Einde.', 'Slot.')),
			1
		],
		['a text that is too large', large, `${large}extra`, null]
	];

	for (const [name, before, after, count] of cases) {
		it(`agree for ${name}`, () => {
			const shown = comparePages(before, after, (md) => markdownToHtml(md), document).count;
			expect(shown).toBe(count);
			expect(compare(null, before, after).count).toBe(shown);
		});
	}
});
