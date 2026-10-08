import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const url = '/sites/digi-handboek/bewerken/index.md';
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

/* A first visit shows the public-draft coach mark on the save button; editor.spec.ts covers it. */
test.beforeEach(({ page }) =>
	page.addInitScript(() => {
		for (const site of ['digi-handboek', 'moza-site'])
			localStorage.setItem(`schrijver:${site}:openbaar-uitgelegd`, '1');
	})
);

test('inserts an image with alt text and sends it along on save', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');

	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await dialog
		.locator('input[type=file]')
		.setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
	await expect(dialog.getByText('pixel.png (1 kB)')).toBeVisible();

	const invoegen = dialog.getByRole('button', { name: 'Invoegen' });
	await invoegen.click();
	await expect(dialog.getByText('Vul een alt-tekst in').first()).toBeVisible();
	await expect(dialog.getByLabel('Alt-tekst')).toBeFocused();
	await dialog.getByLabel('Alt-tekst').fill('Een pixel');
	await invoegen.click();

	await expect(editor).toContainText('![Een pixel](');
	await expect(page.getByText('Afbeeldingen worden meegestuurd bij het bewaren')).toBeVisible();
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	const plaatje = page.locator('nldd-rich-text img[alt="Een pixel"]');
	await expect(plaatje).toHaveAttribute('src', /^data:image\/png;base64,/);

	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.images).toHaveLength(1);
	expect(sent.images[0].path).toMatch(/^docs\/afbeeldingen\/.+pixel\.png$/);
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(page.getByText('Afbeeldingen worden meegestuurd bij het bewaren')).toHaveCount(0);

	// Once saved, the preview loads the image from the proposal branch.
	await expect(plaatje).toHaveAttribute(
		'src',
		/^\/api\/sites\/digi-handboek\/bestand\?pad=docs%2F.+pixel\.png&ref=schrijver%2F/
	);
	await expect
		.poll(() => plaatje.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
		.toBe(1);
});

test('shows a server error inside the dialog and closes on Escape', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await dialog.locator('input[type=file]').setInputFiles({
		name: 'nep.png',
		mimeType: 'image/png',
		buffer: Buffer.from('geen afbeelding')
	});
	await dialog.getByLabel('Alt-tekst').fill('Nep');
	await dialog.getByRole('button', { name: 'Invoegen' }).click();
	await expect(dialog.getByRole('alert')).toContainText('bestandstype');
	await page.keyboard.press('Escape');
	await expect(dialog).not.toHaveAttribute('open', /.*/);
	await expect(page.getByRole('button', { name: 'Afbeelding invoegen' })).toBeFocused();
});

test('inserts a Mermaid scaffold and blocks saving without a description', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.getByRole('button', { name: 'Mermaid-diagram invoegen' }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() => (document.querySelector('nldd-text-editor') as unknown as { value: string }).value
			)
		)
		.toContain('accDescr');

	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('```mermaid\nflowchart LR\n  A --> B\n```');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const melding = page.getByRole('alert').filter({ hasText: 'accDescr' });
	await expect(melding).toContainText('regel 1');
	await expect(melding).toHaveAttribute('variant', 'critical');
	await expect(page.locator('.foutmelding')).toBeFocused();
});

test('applies an assistant suggestion to the selection', async ({ page }) => {
	await page.route('**/api/assistent', (route) =>
		route.fulfill({
			json: { replacement: 'Kort en krachtig.', explanation: 'Ingekort.' }
		})
	);
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+a');

	const knop = page.getByRole('button', { name: 'Schrijfhulp' });
	await knop.click();
	await expect(knop).toHaveAttribute('aria-expanded', 'true');
	await page.getByRole('button', { name: 'Korter' }).click();
	await page.getByRole('button', { name: 'Overnemen' }).click();
	await expect(editor).toContainText('Kort en krachtig.');
	await expect(editor).not.toContainText('Het Digi Handboek');
	await expect(editor).toBeFocused();

	await page.keyboard.press('ControlOrMeta+a');
	await page.getByRole('button', { name: 'Korter' }).click();
	await page.getByRole('button', { name: 'Verwerpen' }).click();
	await expect(editor).toBeFocused();
});

test('writes a summary into the description field and leaves the text alone', async ({ page }) => {
	await page.route('**/api/assistent', (route) =>
		route.fulfill({
			json: { replacement: 'Een korte samenvatting.', explanation: 'Samengevat.' }
		})
	);
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	const editor = page.locator('nldd-text-editor .cm-content');
	await page.getByRole('button', { name: 'Schrijfhulp' }).click();
	await page.getByRole('button', { name: 'Samenvatting', exact: true }).click();
	await expect(page.getByText('Een korte samenvatting.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Overnemen' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Gebruik als samenvatting' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Samenvatting ingevuld bij Eigenschappen' })
	).toBeVisible();
	await expect(editor).toContainText('Het Digi Handboek');
	await expect(editor).not.toContainText('Een korte samenvatting.');

	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await expect(page.getByRole('textbox', { name: 'Samenvatting' })).toHaveValue(
		'Een korte samenvatting.'
	);
});

const pickPng = async (page: import('@playwright/test').Page, alt: string) => {
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await dialog
		.locator('input[type=file]')
		.setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
	await dialog.getByLabel('Alt-tekst').fill(alt);
	await dialog.getByRole('button', { name: 'Invoegen' }).click();
	await expect(dialog).not.toHaveAttribute('open', /.*/);
};

test('opens the dialog with an empty file picker the second time', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	await pickPng(page, 'Eerste');
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await expect(dialog.getByText('pixel.png')).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Invoegen' }).click();
	await expect(dialog.getByText('Kies eerst een afbeelding').first()).toBeVisible();
});

test('keeps pending images with the draft across a reload', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	await pickPng(page, 'Bewaard');
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('schrijver:digi-handboek:new:index.md')))
		.toContain('"images":[{');

	await page.reload();
	await page.getByRole('button', { name: 'Herstellen' }).click();
	await expect(page.getByText('Afbeeldingen worden meegestuurd bij het bewaren')).toBeVisible();

	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.images).toHaveLength(1);
	expect(sent.body).toContain('![Bewaard](');
});

/** Smooth colour with a little noise: a big PNG file that comes out far smaller once shrunk. */
function photoPng(width: number, height: number, transparent = false): Buffer {
	const channels = transparent ? 4 : 3;
	const stride = width * channels;
	const scanlines = Buffer.alloc((stride + 1) * height);
	const row = new Uint8Array(stride);
	let seed = 12345;
	const noise = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return ((seed >>> 24) % 3) - 1;
	};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const at = x * channels;
			row[at] = 128 + 100 * Math.sin(x / 180) * Math.cos(y / 220) + noise();
			row[at + 1] = 128 + 90 * Math.sin((x + y) / 260) + noise();
			row[at + 2] = 128 + 80 * Math.cos(x / 300 - y / 170) + noise();
			if (transparent) row[at + 3] = x < width / 4 ? 0 : 255;
		}
		const line = y * (stride + 1);
		scanlines[line] = 1; // filter type Sub
		for (let i = 0; i < stride; i++) {
			scanlines[line + 1 + i] = row[i] - (i >= channels ? row[i - channels] : 0);
		}
	}
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = transparent ? 6 : 2;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(scanlines)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

let largePng: Buffer | undefined;
const large = () => (largePng ??= photoPng(2400, 1600));
let transparentPng: Buffer | undefined;
const transparentLarge = () => (transparentPng ??= photoPng(2300, 900, true));

/** A JPEG stored 2400 x 1600, red left and blue right, with the EXIF orientation "rotate clockwise". */
async function rotatedJpeg(page: Page): Promise<Buffer> {
	const base64 = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 2400;
		canvas.height = 1600;
		const context = canvas.getContext('2d')!;
		context.fillStyle = '#e00';
		context.fillRect(0, 0, 1200, 1600);
		context.fillStyle = '#00e';
		context.fillRect(1200, 0, 1200, 1600);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.9)
		);
		let binary = '';
		for (const byte of new Uint8Array(await blob!.arrayBuffer()))
			binary += String.fromCharCode(byte);
		return btoa(binary);
	});
	const jpeg = Buffer.from(base64, 'base64');
	const exif = Buffer.concat([
		Buffer.from('Exif\0\0', 'latin1'),
		Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8]),
		Buffer.from([0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0])
	]);
	const length = Buffer.alloc(2);
	length.writeUInt16BE(exif.length + 2);
	return Buffer.concat([
		jpeg.subarray(0, 2),
		Buffer.from([0xff, 0xe1]),
		length,
		exif,
		jpeg.subarray(2)
	]);
}

/** 52° 5' 28.29" north as three big-endian rationals. */
const LATITUDE = Buffer.from('00000034000000010000000500000001' + '00000b0d00000064', 'hex');

/** The rotated photo as a phone stores it: EXIF with the camera and a location, XMP, a comment. */
async function phonePhoto(page: Page): Promise<Buffer> {
	const exif = Buffer.from(
		[
			'457869660000', // Exif\0\0
			'4d4d002a00000008', // big-endian TIFF, IFD0 at 8
			'0003', // three entries
			'010f000200000004' + '43616d00', // Make "Cam"
			'0112000300000001' + '00060000', // Orientation 6
			'8825000400000001' + '00000032', // GPS IFD at 50
			'00000000',
			'0002', // two GPS entries
			'0001000200000002' + '4e000000', // GPSLatitudeRef "N"
			'0002000500000003' + '00000050', // GPSLatitude at 80
			'00000000',
			LATITUDE.toString('hex')
		].join(''),
		'hex'
	);
	const segment = (marker: number, payload: Buffer) => {
		const length = Buffer.alloc(2);
		length.writeUInt16BE(payload.length + 2);
		return Buffer.concat([Buffer.from([0xff, marker]), length, payload]);
	};
	const xmp = 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Jan Jansen</x:xmpmeta>';
	const jpeg = await rotatedJpeg(page);
	return Buffer.concat([
		jpeg.subarray(0, 2),
		segment(0xe1, exif),
		segment(0xe1, Buffer.from(xmp, 'latin1')),
		segment(0xfe, Buffer.from('Gemaakt in Utrecht', 'latin1')),
		jpeg.subarray(2)
	]);
}

async function openDialog(page: Page) {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	return page.locator('nldd-modal-dialog');
}

const choose = (dialog: Locator, name: string, mimeType: string, buffer: Buffer) =>
	dialog.locator('input[type=file]').setInputFiles({ name, mimeType, buffer });

const option = (dialog: Locator) => dialog.getByRole('checkbox', { name: 'Verklein voor het web' });
const numbers = (dialog: Locator) => dialog.getByText(/^Van \d/);
const computingText = (dialog: Locator) =>
	dialog.getByText('Bezig met berekenen of de afbeelding kleiner kan...', { exact: true });

/** The description Chromium computes for a checkbox; Playwright's own only follows aria-describedby ids. */
async function describedBy(page: Page, name: string) {
	const client = await page.context().newCDPSession(page);
	const { nodes } = await client.send('Accessibility.getFullAXTree');
	await client.detach();
	return nodes.find((node) => node.role?.value === 'checkbox' && node.name?.value === name)
		?.description?.value;
}

const uploadUrl = '**/api/sites/digi-handboek/afbeelding';

/** Fills the alt text, optionally ticks the option, inserts, and reports what went over the wire. */
async function insert(page: Page, dialog: Locator, shrink: boolean) {
	// Only a route handler gets to see the multipart body.
	let body = '';
	await page.route(uploadUrl, async (route) => {
		body = route.request().postDataBuffer()?.toString('latin1') ?? '';
		await route.continue();
	});
	if (shrink) await option(dialog).check();
	await dialog.getByLabel('Alt-tekst').fill('Een foto');
	const response = page.waitForResponse(uploadUrl);
	await dialog.getByRole('button', { name: 'Invoegen' }).click();
	const data = (await (await response).json()) as {
		repoPath: string;
		markdownRef: string;
		base64: string;
		mime: string;
	};
	const part = /name="bestand"; filename="([^"]*)"\r\nContent-Type: ([^\r]*)/.exec(body);
	return { filename: part?.[1], type: part?.[2], data, bytes: Buffer.from(data.base64, 'base64') };
}

type ImageWork = { decoded: number; encoded: number; release: () => void };

/**
 * Counts the decodes that finished and the canvas encodes started. With `hold`, a decode waits until
 * releaseDecoding(), so the computing state can be looked at for as long as needed.
 */
async function watchImageWork(page: Page, hold = false) {
	await page.addInitScript((hold) => {
		const work = Object.assign(window, { decoded: 0, encoded: 0, release: () => {} });
		const gate = hold ? new Promise<void>((resolve) => (work.release = resolve)) : undefined;
		const decode = window.createImageBitmap.bind(window) as (
			...args: unknown[]
		) => Promise<ImageBitmap>;
		window.createImageBitmap = (async (...args: unknown[]) => {
			await gate;
			try {
				return await decode(...args);
			} finally {
				work.decoded++;
			}
		}) as typeof window.createImageBitmap;
		const toBlob = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = function (...args) {
			work.encoded++;
			return toBlob.apply(this, args);
		};
	}, hold);
}

const releaseDecoding = (page: Page) =>
	page.evaluate(() => (window as unknown as ImageWork).release());

const imageWork = (page: Page) =>
	page.evaluate(() => {
		const { decoded, encoded } = window as unknown as ImageWork;
		return { decoded, encoded };
	});

/** Like Safari: a canvas answers a request for WebP with a PNG. */
const withoutWebp = (page: Page) =>
	page.addInitScript(() => {
		const toBlob = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
			return toBlob.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality);
		};
	});

test('offers to shrink a large image, unticked, with the real numbers', async ({ page }) => {
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());

	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
	await expect(option(dialog)).not.toBeChecked();
	const original = (large().length / 1024 / 1024).toFixed(1).replace('.', ',');
	await expect(numbers(dialog)).toHaveText(
		new RegExp(
			`^Van ${original} MB, 2400 × 1600 pixels, naar \\d+ kB, 2000 × 1333 pixels\\. De pagina laadt sneller\\.\\s*$`
		)
	);
	await expect
		.poll(() => describedBy(page, 'Verklein voor het web'))
		.toMatch(/^Van .* De pagina laadt sneller\.$/);
});

test('sends the original when the option stays unticked', async ({ page }) => {
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });

	const sent = await insert(page, dialog, false);
	expect(sent.filename).toBe('foto.png');
	expect(sent.type).toBe('image/png');
	expect(sent.data.mime).toBe('image/png');
	expect(sent.data.repoPath).toMatch(/foto\.png$/);
	expect(sent.bytes.equals(large())).toBe(true);
});

test('sends the smaller version, named with the new extension, once ticked', async ({ page }) => {
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
	const promised = await numbers(dialog).textContent();

	const sent = await insert(page, dialog, true);
	expect(sent.filename).toBe('foto.webp');
	expect(sent.type).toBe('image/webp');
	expect(sent.data.mime).toBe('image/webp');
	expect(sent.data.repoPath).toMatch(/foto\.webp$/);
	expect(sent.bytes.length).toBeLessThan(large().length);
	expect(sent.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
	expect(promised).toContain(`naar ${Math.round(sent.bytes.length / 1024)} kB, 2000 × 1333 pixels`);
	const size = await page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
		return [bitmap.width, bitmap.height];
	}, sent.data.base64);
	expect(size).toEqual([2000, 1333]);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText(
		/!\[Een foto\]\(.*foto\.webp\)/
	);
});

test('ticks the option with the keyboard and inserts with Enter', async ({ page }) => {
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });

	await dialog.getByLabel('Alt-tekst').focus();
	await page.keyboard.type('Een foto');
	await page.keyboard.press('Shift+Tab');
	await expect(option(dialog)).toBeFocused();
	await page.keyboard.press('Space');
	await expect(option(dialog)).toBeChecked();
	await page.keyboard.press('Tab');
	await expect(dialog.getByLabel('Alt-tekst')).toBeFocused();

	const response = page.waitForResponse(uploadUrl);
	await page.keyboard.press('Enter');
	expect((await (await response).json()).mime).toBe('image/webp');
});

test('offers nothing for a small image', async ({ page }) => {
	await watchImageWork(page);
	const dialog = await openDialog(page);
	await choose(dialog, 'pixel.png', 'image/png', PNG);
	await expect(dialog.getByText('pixel.png (1 kB)')).toBeVisible();
	await expect.poll(async () => (await imageWork(page)).decoded).toBe(1);

	expect((await imageWork(page)).encoded).toBe(0);
	await expect(option(dialog)).toHaveCount(0);
	await expect(computingText(dialog)).toHaveCount(0);
	await expect(numbers(dialog)).toHaveCount(0);
});

test('offers nothing for an SVG', async ({ page }) => {
	await watchImageWork(page);
	const dialog = await openDialog(page);
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"></svg>';
	await choose(dialog, 'schema.svg', 'image/svg+xml', Buffer.from(svg));
	await expect(dialog.getByText('schema.svg (1 kB)')).toBeVisible();

	await expect(option(dialog)).toHaveCount(0);
	await expect(computingText(dialog)).toHaveCount(0);
	expect(await imageWork(page)).toEqual({ decoded: 0, encoded: 0 });
});

test('offers nothing when the smaller version would not be smaller', async ({ page }) => {
	await watchImageWork(page, true);
	await page.addInitScript(() => {
		HTMLCanvasElement.prototype.toBlob = function (callback, type) {
			callback(new Blob([new Uint8Array(6 * 1024 * 1024)], { type }));
		};
	});
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());
	await expect(computingText(dialog)).toBeVisible();
	await releaseDecoding(page);
	await expect(computingText(dialog)).toHaveCount(0, { timeout: 15_000 });

	await expect(option(dialog)).toHaveCount(0);
	await expect(numbers(dialog)).toHaveCount(0);
});

test('drops the offer and the choice when another file is chosen', async ({ page }) => {
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());
	await option(dialog).check();
	await expect(option(dialog)).toBeChecked();

	await choose(dialog, 'pixel.png', 'image/png', PNG);
	await expect(dialog.getByText('pixel.png (1 kB)')).toBeVisible();
	await expect(option(dialog)).toHaveCount(0);

	await choose(dialog, 'foto.png', 'image/png', large());
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
	await expect(option(dialog)).not.toBeChecked();
});

test('starts unticked again when the dialog opens the next time', async ({ page }) => {
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());
	await insert(page, dialog, true);
	await expect(dialog).not.toHaveAttribute('open', /.*/);

	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	await choose(dialog, 'foto.png', 'image/png', large());
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
	await expect(option(dialog)).not.toBeChecked();
});

test('says so while the smaller version is being computed', async ({ page }) => {
	await watchImageWork(page, true);
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());

	const computing = computingText(dialog);
	await expect(computing).toBeVisible();
	await expect(option(dialog)).toHaveCount(0);
	await expect(dialog.getByRole('status').filter({ hasText: 'Bezig met berekenen' })).toHaveCount(
		1
	);

	await releaseDecoding(page);
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
	await expect(computing).toHaveCount(0);
	await expect(
		dialog.getByRole('status').filter({ hasText: 'Je kunt de afbeelding verkleinen' })
	).toHaveCount(1);
});

test('offers to shrink a pasted screenshot', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	await page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const clipboardData = new DataTransfer();
		clipboardData.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
		document
			.querySelector('nldd-text-editor')!
			.dispatchEvent(
				new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
			);
	}, large().toString('base64'));

	const dialog = page.locator('nldd-modal-dialog');
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
	const sent = await insert(page, dialog, true);
	expect(sent.filename).toBe('image.webp');
	expect(sent.data.mime).toBe('image/webp');
});

test('falls back to JPEG when the browser cannot encode WebP', async ({ page }) => {
	await withoutWebp(page);
	const dialog = await openDialog(page);
	await choose(dialog, 'foto.png', 'image/png', large());
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });

	const sent = await insert(page, dialog, true);
	expect(sent.filename).toBe('foto.jpg');
	expect(sent.type).toBe('image/jpeg');
	expect(sent.data.mime).toBe('image/jpeg');
	expect(sent.data.repoPath).toMatch(/foto\.jpg$/);
	expect(sent.bytes.length).toBeLessThan(large().length);
});

test('keeps PNG for transparency when the browser cannot encode WebP', async ({ page }) => {
	await withoutWebp(page);
	const dialog = await openDialog(page);
	await choose(dialog, 'logo.png', 'image/png', transparentLarge());
	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });

	const sent = await insert(page, dialog, true);
	expect(sent.filename).toBe('logo.png');
	expect(sent.data.mime).toBe('image/png');
	expect(sent.bytes.length).toBeLessThan(transparentLarge().length);
	const transparent = await page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(bitmap, 0, 0);
		return context.getImageData(5, 5, 1, 1).data[3];
	}, sent.data.base64);
	expect(transparent).toBe(0);
});

test('keeps a rotated photo upright and reports the size as it is shown', async ({ page }) => {
	const dialog = await openDialog(page);
	await choose(dialog, 'portret.jpg', 'image/jpeg', await rotatedJpeg(page));

	await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
	await expect(numbers(dialog)).toHaveText(
		/^Van .*, 1600 × 2400 pixels, naar \d+ kB, 1333 × 2000 pixels\./
	);

	const sent = await insert(page, dialog, true);
	expect(sent.filename).toBe('portret.webp');
	const shown = await page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(bitmap, 0, 0);
		const at = (y: number) =>
			Array.from(context.getImageData(bitmap.width / 2, y, 1, 1).data.slice(0, 3));
		return {
			size: [bitmap.width, bitmap.height],
			top: at(bitmap.height / 4),
			bottom: at(bitmap.height * 0.75)
		};
	}, sent.data.base64);
	expect(shown.size).toEqual([1333, 2000]);
	expect(shown.top[0]).toBeGreaterThan(180);
	expect(shown.top[2]).toBeLessThan(80);
	expect(shown.bottom[2]).toBeGreaterThan(180);
	expect(shown.bottom[0]).toBeLessThan(80);
});

test('takes the photo metadata out of the original and keeps it upright', async ({ page }) => {
	const dialog = await openDialog(page);
	const photo = await phonePhoto(page);
	await choose(dialog, 'telefoon.jpg', 'image/jpeg', photo);
	await expect(
		dialog.getByText(
			'Schrijver haalt fotogegevens zoals locatie en camera altijd uit de afbeelding.'
		)
	).toBeVisible();

	const sent = await insert(page, dialog, false);
	expect(sent.type).toBe('image/jpeg');
	for (const trace of [LATITUDE, Buffer.from('xmpmeta'), Buffer.from('Utrecht')]) {
		expect(photo.includes(trace)).toBe(true);
		expect(sent.bytes.includes(trace)).toBe(false);
	}
	const imageData = (jpeg: Buffer) => jpeg.subarray(jpeg.indexOf(Buffer.from([0xff, 0xdb])));
	expect(imageData(sent.bytes).equals(imageData(photo))).toBe(true);

	const shown = await page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d')!;
		context.drawImage(bitmap, 0, 0);
		const red = (y: number) => context.getImageData(bitmap.width / 2, y, 1, 1).data[0];
		return {
			size: [bitmap.width, bitmap.height],
			top: red(bitmap.height / 4),
			bottom: red(bitmap.height * 0.75)
		};
	}, sent.data.base64);
	expect(shown.size).toEqual([1600, 2400]);
	expect(shown.top).toBeGreaterThan(180);
	expect(shown.bottom).toBeLessThan(80);
});

for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`dialog with the shrink option, ${colorScheme} mode`, () => {
		test.use({ colorScheme });

		test('has no axe violations while computing and with the option', async ({ page }) => {
			const noViolations = async () => {
				const result = await new AxeBuilder({ page })
					.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
					.analyze();
				expect(result.violations, JSON.stringify(result.violations, null, 1)).toEqual([]);
			};
			await watchImageWork(page, true);
			const dialog = await openDialog(page);
			await choose(dialog, 'foto.png', 'image/png', large());
			await expect(computingText(dialog)).toBeVisible();
			await noViolations();

			await releaseDecoding(page);
			await expect(option(dialog)).toBeVisible({ timeout: 15_000 });
			await option(dialog).check();
			await noViolations();
		});
	});
}
