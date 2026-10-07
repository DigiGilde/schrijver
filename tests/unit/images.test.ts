import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import {
	ImageError,
	MAX_IMAGE_BYTES,
	imagePath,
	sanitizeSvg,
	validateImage
} from '../../src/lib/content/images';
import { setConfigStore } from '../../src/lib/server/services';
import { POST } from '../../src/routes/api/sites/[site]/afbeelding/+server';

const sites = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const digi = sites.find((s) => s.id === 'digi-handboek')!;
const moza = sites.find((s) => s.id === 'moza-site')!;

const PNG = Uint8Array.from(
	Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
		'base64'
	)
);

describe('imagePath', () => {
	it('resolves the Digi Handboek convention', () => {
		expect(imagePath(digi, 'docs/kennis/foo.md', 'bar.png')).toEqual({
			repoPath: 'docs/afbeeldingen/foo/bar.png',
			markdownRef: '../afbeeldingen/foo/bar.png'
		});
	});

	it('resolves a MOZa bundle page', () => {
		expect(imagePath(moza, 'content/actueel/x/index.md', 'bar.png')).toEqual({
			repoPath: 'content/actueel/x/images/bar.png',
			markdownRef: 'images/bar.png'
		});
	});

	it('uses the parent folder as slug for _index.md', () => {
		expect(imagePath(digi, 'docs/kennis/_index.md', 'a.png').repoPath).toBe(
			'docs/afbeeldingen/kennis/a.png'
		);
	});

	it('sanitises the file name', () => {
		expect(imagePath(digi, 'docs/kennis/foo.md', 'Foto Éen.PNG').repoPath).toBe(
			'docs/afbeeldingen/foo/foto-een.png'
		);
	});

	it('rejects empty names and disallowed extensions', () => {
		expect(() => imagePath(digi, 'docs/foo.md', '???.png')).toThrow(ImageError);
		expect(() => imagePath(digi, 'docs/foo.md', 'x.exe')).toThrow(ImageError);
	});

	it('rejects sites without an image convention', () => {
		const site = { ...digi, content: { ...digi.content, afbeeldingen: undefined } };
		expect(() => imagePath(site, 'docs/foo.md', 'a.png')).toThrow(
			'Deze site accepteert geen afbeeldingen'
		);
	});
});

describe('validateImage', () => {
	it('accepts a png', () => {
		expect(validateImage(PNG, 'image/png')).toEqual({ ok: true, mime: 'image/png' });
	});

	it('rejects more than 5 MB with 413', () => {
		const big = new Uint8Array(MAX_IMAGE_BYTES + 1024 * 1024);
		big.set(PNG);
		expect(validateImage(big, 'image/png')).toMatchObject({ ok: false, status: 413 });
	});

	it('rejects png declared with jpeg bytes with 415', () => {
		const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(validateImage(jpeg, 'image/png')).toMatchObject({ ok: false, status: 415 });
	});

	it('rejects unknown types with 415', () => {
		expect(validateImage(PNG, 'image/gif')).toMatchObject({ ok: false, status: 415 });
	});

	it('requires <svg in svg files', () => {
		expect(validateImage(new TextEncoder().encode('hello'), 'image/svg+xml')).toMatchObject({
			ok: false,
			status: 415
		});
	});
});

describe('sanitizeSvg', () => {
	it('removes scripts and event handlers', () => {
		const out = sanitizeSvg(
			'<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>alert(1)</script><circle r="1" onclick="y()"/></svg>'
		);
		expect(out).toContain('<circle');
		expect(out).not.toMatch(/script|onload|onclick|alert/);
	});
});

describe('POST /api/sites/[site]/afbeelding', () => {
	beforeAll(() => {
		setConfigStore({ site: (id: string) => sites.find((s) => s.id === id) } as never);
	});

	function call(opts: {
		alt?: string;
		user?: boolean;
		header?: boolean;
		site?: string;
		pagina?: string;
		file?: File;
		contentLength?: string;
	}) {
		const form = new FormData();
		form.set('bestand', opts.file ?? new File([PNG], 'Foto.png', { type: 'image/png' }));
		form.set('pagina', opts.pagina ?? 'docs/kennis/foo.md');
		if (opts.alt !== undefined) form.set('alt', opts.alt);
		const headers: Record<string, string> = {};
		if (opts.header !== false) headers['X-Requested-With'] = 'Schrijver';
		if (opts.contentLength) headers['content-length'] = opts.contentLength;
		const request = new Request('http://localhost/api/sites/digi-handboek/afbeelding', {
			method: 'POST',
			body: form,
			headers
		});
		return POST({
			request,
			params: { site: opts.site ?? 'digi-handboek' },
			locals: { user: opts.user === false ? null : { id: 'u' } }
		} as never);
	}

	it('returns 400 without alt text', async () => {
		const res = await call({ alt: '  ' });
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ message: 'Alt-tekst is verplicht' });
	});

	it('returns 401 without a user and 403 without the header', async () => {
		expect((await call({ alt: 'x', user: false })).status).toBe(401);
		expect((await call({ alt: 'x', header: false })).status).toBe(403);
	});

	it('returns the resolved path and content for a valid png', async () => {
		const res = await call({ alt: 'Een pixel' });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({
			repoPath: 'docs/afbeeldingen/foo/foto.png',
			markdownRef: '../afbeeldingen/foo/foto.png',
			mime: 'image/png'
		});
		expect(Buffer.from(body.base64, 'base64')).toEqual(Buffer.from(PNG));
	});

	it.each(['/etc/x.md', '.github/workflows/x.md', 'docs/../.github/x.md', 'docs\\x.md', 'docs/kennis/foo.txt'])(
		'rejects page path %s with 400',
		async (pagina) => {
			expect((await call({ alt: 'x', pagina })).status).toBe(400);
		}
	);

	it('returns 404 for an unknown site', async () => {
		expect((await call({ alt: 'x', site: 'nope' })).status).toBe(404);
	});

	it('rejects alt text over 500 characters', async () => {
		expect((await call({ alt: 'a'.repeat(501) })).status).toBe(400);
	});

	it('returns 413 on a large Content-Length and on a large file', async () => {
		expect((await call({ alt: 'x', contentLength: String(10 * 1024 * 1024) })).status).toBe(413);
		const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'a.png', { type: 'image/png' });
		expect((await call({ alt: 'x', file: big })).status).toBe(413);
	});

	it('returns 415 for a gif', async () => {
		const gif = new File([PNG], 'a.gif', { type: 'image/gif' });
		expect((await call({ alt: 'x', file: gif })).status).toBe(415);
	});

	it('returns 415 when sanitising leaves no svg', async () => {
		const svg = new File(['<script><svg></svg></script>'], 'a.svg', { type: 'image/svg+xml' });
		expect((await call({ alt: 'x', file: svg })).status).toBe(415);
	});

	it('stores a sanitised svg and derives the extension from the mime', async () => {
		const svg = new File(
			['<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>1</script><circle r="1"/></svg>'],
			'Logo.png',
			{ type: 'image/svg+xml' }
		);
		const res = await call({ alt: 'x', file: svg });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.repoPath).toBe('docs/afbeeldingen/foo/logo.svg');
		const text = Buffer.from(body.base64, 'base64').toString();
		expect(text).toContain('<circle');
		expect(text).not.toMatch(/script|onload/);
	});
});

describe('sanitizeSvg hardening', () => {
	it('strips javascript: hrefs, foreignObject, style and use', () => {
		const out = sanitizeSvg(
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a href="javascript:alert(1)"><circle r="1"/></a><a xlink:href="javascript:alert(2)"><rect/></a><foreignObject><div>x</div></foreignObject><style>*{fill:red}</style><use href="http://evil/x.svg#a"/></svg>'
		);
		expect(out).not.toMatch(/javascript|foreignObject|<style|<use|evil/i);
		expect(out).toContain('<circle');
	});
});

describe('imagePath containment', () => {
	it('rejects a page path whose slug escapes the image base', () => {
		expect(() => imagePath(digi, 'docs/../x.md', 'a.png')).toThrow(ImageError);
	});
});

describe('SVG hardening', () => {
	it('drops external references and keeps internal ones', () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
			'<image href="https://tracker.example/p.png"/><a xlink:href="https://evil.example"><rect/></a>' +
			'<linearGradient id="g"/><rect fill="url(#g)"/><a href="#g"><rect/></a></svg>';
		const clean = sanitizeSvg(svg);
		expect(clean).not.toContain('tracker.example');
		expect(clean).not.toContain('evil.example');
		expect(clean).toContain('href="#g"');
	});

	it('refuses an SVG over 1 MB', () => {
		const big = new TextEncoder().encode('<svg>' + ' '.repeat(1024 * 1024) + '</svg>');
		expect(validateImage(big, 'image/svg+xml')).toMatchObject({ ok: false, status: 413 });
	});
});
