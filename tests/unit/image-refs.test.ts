import { describe, expect, it } from 'vitest';
import {
	imageNameTails,
	inImageFolder,
	mentionsName,
	reachesNamesake,
	referencedImages,
	removedImages,
	resolveImageRef,
	resolveSiteRootRef
} from '../../src/lib/content/image-refs';
import { digi, moza } from './sites-fixture';

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

describe('resolveSiteRootRef', () => {
	it('puts the content folder in front of a site-root path', () => {
		expect(resolveSiteRootRef('content', '/onderwerpen/images/kaart.png')).toBe(
			'content/onderwerpen/images/kaart.png'
		);
		expect(resolveSiteRootRef('docs', '/afbeeldingen/privacy/kat%20zwart.png?v=2')).toBe(
			'docs/afbeeldingen/privacy/kat zwart.png'
		);
	});

	it('leaves relative paths, URLs and protocol-relative addresses out', () => {
		for (const src of ['images/a.png', 'https://example.org/a.png', '//cdn.example.org/a.png'])
			expect(resolveSiteRootRef('content', src), src).toBeNull();
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

describe('referencedImages with the content folder', () => {
	it('counts a site-root path as the image under the content folder', () => {
		const text = '![Kaart](/onderwerpen/images/kaart.png) en ![Logo](images/logo.svg)';
		expect([...referencedImages(text, 'content/over.md', 'content')].sort()).toEqual([
			'content/images/logo.svg',
			'content/onderwerpen/images/kaart.png'
		]);
		expect([...referencedImages(text, 'content/over.md')]).toEqual(['content/images/logo.svg']);
	});
});

describe('mentionsName', () => {
	const mentions = (text: string, image: string) => mentionsName(imageNameTails(text), image);

	it('finds the file name anywhere, whatever stands around it or how it is cased', () => {
		const image = 'content/a/images/Team foto.JPEG';
		expect(mentions('foto: "elders/team foto.jpeg"', image)).toBe(true);
		expect(mentions('fotos:\n  - Team foto.JPEG\n', image)).toBe(true);
		expect(mentions('{"src":"images\\/team%20foto.jpeg"}', image)).toBe(true);
		expect(mentions('mijn\\_team foto.jpeg', 'docs/x/mijn_team foto.jpeg')).toBe(true);
		expect(mentions('background: url(../images/team foto.jpeg);', image)).toBe(true);
	});

	it('does not find another name, or the name without its extension', () => {
		const image = 'content/a/images/team.jpeg';
		expect(mentions('team.png en team.jpg en teamjpeg', image)).toBe(false);
		expect(mentions('team', image)).toBe(false);
		expect(mentions('', image)).toBe(false);
	});

	it('compares a long name by its end', () => {
		const name = `${'a'.repeat(100)}.png`;
		expect(mentions(`zie ${name}`, `docs/x/${name}`)).toBe(true);
		expect(mentions(`zie ${'b'.repeat(100)}.png`, `docs/x/${name}`)).toBe(false);
	});

	it('stays linear on adversarial input', () => {
		for (const text of [
			'.png'.repeat(100_000),
			`${'a'.repeat(400_000)}.png`,
			'%.svg'.repeat(80_000)
		]) {
			const start = performance.now();
			mentions(text, 'docs/x/kat.png');
			expect(performance.now() - start).toBeLessThan(500);
		}
	});
});

describe('reachesNamesake', () => {
	const image = 'docs/afbeeldingen/privacy/schema.png';
	const own = 'docs/afbeeldingen/werkwijze/schema.png';

	it('finds a path to another file of the same name that exists, whatever its case', () => {
		expect(reachesNamesake([own], image, new Set([own]))).toBe(true);
		const upper = 'docs/afbeeldingen/werkwijze/Schema.PNG';
		expect(reachesNamesake([upper], image, new Set([upper]))).toBe(true);
	});

	it('does not count the image itself, a path that is not there, or another name', () => {
		expect(reachesNamesake([image], image, new Set([image]))).toBe(false);
		expect(reachesNamesake([own], image, new Set())).toBe(false);
		const other = 'docs/afbeeldingen/werkwijze/mijn-schema.png';
		expect(reachesNamesake([other], image, new Set([other]))).toBe(false);
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
