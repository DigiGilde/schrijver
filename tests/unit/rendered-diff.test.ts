// @vitest-environment jsdom
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { PURIFY_CONFIG, markdownToHtml } from '../../src/lib/content/markdown-preview';
import {
	TE_GROOT,
	comparePages,
	countChanges,
	renderedDiff,
	splitPage,
	toHtml,
	withContext,
	type DiffBlock
} from '../../src/lib/content/rendered-diff';

const dom = new JSDOM('');
const doc = dom.window.document;
const purify = DOMPurify(dom.window as unknown as Window & typeof globalThis);
const sanitize = (html: string) => purify.sanitize(html, PURIFY_CONFIG);
const render = (md: string) => markdownToHtml(md, sanitize);

const compare = (before: string, after: string) => renderedDiff(before, after, render, doc);
const kinds = (blocks: DiffBlock[]) => blocks.map((block) => block.kind);
const parse = (html: string) => {
	const template = doc.createElement('template');
	template.innerHTML = html;
	return template.content;
};
const changed = (block: DiffBlock | undefined) => {
	if (block?.kind !== 'gewijzigd') throw new Error(`expected a changed block, got ${block?.kind}`);
	return block;
};
const block = (kind: 'gelijk' | 'toegevoegd' | 'verwijderd', n: number): DiffBlock => ({
	kind,
	html: `<p>${n}</p>`
});
const numbered = (count: number, changedAt: number[]) =>
	Array.from({ length: count }, (_, i) =>
		block(changedAt.includes(i + 1) ? 'toegevoegd' : 'gelijk', i + 1)
	);

describe('renderedDiff', () => {
	it('gives only unchanged blocks for identical bodies, which fold into one skipped block', () => {
		const body = '# Kop\n\nEen alinea.\n\nNog een alinea.\n';
		const blocks = compare(body, body);
		expect(kinds(blocks)).toEqual(['gelijk', 'gelijk', 'gelijk']);
		expect(withContext(blocks)).toEqual([{ kind: 'overgeslagen', aantal: 3 }]);
	});

	it('gives an appended paragraph as a final added block', () => {
		const blocks = compare('Een.\n\nTwee.\n', 'Een.\n\nTwee.\n\nDrie.\n');
		expect(kinds(blocks)).toEqual(['gelijk', 'gelijk', 'toegevoegd']);
		expect(blocks[2]).toEqual({ kind: 'toegevoegd', html: '<p>Drie.</p>' });
	});

	it('gives a removed paragraph as a removed block', () => {
		const blocks = compare('Een.\n\nTwee.\n\nDrie.\n', 'Een.\n\nDrie.\n');
		expect(kinds(blocks)).toEqual(['gelijk', 'verwijderd', 'gelijk']);
		expect(blocks[1]).toEqual({ kind: 'verwijderd', html: '<p>Twee.</p>' });
	});

	it('marks one changed word on both sides and nothing else', () => {
		const [only, ...rest] = compare('Dit is de oude tekst.\n', 'Dit is de nieuwe tekst.\n');
		expect(rest).toEqual([]);
		expect(only).toEqual({
			kind: 'gewijzigd',
			was: '<p>Dit is de <del>oude</del> tekst.</p>',
			wordt: '<p>Dit is de <ins>nieuwe</ins> tekst.</p>'
		});
	});

	it('keeps all list items when one word in the second item changes', () => {
		const [only] = compare('- een\n- twee woorden\n- drie\n', '- een\n- twee zinnen\n- drie\n');
		const { was, wordt } = changed(only);
		for (const side of [was, wordt]) expect(parse(side).querySelectorAll('li')).toHaveLength(3);
		const del = parse(was).querySelectorAll('del');
		const ins = parse(wordt).querySelectorAll('ins');
		expect([...del].map((e) => e.textContent)).toEqual(['woorden']);
		expect([...ins].map((e) => e.textContent)).toEqual(['zinnen']);
		expect(del[0].closest('li')?.textContent).toBe('twee woorden');
		expect(ins[0].closest('li')?.textContent).toBe('twee zinnen');
		expect(parse(was).querySelector('ul')?.children).toHaveLength(3);
	});

	it('marks the text of an added list item and nothing on the old side', () => {
		const [only] = compare('- een\n- twee\n', '- een\n- twee\n- drie\n');
		const { was, wordt } = changed(only);
		expect(was).not.toMatch(/<(ins|del)>/);
		expect(wordt).toContain('<li><ins>drie</ins></li>');
		expect(parse(wordt).querySelectorAll('ins')).toHaveLength(1);
		expect(parse(wordt).querySelectorAll('del')).toHaveLength(0);
	});

	it('shows a changed heading level as a removal and an addition', () => {
		const blocks = compare('## Kop\n', '### Kop\n');
		expect(blocks).toEqual([
			{ kind: 'verwijderd', html: '<h2>Kop</h2>' },
			{ kind: 'toegevoegd', html: '<h3>Kop</h3>' }
		]);
	});

	it('shows a changed code block as a removal and an addition without marks inside it', () => {
		const blocks = compare('```js\nconst a = 1;\n```\n', '```js\nconst a = 2;\n```\n');
		expect(kinds(blocks)).toEqual(['verwijderd', 'toegevoegd']);
		for (const { html } of blocks as { html: string }[]) {
			expect(html).toContain('<nldd-code-viewer');
			expect(html).not.toMatch(/<(ins|del)>/);
		}
	});

	it('leaves code inside a changed list unmarked', () => {
		const item = (command: string) => `- stap\n\n  \`\`\`sh\n  ${command}\n  \`\`\`\n`;
		const [only] = compare(item('ls'), item('ls -l'));
		const { was, wordt } = changed(only);
		for (const side of [was, wordt]) {
			expect(parse(side).querySelector('nldd-code-viewer')).not.toBeNull();
			expect(parse(side).querySelector('nldd-code-viewer ins, nldd-code-viewer del')).toBeNull();
			expect(parse(side).querySelector('ins, del')).toBeNull();
		}
	});

	it('shows a changed raw HTML block as a removal and an addition', () => {
		const blocks = compare('<div>een</div>\n', '<div>twee</div>\n');
		expect(kinds(blocks)).toEqual(['verwijderd', 'toegevoegd']);
	});

	it('shows a block that changes kind as a removal and an addition', () => {
		const blocks = compare('Een alinea.\n', '- Een alinea.\n');
		expect(blocks).toEqual([
			{ kind: 'verwijderd', html: '<p>Een alinea.</p>' },
			{ kind: 'toegevoegd', html: '<ul>\n<li>Een alinea.</li>\n</ul>' }
		]);
	});

	it('renders reference-style links on both sides of a changed paragraph', () => {
		const definition = '[form]: https://example.org/a\n';
		const blocks = compare(
			`Lees [het formulier][form] voor.\n\nStaat elders.\n\n${definition}`,
			`Lees [het nieuwe formulier][form] voor.\n\nStaat elders.\n\n${definition}`
		);
		expect(kinds(blocks)).toEqual(['gewijzigd', 'gelijk']);
		const { was, wordt } = changed(blocks[0]);
		for (const side of [was, wordt]) {
			expect(parse(side).querySelector('a')?.getAttribute('href')).toBe('https://example.org/a');
		}
		expect(parse(wordt).querySelector('a')?.innerHTML).toBe('het <ins>nieuwe </ins>formulier');
	});

	it('pairs similar blocks in order and leaves the rest of the longer side alone', () => {
		const fewer = compare(
			'Het team werkt open.\n\nEen.\n\nTwee.\n',
			'Het team werkt open en eerlijk.\n'
		);
		expect(kinds(fewer)).toEqual(['gewijzigd', 'verwijderd', 'verwijderd']);
		const more = compare(
			'Het team werkt open.\n',
			'Het team werkt open en eerlijk.\n\nEen.\n\nTwee.\n'
		);
		expect(kinds(more)).toEqual(['gewijzigd', 'toegevoegd', 'toegevoegd']);
	});

	it('keeps a removed paragraph removed when the next paragraph is edited', () => {
		const blocks = compare(
			'Intro\n\nDeze alinea gaat eruit.\n\nWe werken open en delen code.\n\nSlot.\n',
			'Intro\n\nWe werken altijd open en delen code.\n\nSlot.\n'
		);
		expect(kinds(blocks)).toEqual(['gelijk', 'verwijderd', 'gewijzigd', 'gelijk']);
		expect(blocks[1]).toEqual({ kind: 'verwijderd', html: '<p>Deze alinea gaat eruit.</p>' });
		expect(blocks[2]).toEqual({
			kind: 'gewijzigd',
			was: '<p>We werken open en delen code.</p>',
			wordt: '<p>We werken <ins>altijd </ins>open en delen code.</p>'
		});
	});

	it('keeps an inserted paragraph added when the next paragraph is edited', () => {
		const blocks = compare(
			'Intro\n\nHet team werkt open.\n\nSlot.\n',
			'Intro\n\nHier staat iets compleet nieuws.\n\nHet team werkt altijd open.\n\nSlot.\n'
		);
		expect(kinds(blocks)).toEqual(['gelijk', 'toegevoegd', 'gewijzigd', 'gelijk']);
		expect(blocks[1]).toEqual({
			kind: 'toegevoegd',
			html: '<p>Hier staat iets compleet nieuws.</p>'
		});
		expect(changed(blocks[2]).wordt).toBe('<p>Het team werkt <ins>altijd </ins>open.</p>');
	});

	it('keeps an edited paragraph paired when a removed paragraph follows it', () => {
		const blocks = compare(
			'Intro\n\nHet team werkt open.\n\nDeze alinea gaat eruit.\n\nSlot.\n',
			'Intro\n\nHet team werkt open en eerlijk.\n\nSlot.\n'
		);
		expect(kinds(blocks)).toEqual(['gelijk', 'gewijzigd', 'verwijderd', 'gelijk']);
		expect(blocks[2]).toEqual({ kind: 'verwijderd', html: '<p>Deze alinea gaat eruit.</p>' });
	});

	it('pairs nothing when no new block resembles an old one', () => {
		const blocks = compare(
			'Voor.\n\nKoffie en thee staan klaar.\n\nDe planning volgt later.\n\nNa.\n',
			'Voor.\n\nHier komt een andere zin.\n\nDaar nog eentje erbij.\n\nNa.\n'
		);
		expect(kinds(blocks)).toEqual([
			'gelijk',
			'verwijderd',
			'verwijderd',
			'toegevoegd',
			'toegevoegd',
			'gelijk'
		]);
		expect(blocks.slice(1, 5).map((b) => (b as { html: string }).html)).toEqual([
			'<p>Koffie en thee staan klaar.</p>',
			'<p>De planning volgt later.</p>',
			'<p>Hier komt een andere zin.</p>',
			'<p>Daar nog eentje erbij.</p>'
		]);
	});

	it('pairs a block with the most similar of two candidates, not the first acceptable one', () => {
		const blocks = compare(
			'Wij bouwen open software voor de overheid.\n',
			'Wij bouwen open software.\n\nWij bouwen open software voor de overheid en delen die.\n'
		);
		expect(kinds(blocks)).toEqual(['toegevoegd', 'gewijzigd']);
		expect(blocks[0]).toEqual({ kind: 'toegevoegd', html: '<p>Wij bouwen open software.</p>' });
	});

	it('pairs blocks that keep half of their characters and not blocks that keep less', () => {
		expect(kinds(compare('abcd efgh\n', 'abcd wxyz\n'))).toEqual(['gewijzigd']);
		expect(kinds(compare('abcd efgh\n', 'abcd wxyz.\n'))).toEqual(['verwijderd', 'toegevoegd']);
	});

	it('does not count the whitespace between list items as shared text', () => {
		const blocks = compare('- a\n- b\n- c\n', '- x\n- y\n- z\n');
		expect(kinds(blocks)).toEqual(['verwijderd', 'toegevoegd']);
	});

	it('keeps tables, links and emphasis intact while marking words', () => {
		const [table] = compare(
			'| a | b |\n| - | - |\n| 1 | 2 |\n',
			'| a | b |\n| - | - |\n| 1 | 3 |\n'
		);
		const { was, wordt } = changed(table);
		expect(parse(was).querySelectorAll('td')).toHaveLength(2);
		expect(parse(wordt).querySelectorAll('td')).toHaveLength(2);
		expect(wordt).toContain('<td><ins>3</ins></td>');
		expect(was).toContain('<td><del>2</del></td>');

		const [text] = compare(
			'Een **vette** [link](https://a.nl).\n',
			'Een **vette** nieuwe [link](https://a.nl).\n'
		);
		const marked = changed(text).wordt;
		expect(marked).toContain('<strong>vette</strong>');
		expect(marked).toContain('<a href="https://a.nl">link</a>');
		expect(marked).toContain('<ins>nieuwe </ins>');
	});

	it('does not mark whitespace between block elements', () => {
		const [only] = compare('- een\n- twee\n- drie\n', '- een\n- drie\n- vier\n');
		const { was, wordt } = changed(only);
		for (const side of [was, wordt]) {
			const list = parse(side).querySelector('ul');
			expect([...(list?.children ?? [])].every((child) => child.localName === 'li')).toBe(true);
		}
	});

	it('renders footnotes on both sides of a changed paragraph', () => {
		const note = '[^1]: Een voetnoot.\n';
		const [only] = compare(`Tekst[^1] oud.\n\n${note}`, `Tekst[^1] nieuw.\n\n${note}`);
		const { was, wordt } = changed(only);
		for (const side of [was, wordt]) {
			expect(parse(side).querySelector('sup a')).not.toBeNull();
			expect(parse(side).querySelector('section[data-footnotes]')?.textContent).toContain(
				'Een voetnoot.'
			);
		}
	});

	it('marks a changed character outside the basic plane as a whole', () => {
		const [only] = compare('Een \u{1F600} test.\n', 'Een \u{1F603} test.\n');
		const { was, wordt } = changed(only);
		expect(was).toBe('<p>Een <del>\u{1F600}</del> test.</p>');
		expect(wordt).toBe('<p>Een <ins>\u{1F603}</ins> test.</p>');
	});

	it('leaves line endings and a byte order mark out of the comparison', () => {
		const blocks = compare(
			'\uFEFF# Kop\r\n\r\nEen.\r\n\r\n- a\r\n- b\r\n',
			'# Kop\n\nEen.\n\n- a\n- b\n'
		);
		expect(kinds(blocks)).toEqual(['gelijk', 'gelijk', 'gelijk']);
	});

	it('handles an empty side', () => {
		expect(kinds(compare('', 'Nieuw.\n'))).toEqual(['toegevoegd']);
		expect(kinds(compare('Oud.\n', ''))).toEqual(['verwijderd']);
		expect(compare('', '')).toEqual([]);
	});

	it('does not pair blocks whose word diff is too large to compute', () => {
		const long = (prefix: string) =>
			Array.from({ length: 600 }, (_, i) => `gemeenschappelijk ${prefix}${i}`).join(' ') + '\n';
		expect(kinds(compare(long('a'), long('b')))).toEqual(['verwijderd', 'toegevoegd']);
	});

	it('keeps text that renders escaped escaped after marking', () => {
		const [only] = compare('Gebruik \\<b\\> niet.\n', 'Gebruik \\<b\\> nooit.\n');
		const { was, wordt } = changed(only);
		expect(was).toBe('<p>Gebruik &lt;b&gt; <del>niet</del>.</p>');
		expect(wordt).toBe('<p>Gebruik &lt;b&gt; <ins>nooit</ins>.</p>');

		const [inside] = compare('Gebruik \\<b\\> niet.\n', 'Gebruik \\<i\\> niet.\n');
		const html = toHtml([inside], doc);
		expect(html).toContain('&lt;<del>b</del>&gt;');
		expect(html).toContain('&lt;<ins>i</ins>&gt;');
		expect(parse(html).querySelector('b, i')).toBeNull();

		const raw = toHtml(compare('Gebruik <b> niet.\n', 'Gebruik <b> nooit.\n'), doc);
		expect(parse(raw).querySelector('b')).toBeNull();
	});
});

describe('limits', () => {
	const paragraphs = (prefix: string, count: number) =>
		Array.from({ length: count }, (_, i) => `${prefix} ${i}`).join('\n\n') + '\n';

	it('gives up quickly when thousands of blocks changed', () => {
		const started = performance.now();
		const blocks = compare(paragraphs('oud', 2500), paragraphs('nieuw', 2500));
		expect(performance.now() - started).toBeLessThan(2000);
		expect(blocks).toEqual([{ kind: 'te-groot' }]);
	});

	it('gives up on pages that together exceed the character limit', () => {
		expect(compare('a'.repeat(300_000), 'b'.repeat(300_000))).toEqual([{ kind: 'te-groot' }]);
	});

	it('gives up before rendering anything when rendering would cost too much', () => {
		const definitions = Array.from(
			{ length: 200 },
			(_, i) => `[ref${i}]: https://example.org/${i}`
		).join('\n');
		const page = (prefix: string) => `${paragraphs(prefix, 500)}\n${definitions}\n`;
		let rendered = 0;
		const counting = (markdown: string) => (rendered++, render(markdown));
		const blocks = renderedDiff(page('oud'), page('nieuw'), counting, doc);
		expect(blocks).toEqual([{ kind: 'te-groot' }]);
		expect(rendered).toBe(0);
	});

	it('still compares a page of a thousand blocks with one change', () => {
		const before = paragraphs('Alinea met wat tekst erin, nummer', 1000);
		const blocks = compare(before, before.replace('nummer 500\n', 'nummer vijfhonderd\n'));
		expect(blocks.filter((block) => block.kind === 'gelijk')).toHaveLength(999);
		expect(blocks.filter((block) => block.kind === 'gewijzigd')).toHaveLength(1);
	});

	it('pairs runs of up to 50 blocks and leaves longer runs unpaired', () => {
		const page = (count: number, suffix: string) =>
			Array.from({ length: count }, (_, i) => `Punt ${i}${suffix}.`).join('\n\n') + '\n';
		expect(
			kinds(compare(page(50, ''), page(50, ' ok'))).every((kind) => kind === 'gewijzigd')
		).toBe(true);
		const long = kinds(compare(page(51, ''), page(51, ' ok')));
		expect(long.filter((kind) => kind === 'verwijderd')).toHaveLength(51);
		expect(long.filter((kind) => kind === 'toegevoegd')).toHaveLength(51);
	});

	it('stops pairing once the word diffs have used their share of the characters', () => {
		const paragraph = (id: number, last: string) => `${`alfa${id} beta${id} `.repeat(2000)}${last}`;
		const page = (last: string) => [0, 1, 2].map((id) => paragraph(id, last)).join('\n\n') + '\n';
		expect(kinds(compare(page('oud'), page('nieuw')))).toEqual([
			'gewijzigd',
			'gewijzigd',
			'verwijderd',
			'toegevoegd'
		]);
	});
});

describe('withContext', () => {
	it('keeps one block around a change and folds longer unchanged runs', () => {
		const blocks = numbered(12, [2, 9]);
		const result = withContext(blocks);
		expect(result).toEqual([
			blocks[0],
			blocks[1],
			blocks[2],
			{ kind: 'overgeslagen', aantal: 4 },
			blocks[7],
			blocks[8],
			blocks[9],
			{ kind: 'overgeslagen', aantal: 2 }
		]);
	});

	it('keeps a run that would hide only one block', () => {
		const blocks = numbered(8, [2, 6]);
		expect(withContext(blocks)).toEqual(blocks);
	});

	it('takes the number of blocks around a change from the argument', () => {
		const blocks = numbered(12, [6]);
		expect(withContext(blocks, 0)).toEqual([
			{ kind: 'overgeslagen', aantal: 5 },
			blocks[5],
			{ kind: 'overgeslagen', aantal: 6 }
		]);
		expect(withContext(blocks, 2)).toEqual([
			{ kind: 'overgeslagen', aantal: 3 },
			...blocks.slice(3, 8),
			{ kind: 'overgeslagen', aantal: 4 }
		]);
	});

	it('folds a document without changes into one block, however short', () => {
		expect(withContext(numbered(1, []))).toEqual([{ kind: 'overgeslagen', aantal: 1 }]);
		expect(withContext(numbered(5, []))).toEqual([{ kind: 'overgeslagen', aantal: 5 }]);
		expect(withContext([])).toEqual([]);
	});

	it('keeps adjacent changes together', () => {
		const blocks = numbered(9, [4, 5]);
		expect(withContext(blocks)).toEqual([
			{ kind: 'overgeslagen', aantal: 2 },
			...blocks.slice(2, 6),
			{ kind: 'overgeslagen', aantal: 3 }
		]);
	});
});

describe('toHtml', () => {
	const STATE: Record<string, string> = {
		Nieuw: 'toegevoegd',
		Verwijderd: 'verwijderd',
		Was: 'was',
		Wordt: 'wordt'
	};
	const word = (text: string) =>
		`<span class="diff-woord" data-woord="${STATE[text]}" aria-hidden="true">${text}</span>`;

	it('says in a word what each block is, and names it for screen readers', () => {
		const html = toHtml(
			[
				{ kind: 'gelijk', html: '<p>Zelfde</p>' },
				{ kind: 'toegevoegd', html: '<p>Erbij</p>' },
				{ kind: 'verwijderd', html: '<p>Oud</p>' },
				{ kind: 'gewijzigd', was: '<p>Voor <del>x</del></p>', wordt: '<p>Na <ins>y</ins></p>' },
				{ kind: 'overgeslagen', aantal: 1 },
				{ kind: 'overgeslagen', aantal: 14 }
			],
			doc
		);
		expect(html).toContain('<p>Zelfde</p>');
		expect(html).toContain(
			`<p data-diff="toegevoegd">${word('Nieuw')}<span class="sr-only">Toegevoegd: </span>Erbij</p>`
		);
		expect(html).toContain(
			`<p data-diff="verwijderd">${word('Verwijderd')}<span class="sr-only">Verwijderd: </span>Oud</p>`
		);
		expect(html).toContain(
			`<p data-diff="was">${word('Was')}<span class="sr-only">Oude tekst: </span>Voor <del>x</del></p>`
		);
		expect(html).toContain(
			`<p data-diff="wordt">${word('Wordt')}<span class="sr-only">Nieuwe tekst: </span>Na <ins>y</ins></p>`
		);
		expect(html).toContain('<p class="diff-overgeslagen">1 alinea ongewijzigd</p>');
		expect(html).toContain('<p class="diff-overgeslagen">14 alinea\'s ongewijzigd</p>');
	});

	it('keeps every top-level element a direct child, with no wrapper', () => {
		const html = toHtml(
			compare(
				'# Kop\n\nEen oude alinea.\n\n- a\n- b\n',
				'# Kop\n\nEen nieuwe alinea.\n\n- a\n- b\n\n- c\n'
			),
			doc
		);
		const top = [...parse(html).children];
		expect(top.map((e) => e.localName)).toEqual(['h1', 'p', 'p', 'ul', 'ul']);
		expect(top.map((e) => e.getAttribute('data-diff'))).toEqual([
			null,
			'was',
			'wordt',
			'was',
			'wordt'
		]);
	});

	it('puts the prefix inside the first list item, never directly in the list', () => {
		const html = toHtml(
			[{ kind: 'toegevoegd', html: '<ul>\n<li>een</li>\n<li>twee</li>\n</ul>' }],
			doc
		);
		const list = parse(html).querySelector('ul')!;
		expect([...list.children].every((child) => child.localName === 'li')).toBe(true);
		expect(list.children[0].innerHTML).toBe(
			`${word('Nieuw')}<span class="sr-only">Toegevoegd: </span>een`
		);
		expect(list.children[1].innerHTML).toBe('twee');
	});

	it('puts the prefix in front of a link or a mark at the start of the text, not inside it', () => {
		const link = toHtml(
			[{ kind: 'toegevoegd', html: '<p><a href="https://a.nl">link</a> tekst</p>' }],
			doc
		);
		expect(link).toContain(
			`<p data-diff="toegevoegd">${word('Nieuw')}<span class="sr-only">Toegevoegd: </span><a href`
		);
		const mark = toHtml(
			[
				{
					kind: 'gewijzigd',
					was: '<p><del>oud</del> tekst</p>',
					wordt: '<p><ins>nieuw</ins> tekst</p>'
				}
			],
			doc
		);
		expect(mark).toContain('<span class="sr-only">Oude tekst: </span><del>oud</del>');
		expect(mark).toContain('<span class="sr-only">Nieuwe tekst: </span><ins>nieuw</ins>');
	});

	it('puts the prefix outside a code block, whose text is its code', () => {
		const code = '<nldd-code-viewer language="bash">ls</nldd-code-viewer>';
		const html = toHtml([{ kind: 'verwijderd', html: code }], doc);
		expect(html).toBe(
			`${word('Verwijderd')}<span class="sr-only">Verwijderd: </span><nldd-code-viewer language="bash" data-diff="verwijderd">ls</nldd-code-viewer>`
		);
	});

	it('shows a comparison that is too large as one line', () => {
		const html = toHtml(withContext([{ kind: 'te-groot' }]), doc);
		expect(html).toBe(`<p class="diff-overgeslagen">${TE_GROOT}</p>`);
		expect(TE_GROOT).toBe('Deze wijziging is te groot om hier te tonen. Bekijk haar op GitHub.');
	});

	it('survives the sanitiser that runs before the markup is shown', () => {
		const html = sanitize(
			toHtml(
				[
					{ kind: 'toegevoegd', html: '<p>Nieuw</p>' },
					{ kind: 'toegevoegd', html: '<nldd-code-viewer language="bash">ls</nldd-code-viewer>' },
					{ kind: 'overgeslagen', aantal: 2 }
				],
				doc
			)
		);
		expect(html).toContain('data-diff="toegevoegd"');
		expect(html).toContain(`${word('Nieuw')}<span class="sr-only">Toegevoegd: </span>Nieuw`);
		expect(html).toContain('<nldd-code-viewer');
		expect(html).toContain('class="diff-overgeslagen"');
	});
});

describe('countChanges', () => {
	it('counts runs of changed blocks, not blocks', () => {
		const gelijk = block('gelijk', 0);
		const plus = block('toegevoegd', 0);
		const min = block('verwijderd', 0);
		const pair: DiffBlock = { kind: 'gewijzigd', was: '', wordt: '' };
		expect(countChanges([gelijk, gelijk])).toBe(0);
		expect(countChanges([])).toBe(0);
		expect(countChanges([plus, min, pair])).toBe(1);
		expect(countChanges([plus, gelijk, min, pair, gelijk, gelijk, plus])).toBe(3);
		expect(countChanges([gelijk, plus, plus, gelijk])).toBe(1);
	});
});

describe('splitPage', () => {
	it('keeps the frontmatter apart from the body', () => {
		expect(splitPage('---\ntitle: Een\n---\n# Kop\n\nTekst.\n')).toEqual({
			frontmatter: { title: 'Een' },
			body: '# Kop\n\nTekst.\n'
		});
	});

	it('has no frontmatter in a text without any', () => {
		expect(splitPage('# Kop\n')).toEqual({ frontmatter: {}, body: '# Kop\n' });
	});

	it('takes the whole text as the body when the frontmatter does not parse', () => {
		const text = '---\ntitle: [kapot\n---\n# Kop\n';
		expect(splitPage(text)).toEqual({ frontmatter: {}, body: text });
	});
});

describe('comparePages', () => {
	const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n${body}`;
	const compared = (before: string, after: string) => comparePages(before, after, render, doc);

	it('compares the bodies of two pages and counts the stretches of changed blocks', () => {
		const result = compared(
			page('Een', 'Eerste.\n\nTweede.\n\nDerde.\n'),
			page('Een', 'Eerste.\n\nGewijzigd.\n\nDerde.\n\nVierde.\n')
		);
		expect(result.blocks).toEqual(
			compare('Eerste.\n\nTweede.\n\nDerde.\n', 'Eerste.\n\nGewijzigd.\n\nDerde.\n\nVierde.\n')
		);
		expect(result.count).toBe(2);
		expect(result.count).toBe(countChanges(result.blocks));
	});

	it('counts no change in the frontmatter, which the comparison shows apart', () => {
		const result = compared(page('Een', 'Tekst.\n'), page('Twee', 'Tekst.\n'));
		expect(kinds(result.blocks)).toEqual(['gelijk']);
		expect(result.count).toBe(0);
	});

	it('has no count when the comparison is too large to make', () => {
		const large = 'woord '.repeat(45_000);
		const result = compared(large, `${large}extra`);
		expect(kinds(result.blocks)).toEqual(['te-groot']);
		expect(result.count).toBeNull();
	});
});
