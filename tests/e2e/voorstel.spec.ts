import { expect, test } from '@playwright/test';

test('sends in, approves and merges the seeded draft proposal', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nVoorstel door e2e');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await page.getByRole('link', { name: 'Bekijk voorstel' }).click();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Concept');
	await expect(page.locator('nldd-rich-text').filter({ hasText: 'Voorstel door e2e' })).toBeVisible();

	await expect(page.getByRole('region', { name: 'Huidige versie' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Voorgestelde versie' })).toBeVisible();

	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Ingestuurd');

	await page.getByRole('button', { name: 'Goedkeuren' }).click();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Goedgekeurd');

	await page.getByRole('button', { name: 'Samenvoegen' }).click();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Samengevoegd');
});
