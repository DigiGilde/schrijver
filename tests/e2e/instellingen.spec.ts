import { expect, test } from '@playwright/test';

test('settings: the save button is ready after loading and saves the choice', async ({ page }) => {
	await page.goto('/instellingen');
	await page.evaluate(() => customElements.whenDefined('nldd-button'));
	const knop = page.locator('nldd-button[text="Opslaan"]');
	await expect(knop).not.toHaveAttribute('loading');
	await page.getByRole('radio', { name: /^Op naam/ }).click();
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByText('Instellingen opgeslagen').first()).toBeVisible();
	await page.getByRole('radio', { name: /^Anoniem/ }).click();
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByRole('radio', { name: /^Anoniem/ })).toBeChecked();
});

test('onboarding: saving the choice leads to the start page', async ({ page }) => {
	await page.goto('/onboarding');
	await page.evaluate(() => customElements.whenDefined('nldd-button'));
	await expect(page.locator('nldd-button[text="Opslaan"]')).not.toHaveAttribute('loading');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { name: 'Kies een site' })).toBeVisible();
});
