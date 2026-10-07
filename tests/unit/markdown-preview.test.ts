import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { PURIFY_CONFIG, markdownToHtml } from '../../src/lib/content/markdown-preview';

const purify = DOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis);
const sanitize = (html: string) => purify.sanitize(html, PURIFY_CONFIG);
const render = (md: string) => markdownToHtml(md, sanitize);

describe('markdownToHtml', () => {
	it('renders headings', () => {
		expect(render('# Titel\n\n## Sub')).toContain('<h1>Titel</h1>');
		expect(render('## Sub')).toContain('<h2>Sub</h2>');
	});

	it('renders a GFM table', () => {
		const html = render('| a | b |\n| - | - |\n| 1 | 2 |\n');
		expect(html).toContain('<table>');
		expect(html).toContain('<th>a</th>');
		expect(html).toContain('<td>2</td>');
	});

	it('renders a fenced code block as nldd-code-viewer with escaped code', () => {
		const html = render('```shell\necho "<b>" && ls\n```');
		expect(html).toContain('<nldd-code-viewer language="shell">');
		expect(html).toContain('echo "&lt;b&gt;" &amp;&amp; ls');
		expect(html).not.toContain('<b>');
	});

	it('renders a mermaid fence as a placeholder with a text fallback', () => {
		const html = render('```mermaid\ngraph TD\n  A-->B\n```');
		const doc = new JSDOM(html).window.document;
		const node = doc.querySelector('div.mermaid');
		expect(decodeURIComponent(node?.getAttribute('data-src') ?? '')).toBe('graph TD\n  A-->B');
		expect(node?.querySelector('pre')?.textContent).toBe('graph TD\n  A-->B');
	});

	it('strips script tags and event handlers', () => {
		const html = render(
			'Hallo <script>alert(1)</script> [x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>'
		);
		expect(html).not.toContain('<script');
		expect(html).not.toContain('onerror');
		expect(html).not.toContain('javascript:');
	});

	it('turns a Hugo shortcode paragraph into a notice', () => {
		const html = render('Voor\n\n{{< youtube abc >}}\n\nNa');
		expect(html).toContain('<p class="niet-in-voorbeeld">Niet in voorbeeld</p>');
		expect(html).not.toContain('youtube');
		expect(html).toContain('<p>Na</p>');
		expect(render('{{% notice %}}')).toContain('Niet in voorbeeld');
	});

	it('turns a raw HTML block into a notice', () => {
		const html = render('<div class="x">\n  inhoud\n</div>\n\nDaarna');
		expect(html).toContain('<p class="niet-in-voorbeeld">Niet in voorbeeld</p>');
		expect(html).not.toContain('<div');
		expect(html).toContain('<p>Daarna</p>');
	});
});
