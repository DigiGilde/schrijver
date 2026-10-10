import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
	PURIFY_CONFIG,
	markdownToHtml,
	previewImages
} from '../../src/lib/content/markdown-preview';

const purify = DOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis);
const sanitize = (html: string) => purify.sanitize(html, PURIFY_CONFIG);
const render = (md: string) => markdownToHtml(md, sanitize);

describe('markdownToHtml', () => {
	it('renders headings', () => {
		expect(render('# Titel\n\n## Sub')).toContain('<h1>Titel</h1>');
		expect(render('## Sub')).toContain('<h2>Sub</h2>');
	});

	it('places headings below the heading of the page they appear under, and keeps their look', () => {
		const html = markdownToHtml('# Een\n\n## Twee\n\n###### Zes', sanitize, undefined, 2);
		expect(html).toContain('<h1 aria-level="3">Een</h1>');
		expect(html).toContain('<h2 aria-level="4">Twee</h2>');
		expect(html).toContain('<h6 aria-level="6">Zes</h6>');
		expect(render('# Een')).toBe('<h1>Een</h1>');
	});

	it('renders a GFM table', () => {
		const html = render('| a | b |\n| - | - |\n| 1 | 2 |\n');
		expect(html).toContain('<table>');
		expect(html).toContain('<th>a</th>');
		expect(html).toContain('<td>2</td>');
	});

	it('renders a fenced code block as nldd-code-viewer with escaped code', () => {
		const html = render('```shell\necho "<b>" && ls\n```');
		expect(html).toContain('<nldd-code-viewer language="bash">');
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

	it('maps fence aliases to supported grammars', () => {
		expect(render('```yml\na: 1\n```')).toContain('language="yaml"');
		expect(render('```js\n1\n```')).toContain('language="javascript"');
		expect(render('```sh\nls\n```')).toContain('language="bash"');
	});
});

describe('default sanitiser', () => {
	it('throws without a DOM', () => {
		expect(() => markdownToHtml('x')).toThrow(/DOM/);
	});
});

describe('preview images', () => {
	const resolve = previewImages({
		siteId: 'digi-handboek',
		page: 'docs/kennis/privacy.md',
		ref: 'schrijver/digi-handboek/privacy-abcd',
		pending: [{ path: 'docs/afbeeldingen/privacy/nieuw.png', base64: 'iVBORw==' }]
	});
	const img = (md: string) => markdownToHtml(md, sanitize, resolve).match(/src="([^"]*)"/)?.[1];

	it('points a relative image at the preview file route for the page folder and branch', () => {
		expect(img('![Kat](../afbeeldingen/privacy/kat.png)')).toBe(
			'/api/sites/digi-handboek/bestand?pad=docs%2Fafbeeldingen%2Fprivacy%2Fkat.png&amp;ref=schrijver%2Fdigi-handboek%2Fprivacy-abcd'
		);
		expect(img('![Kat](./kat%20zwart.png)')).toBe(
			'/api/sites/digi-handboek/bestand?pad=docs%2Fkennis%2Fkat+zwart.png&amp;ref=schrijver%2Fdigi-handboek%2Fprivacy-abcd'
		);
	});

	it('leaves out the ref on the default branch', () => {
		const main = previewImages({ siteId: 's', page: 'docs/a.md', ref: null, pending: [] });
		expect(main('b.png')).toBe('/api/sites/s/bestand?pad=docs%2Fb.png');
	});

	it("reads a proposal's images at its head, or with kant at where the proposal began", () => {
		const page = { siteId: 's', page: 'docs/a.md', ref: null, pending: [] };
		expect(previewImages({ ...page, voorstel: 7 })('b.png')).toBe(
			'/api/sites/s/bestand?pad=docs%2Fb.png&voorstel=7'
		);
		expect(previewImages({ ...page, voorstel: 7, kant: 'voor' })('b.png')).toBe(
			'/api/sites/s/bestand?pad=docs%2Fb.png&voorstel=7&kant=voor'
		);
		expect(previewImages({ ...page, kant: 'voor' })('b.png'), 'no side without a proposal').toBe(
			'/api/sites/s/bestand?pad=docs%2Fb.png'
		);
	});

	it('shows an image added in this session from memory', () => {
		expect(img('![Nieuw](../afbeeldingen/privacy/nieuw.png)')).toBe(
			'data:image/png;base64,iVBORw=='
		);
	});

	it('rewrites reference-style images', () => {
		expect(img('![Kat][k]\n\n[k]: ../afbeeldingen/kat.png')).toContain(
			'pad=docs%2Fafbeeldingen%2Fkat.png'
		);
	});

	it('leaves absolute, site-root and escaping URLs alone', () => {
		expect(img('![A](https://example.org/a.png)')).toBe('https://example.org/a.png');
		expect(img('![A](/images/a.png)')).toBe('/images/a.png');
		expect(img('![A](../../../a.png)')).toBe('../../../a.png');
	});
});
