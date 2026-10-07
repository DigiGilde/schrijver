import { expect, test } from '@playwright/test';

test('saves an edit as a draft proposal and keeps the branch on reload', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nOpgeslagen door e2e');

	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Opslaan' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('button', { name: 'Opslaan' })).toBeVisible();
	await expect(page.locator('nldd-rich-text')).toContainText('Opgeslagen door e2e');

	await page.goto('/sites/digi-handboek?tab=alle');
	await expect(page.getByText('Het Digi Handboek').first()).toBeVisible();
});

test('warns when a stored draft is based on an older version', async ({ page }) => {
	const key = 'schrijver:digi-handboek:new:index.md';
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.evaluate((k) => {
		localStorage.setItem(
			k,
			JSON.stringify({ path: 'index.md', body: 'Oud concept', frontmatter: {}, at: 1, sha: 'oud' })
		);
	}, key);
	await page.reload();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toBeVisible();
	await expect(page.getByText(/gebaseerd op een oudere versie/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Herstellen' })).toBeVisible();
	await page.getByRole('button', { name: 'Weggooien' }).click();
});

test('flushes the last keystrokes when the page is hidden', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('laatste woorden');
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	const stored = await page.evaluate(() => localStorage.getItem('schrijver:digi-handboek:new:index.md'));
	expect(stored).toContain('laatste woorden');
	expect(stored).toContain('"sha"');
});
