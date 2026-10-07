import { expect, test } from '@playwright/test';

const url = '/sites/digi-handboek/bewerken/index.md';
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

test('inserts an image with alt text and sends it along on save', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');

	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await dialog.locator('input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
	await expect(dialog.getByText('pixel.png (1 kB)')).toBeVisible();

	const invoegen = dialog.getByRole('button', { name: 'Invoegen' });
	await expect(invoegen).toBeDisabled();
	await dialog.getByLabel('Alt-tekst').fill('Een pixel');
	await expect(invoegen).toBeEnabled();
	await invoegen.click();

	await expect(editor).toContainText('![Een pixel](');
	await expect(page.getByText('Afbeeldingen worden meegestuurd bij het bewaren')).toBeVisible();

	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.images).toHaveLength(1);
	expect(sent.images[0].path).toMatch(/^docs\/afbeeldingen\/.+pixel\.png$/);
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/)).toBeVisible();
	await expect(page.getByText('Afbeeldingen worden meegestuurd bij het bewaren')).toHaveCount(0);
});

test('shows a server error inside the dialog and closes on Escape', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await dialog
		.locator('input[type=file]')
		.setInputFiles({ name: 'nep.png', mimeType: 'image/png', buffer: Buffer.from('geen afbeelding') });
	await dialog.getByLabel('Alt-tekst').fill('Nep');
	await dialog.getByRole('button', { name: 'Invoegen' }).click();
	await expect(dialog.getByRole('alert')).toContainText('bestandstype');
	await page.keyboard.press('Escape');
	await expect(dialog).not.toHaveAttribute('open', /.*/);
	await expect(page.getByRole('button', { name: 'Afbeelding invoegen' })).toBeFocused();
});

test('inserts a Mermaid scaffold and blocks saving without a description', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.getByRole('button', { name: 'Mermaid-diagram invoegen' }).click();
	await expect
		.poll(() => page.evaluate(() => (document.querySelector('nldd-text-editor') as unknown as { value: string }).value))
		.toContain('accDescr');

	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('```mermaid\nflowchart LR\n  A --> B\n```');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await expect(page.getByRole('alert').filter({ hasText: 'accDescr' })).toContainText('regel 1');
});

test('applies an assistant suggestion to the selection', async ({ page }) => {
	await page.route('**/api/assistent', (route) =>
		route.fulfill({
			json: { replacement: 'Kort en krachtig.', explanation: 'Ingekort.' }
		})
	);
	await page.goto(url);
	await expect(page.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
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
});

const pickPng = async (page: import('@playwright/test').Page, alt: string) => {
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await dialog.locator('input[type=file]').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
	await dialog.getByLabel('Alt-tekst').fill(alt);
	await dialog.getByRole('button', { name: 'Invoegen' }).click();
	await expect(dialog).not.toHaveAttribute('open', /.*/);
};

test('opens the dialog with an empty file picker the second time', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
	await pickPng(page, 'Eerste');
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await expect(dialog.getByText('pixel.png')).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: 'Invoegen' })).toBeDisabled();
});

test('keeps pending images with the draft across a reload', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
	await pickPng(page, 'Bewaard');
	await expect.poll(() => page.evaluate(() => localStorage.getItem('schrijver:digi-handboek:new:index.md'))).toContain('"images":[{');

	await page.reload();
	await page.getByRole('button', { name: 'Herstellen' }).click();
	await expect(page.getByText('Afbeeldingen worden meegestuurd bij het bewaren')).toBeVisible();

	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.images).toHaveLength(1);
	expect(sent.body).toContain('![Bewaard](');
});
