import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
	setConfigStore({ site: (id: string) => sites.find((s) => s.id === id) } as never);

	function call(opts: { alt?: string; user?: boolean; header?: boolean }) {
		const form = new FormData();
		form.set('bestand', new File([PNG], 'Foto.png', { type: 'image/png' }));
		form.set('pagina', 'docs/kennis/foo.md');
		if (opts.alt !== undefined) form.set('alt', opts.alt);
		const headers: Record<string, string> = {};
		if (opts.header !== false) headers['X-Requested-With'] = 'Schrijver';
		const request = new Request('http://localhost/api/sites/digi-handboek/afbeelding', {
			method: 'POST',
			body: form,
			headers
		});
		return POST({
			request,
			params: { site: 'digi-handboek' },
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
});
