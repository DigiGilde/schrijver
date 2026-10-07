import { expect, test } from '@playwright/test';

test('the home page lists both sites', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Kies een site' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Digi Handboek/ })).toHaveAttribute(
		'href',
		'/sites/digi-handboek'
	);
	await expect(page.getByRole('link', { name: /MOZa-site/ })).toHaveAttribute(
		'href',
		'/sites/moza-site'
	);
});

test('the site page shows the folder tree and page titles', async ({ page }) => {
	await page.goto('/sites/digi-handboek');
	await expect(page.getByRole('link', { name: 'kennis' })).toBeVisible();
	await expect(page.getByText('Het Digi Handboek', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: /Bewerken.*Het Digi Handboek/ })).toHaveAttribute(
		'href',
		'/sites/digi-handboek/bewerken/index.md'
	);
	await page.getByRole('link', { name: 'kennis' }).click();
	await expect(page).toHaveURL(/map=kennis/);
	await expect(page.getByRole('link', { name: /^Bewerken/ }).first()).toHaveAttribute(
		'href',
		/\/sites\/digi-handboek\/bewerken\/kennis\//
	);
});

test('the proposals list shows the seeded draft', async ({ page }) => {
	await page.goto('/sites/digi-handboek?tab=alle');
	await expect(page.getByText('Concept').first()).toBeVisible();
	await expect(page.getByRole('link', { name: /Bekijken/ }).first()).toHaveAttribute(
		'href',
		/\/sites\/digi-handboek\/voorstellen\/\d+/
	);
	await expect(page.getByText('Voorbeeldvoorstel Digi Handboek')).toBeVisible();
});

test('the new page form submits through the design system controls', async ({ page }) => {
	await page.goto('/sites/digi-handboek/nieuw');
	await page.evaluate(() => customElements.whenDefined('nldd-text-field'));
	await page.getByLabel('Map').selectOption('werkwijze');
	await page.getByLabel('Titel').fill('Toegankelijk formulier');
	await page.getByRole('button', { name: 'Pagina maken' }).click();
	await expect(page).toHaveURL(/\/bewerken\/werkwijze\/toegankelijk-formulier\.md\?/);
});
