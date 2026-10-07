import { expect, test } from '@playwright/test';

test('the home page lists both sites', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Kies een site' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Digi Handboek/ })).toHaveAttribute('href', '/sites/digi-handboek');
	await expect(page.getByRole('link', { name: /MOZa-site/ })).toHaveAttribute('href', '/sites/moza-site');
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
	await expect(page.getByText('Concept')).toBeVisible();
	await expect(page.getByRole('link', { name: /Bekijken/ })).toHaveAttribute(
		'href',
		/\/sites\/digi-handboek\/voorstellen\/\d+/
	);
	await expect(page.getByText('Voorbeeldvoorstel Digi Handboek')).toBeVisible();
});
