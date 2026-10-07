import { expect, test } from '@playwright/test';

const url = '/sites/digi-handboek/bewerken/index.md';
const key = 'schrijver:digi-handboek:new:index.md';

test('opens a file, previews it, follows edits and offers to restore a draft', async ({ page }) => {
	await page.goto(url);

	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('Het Digi Handboek');
	await expect(page.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
	await expect(page.getByText('Openbaar concept').first()).toBeVisible();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toHaveCount(0);

	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\n## Nieuwe kop uit e2e');
	await expect(page.locator('nldd-rich-text h2', { hasText: 'Nieuwe kop uit e2e' })).toBeVisible();

	await expect
		.poll(() => page.evaluate((k) => localStorage.getItem(k), key))
		.toContain('Nieuwe kop uit e2e');

	await page.reload();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toBeVisible();
	await page.getByRole('button', { name: 'Herstellen' }).click();
	await expect(page.locator('nldd-rich-text h2', { hasText: 'Nieuwe kop uit e2e' })).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: 'Weggooien' }).click();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toHaveCount(0);
	await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
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
	await expect(page.locator('nldd-rich-text strong', { hasText: 'dikgedrukt' })).toBeVisible();
});
