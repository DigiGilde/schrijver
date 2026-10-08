import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import {
	inImageFolder,
	referencedImages,
	removedImages,
	resolveImageRef
} from '../../src/lib/content/image-refs';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const refs = (text: string, page: string) => [...referencedImages(text, page)].sort();

describe('resolveImageRef', () => {
	it('resolves relative to the folder of the page', () => {
		expect(resolveImageRef('docs/kennis/privacy.md', 'kat.png')).toBe('docs/kennis/kat.png');
		expect(resolveImageRef('docs/kennis/privacy.md', './kat.png')).toBe('docs/kennis/kat.png');
	});

	it('follows ../ out of a page in a subfolder', () => {
		expect(resolveImageRef('docs/kennis/privacy.md', '../afbeeldingen/privacy/kat.png')).toBe(
			'docs/afbeeldingen/privacy/kat.png'
		);
		expect(resolveImageRef('docs/a/b/c.md', '../../x/./kat.png')).toBe('docs/x/kat.png');
	});

	it('resolves from the folder of an _index.md, as for any page', () => {
		expect(resolveImageRef('content/handboek/_index.md', 'images/schema.png')).toBe(
			'content/handboek/images/schema.png'
		);
		expect(resolveImageRef('content/_index.md', 'images/hero/tablet.webp')).toBe(
			'content/images/hero/tablet.webp'
		);
	});

	it('drops a query or fragment and decodes percent-escapes', () => {
		expect(resolveImageRef('docs/a.md', 'kat%20zwart.png?raw=1#boven')).toBe('docs/kat zwart.png');
	});

	it('leaves URLs, site-root paths, anchors and escapes out', () => {
		for (const src of [
			'https://example.org/a.png',
			'//cdn.example.org/a.png',
			'/images/a.png',
			'#a.png',
			'data:image/png;base64,AAAA',
			'../../a.png',
			'kat%E0.png'
		])
			expect(resolveImageRef('docs/a.md', src), src).toBeNull();
	});
});

describe('referencedImages', () => {
	it('finds Markdown images, reference definitions and links to an image', () => {
		const text = [
			'![Kat](../afbeeldingen/privacy/kat.png "Een kat")',
			'![Hond][h]',
			'',
			'[h]: ../afbeeldingen/privacy/hond.webp',
			'',
			'Download [het schema](schema.svg).'
		].join('\n');
		expect(refs(text, 'docs/kennis/privacy.md')).toEqual([
			'docs/afbeeldingen/privacy/hond.webp',
			'docs/afbeeldingen/privacy/kat.png',
			'docs/kennis/schema.svg'
		]);
	});

	it('finds HTML, shortcodes, and paths with spaces between angle brackets or quotes', () => {
		const text = [
			'<img src="images/mijn plaatje.png" alt="Plaatje">',
			'![Kaart](<images/kaart van nl.jpg>)',
			'{{< figure src="images/team.jpeg" >}}',
			"<img src='images/logo.SVG' alt=''>"
		].join('\n');
		// The last word of a name with spaces counts as a path of its own too: one more is harmless.
		expect(refs(text, 'content/over/_index.md')).toEqual(
			expect.arrayContaining([
				'content/over/images/kaart van nl.jpg',
				'content/over/images/logo.SVG',
				'content/over/images/mijn plaatje.png',
				'content/over/images/team.jpeg'
			])
		);
	});

	it('finds images named in the frontmatter of a page bundle', () => {
		const text = [
			'---',
			'lead_image: ondertekening.jpg',
			'hero:',
			'  image: "images/hero/tablet.webp"',
			'---',
			'',
			'Tekst.'
		].join('\n');
		expect(refs(text, 'content/actueel/bericht/index.md')).toEqual([
			'content/actueel/bericht/images/hero/tablet.webp',
			'content/actueel/bericht/ondertekening.jpg'
		]);
	});

	it('reads Markdown escapes and stops at punctuation', () => {
		expect(refs('Zie mijn\\_plaatje.png, of *kat.png*.', 'docs/a.md')).toEqual([
			'docs/kat.png',
			'docs/mijn_plaatje.png'
		]);
	});

	it('skips data URIs, URLs and other files', () => {
		const text =
			'![x](data:image/png;base64,iVBORw0KGgo=) ![y](https://example.org/y.png) [z](z.pdf) a.md';
		expect(refs(text, 'docs/a.md')).toEqual([]);
	});

	it('stays linear on adversarial input', () => {
		for (const text of [
			`![x](${'a'.repeat(400_000)})`,
			`kat${'.'.repeat(400_000)}x`,
			'<'.repeat(200_000),
			`"${'?'.repeat(200_000)}\rx`,
			`'${'a'.repeat(200_000)}`
		]) {
			const start = performance.now();
			referencedImages(text, 'docs/a.md');
			expect(performance.now() - start).toBeLessThan(200);
		}
	});
});

describe('removedImages', () => {
	const page = 'docs/kennis/privacy.md';

	it('lists the images the old text showed and the new one no longer does', () => {
		const before = '![Kat](../afbeeldingen/privacy/kat.png)\n\n![Hond](hond.png)\n';
		expect(removedImages(before, '![Hond](hond.png)\n', page)).toEqual([
			'docs/afbeeldingen/privacy/kat.png'
		]);
	});

	it('does not list an image the new text still reaches another way', () => {
		const before = '![Kat](../afbeeldingen/privacy/kat.png)\n';
		const after = 'Zie <img src="../afbeeldingen/./privacy/kat.png">\n';
		expect(removedImages(before, after, page)).toEqual([]);
	});

	it('lists nothing when no image went', () => {
		expect(removedImages('Tekst.\n', 'Andere tekst.\n', page)).toEqual([]);
	});
});

describe('inImageFolder', () => {
	it('takes a file in the folder of any page under the Digi Handboek convention', () => {
		expect(inImageFolder(digi, 'docs/afbeeldingen/privacy/kat.png')).toBe(true);
		expect(inImageFolder(digi, 'docs/afbeeldingen/kennis/schema.svg')).toBe(true);
	});

	it('takes a file in the images folder beside any MOZa page, also at the root', () => {
		expect(inImageFolder(moza, 'content/images/hero.webp')).toBe(true);
		expect(inImageFolder(moza, 'content/onderwerpen/ontwerpprincipes/images/a.jpg')).toBe(true);
	});

	it('refuses anything else', () => {
		for (const [site, path] of [
			[digi, 'docs/afbeeldingen/kat.png'],
			[digi, 'docs/afbeeldingen/privacy/sub/kat.png'],
			[digi, 'docs/kennis/kat.png'],
			[digi, 'geheim/afbeeldingen/privacy/kat.png'],
			[digi, 'docs/afbeeldingen/../privacy.png'],
			[digi, 'docs/afbeeldingen/../../geheim.png'],
			[digi, 'docs/afbeeldingen/%2e%2e/privacy.png'],
			[digi, 'docs/afbeeldingen/privacy/100%.png'],
			[digi, 'docs/afbeeldingen/./privacy.png'],
			[digi, 'docs/afbeeldingen//privacy.png'],
			[digi, 'docs/afbeeldingen/privacy/notities.md'],
			[digi, '/docs/afbeeldingen/privacy/kat.png'],
			[digi, 'docs/afbeeldingen/privacy\\..\\kat.png'],
			[moza, 'content/onderwerpen/kat.png'],
			[moza, 'content/images/sub/kat.png'],
			[moza, 'static/images/kat.png'],
			[moza, 'content/onderwerpen/images/script.js']
		] as const)
			expect(inImageFolder(site, path), path).toBe(false);
	});

	it('refuses everything for a site without an image convention', () => {
		const site = { ...digi, content: { ...digi.content, afbeeldingen: undefined } };
		expect(inImageFolder(site, 'docs/afbeeldingen/privacy/kat.png')).toBe(false);
	});
});
