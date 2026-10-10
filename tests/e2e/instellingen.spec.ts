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

test('settings: a platform admin finds every site under Beheer, and everyone their own sub', async ({
	page
}) => {
	await page.goto('/instellingen');
	await expect(page.getByRole('heading', { level: 2, name: 'Beheer' })).toBeVisible();
	await expect(
		page.getByText(
			'Je bent beheerder van Schrijver. Je beheert het team en de instellingen van elke site.'
		)
	).toBeVisible();
	const sites = page.locator('nldd-list[accessible-label="Sites die je beheert"]');
	await expect(sites.getByRole('link')).toHaveCount(2);
	await expect(sites.getByRole('link', { name: 'Digi Handboek' })).toBeVisible();
	await expect(page.getByText('Je kenmerk bij SSO Rijk: test')).toBeVisible();

	await sites.getByRole('link', { name: 'MijnOverheid Zakelijk' }).click();
	await expect(page).toHaveURL(/\/instellingen\/sites\/moza-site$/);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Beheer van MijnOverheid Zakelijk' })
	).toBeVisible();
	await page.getByRole('link', { name: 'Instellingen' }).first().click();
	await expect(page).toHaveURL(/\/instellingen$/);
});
