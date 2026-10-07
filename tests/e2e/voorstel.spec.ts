import { expect, test } from '@playwright/test';

test('sends in, comments and merges a draft proposal', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nVoorstel door e2e');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await page.getByRole('link', { name: 'Bekijk voorstel' }).click();
	await expect(page.locator('nldd-badge[text="Concept"]')).toBeVisible();
	await expect(page.getByRole('region', { name: /Huidige versie van/ })).toBeVisible();
	await expect(page.getByRole('region', { name: /Voorgestelde versie van/ })).toBeVisible();
	await expect(page.locator('nldd-rich-text').filter({ hasText: 'Voorstel door e2e' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Goedkeuren' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(page.locator('nldd-badge[text="Ingestuurd"]')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Beoordelen op GitHub' })).toBeVisible();

	await page.getByRole('textbox', { name: 'Opmerking' }).fill('Ziet er goed uit');
	await page.getByRole('button', { name: 'Opmerking plaatsen' }).click();
	await expect(page.getByText('Je opmerking is geplaatst')).toBeVisible();

	await page.getByRole('button', { name: 'Samenvoegen' }).click();
	await expect(page.locator('nldd-badge[text="Samengevoegd"]')).toBeVisible();
});
