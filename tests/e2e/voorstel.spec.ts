import { expect, test } from '@playwright/test';

test('sends in, approves and merges the seeded draft proposal', async ({ page }) => {
	await page.goto('/sites/digi-handboek?tab=alle');
	await page.getByRole('link', { name: /Bekijken Voorbeeldvoorstel Digi Handboek/ }).click();
	await expect(page.getByRole('heading', { name: 'Voorbeeldvoorstel Digi Handboek' })).toBeVisible();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Concept');
	await expect(page.locator('nldd-rich-text').filter({ hasText: 'Aanvulling.' })).toBeVisible();

	await expect(page.getByRole('region', { name: 'Huidige versie' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Voorgestelde versie' })).toBeVisible();

	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Ingestuurd');

	await page.getByRole('button', { name: 'Goedkeuren' }).click();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Goedgekeurd');

	await page.getByRole('button', { name: 'Samenvoegen' }).click();
	await expect(page.locator('nldd-badge')).toHaveAttribute('text', 'Samengevoegd');
});
