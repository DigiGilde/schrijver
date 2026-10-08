import { expect, test, type Page } from '@playwright/test';

const url = '/sites/digi-handboek/bewerken/index.md';
const key = 'schrijver:digi-handboek:new:index.md';

/** The whole text: the editor only renders the lines near the viewport. */
const editorValue = (page: Page) =>
	page.evaluate(
		() => (document.querySelector('nldd-text-editor') as unknown as { value: string }).value
	);

test('opens a file, follows edits and offers to restore a draft', async ({ page }) => {
	await page.goto(url);

	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('Het Digi Handboek');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Het Digi Handboek');
	await expect(page.getByText('docs/index.md · Openbaar concept').first()).toBeVisible();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toHaveCount(0);

	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\n## Nieuwe kop uit e2e');
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	await expect(page.locator('nldd-rich-text h2', { hasText: 'Nieuwe kop uit e2e' })).toBeVisible();

	await expect
		.poll(() => page.evaluate((k) => localStorage.getItem(k), key))
		.toContain('Nieuwe kop uit e2e');

	await page.reload();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toBeVisible();
	await page.getByRole('button', { name: 'Herstellen' }).click();
	await expect.poll(() => editorValue(page)).toContain('Nieuwe kop uit e2e');
	await expect(editor).toBeFocused();

	await page.reload();
	await page.getByRole('button', { name: 'Weggooien' }).click();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toHaveCount(0);
	await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

test('the page title follows the first heading as you type', async ({ page }) => {
	await page.goto(url);
	await page.locator('nldd-text-editor .cm-line', { hasText: '# Het Digi Handboek' }).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' bewerkt');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Het Digi Handboek bewerkt');
});

test('a page without a title of its own is called by its file name', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/kennis/index.md');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kennis');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('Alleen tekst, geen kop');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('index.md');
});

test('rejects path traversal and unknown files', async ({ request }) => {
	expect((await request.get('/sites/digi-handboek/bewerken/..%2f..%2fx.md')).status()).toBe(400);
	expect((await request.get('/sites/digi-handboek/bewerken/bestaat-niet.md')).status()).toBe(404);
});

test('toolbar buttons format through the editor', async ({ page }) => {
	await page.goto(url);
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.getByRole('button', { name: 'Vet' }).click();
	await page.keyboard.type('dikgedrukt');
	await expect(page.getByRole('button', { name: 'Vet' })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	await expect(page.locator('nldd-rich-text strong', { hasText: 'dikgedrukt' })).toBeVisible();
});

test.describe('one writing surface at 1280 px', () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test('shows no preview next to the editor', async ({ page }) => {
		await page.goto(url);
		const editor = page.locator('nldd-text-editor');
		await expect(editor).toBeVisible();
		await expect(page.getByRole('radio', { name: 'Schrijven' })).toBeChecked();
		await expect(page.getByRole('region', { name: 'Voorbeeld' })).toHaveCount(0);
		await expect(page.locator('nldd-rich-text')).toHaveCount(0);
		const box = await editor.boundingBox();
		const column = await page.locator('nldd-toolbar[label="Opmaak"]').boundingBox();
		expect(box!.width).toBeGreaterThan(column!.width - 2);
	});

	test('Voorbeeld shows the rendered page, Schrijven brings back the typed text', async ({
		page
	}) => {
		await page.goto(url);
		const editor = page.locator('nldd-text-editor .cm-content');
		await editor.click();
		await page.keyboard.press('ControlOrMeta+End');
		await page.keyboard.type('\n\nGetypt voor het voorbeeld');

		await page.getByRole('radio', { name: 'Voorbeeld' }).click();
		const voorbeeld = page.getByRole('region', { name: 'Voorbeeld' });
		await expect(voorbeeld.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
		await expect(voorbeeld).toContainText('Getypt voor het voorbeeld');
		await expect(editor).toBeHidden();
		await expect(page.getByRole('button', { name: 'Vet' })).toHaveCount(0);

		await page.getByRole('radio', { name: 'Schrijven' }).click();
		await expect(voorbeeld).toHaveCount(0);
		await expect(editor).toBeVisible();
		expect(await editorValue(page)).toContain('Getypt voor het voorbeeld');
		// The undo history survived the preview: the editor was hidden, not rebuilt.
		await editor.focus();
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(() => editorValue(page)).not.toContain('Getypt voor het voorbeeld');
	});

	test('the save button stays in view at the end of a long page', async ({ page }) => {
		await page.goto(url);
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		const height = await page.evaluate(() => document.documentElement.scrollHeight);
		expect(height, 'the page is longer than the window').toBeGreaterThan(1800);
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		await expect(page.getByRole('button', { name: 'Concept bewaren' })).toBeInViewport();
		await page.getByRole('button', { name: 'Concept bewaren' }).click();
		await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	});
});

test('the properties sheet opens from the toolbar and its values are saved', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Samenvatting' })).toBeHidden();

	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeVisible();
	// The content is slotted into the dialog, so it is found from the sheet element.
	const sheet = page.locator('nldd-sheet');
	await expect(sheet.getByText('Deze waarden worden met de pagina bewaard.')).toBeVisible();
	await sheet.getByRole('textbox', { name: 'Samenvatting' }).fill('Samenvatting uit de sheet');
	await sheet.getByRole('button', { name: 'Sluit' }).click();
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Eigenschappen' })).toBeFocused();

	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.frontmatter.description).toBe('Samenvatting uit de sheet');
	expect(sent.changedKeys).toContain('description');
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await expect(page.getByRole('textbox', { name: 'Samenvatting' })).toHaveValue(
		'Samenvatting uit de sheet'
	);
});

test('the properties sheet sits in the document root and leaves with the page', async ({
	page
}) => {
	await page.goto(url);
	await expect
		.poll(() => page.evaluate(() => document.querySelector('nldd-sheet')?.parentElement?.localName))
		.toBe('body');
	await page.getByRole('link', { name: 'Digi Handboek' }).first().click();
	await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
	await expect(
		page.locator('nldd-sheet', { has: page.locator('nldd-title[text="Eigenschappen"]') })
	).toHaveCount(0);
});

test('a save with a missing required field offers to open the properties', async ({ page }) => {
	await page.goto('/sites/moza-site/bewerken/contact.md');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();

	const melding = page.getByRole('alert').filter({ hasText: 'Controleer de gemarkeerde velden' });
	await expect(melding).toBeFocused();
	await melding.getByRole('button', { name: 'Eigenschappen aanpassen' }).click();

	const dialog = page.getByRole('dialog', { name: 'Eigenschappen' });
	await expect(dialog).toBeVisible();
	const sheet = page.locator('nldd-sheet');
	await expect(sheet.locator('nldd-text-field[invalid]')).toHaveCount(1);
	await expect(sheet.getByText('Dit veld is verplicht')).toBeVisible();

	await sheet.getByRole('textbox', { name: 'description' }).fill('Hoe je het team bereikt.');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
});

test('the title of a field-titled page follows the field', async ({ page }) => {
	await page.goto('/sites/moza-site/bewerken/contact.md');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact');
	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await page.getByRole('textbox', { name: 'title' }).fill('Contact met het team');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeHidden();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact met het team');
});
