import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, site: string) {
	await page.goto(`/sites/${site}/nieuw`);
	await page.evaluate(() => customElements.whenDefined('nldd-multi-line-text-field'));
}

test('the form keeps a reading width', async ({ page }) => {
	await open(page, 'digi-handboek');
	const form = (await page.locator('nldd-form').boundingBox())!;
	const kop = (await page.getByRole('heading', { name: 'Nieuwe pagina', level: 1 }).boundingBox())!;
	expect(form.width).toBeLessThanOrEqual(720);
	expect(form.x).toBeCloseTo(kop.x, 0);
});

test('the file preview follows the title, the folder and the kind', async ({ page }) => {
	await open(page, 'digi-handboek');
	await expect(page.getByText('Bestand: de naam komt uit de titel')).toBeVisible();
	await page.getByLabel('Titel').fill('Mijn eerste pagina');
	await expect(page.getByText('Bestand: kennis/mijn-eerste-pagina.md')).toBeVisible();
	await page.getByLabel('Map').selectOption('werkwijze');
	await expect(page.getByText('Bestand: werkwijze/mijn-eerste-pagina.md')).toBeVisible();

	await open(page, 'moza-site');
	await expect(page.getByText(/Bestand: weekly\/\d{4}\/\d{4}-\d{2}-\d{2}\.md/)).toBeVisible();
	await page.getByLabel('Soort').selectOption('Onderwerp');
	await page.getByLabel('Titel').fill('Nieuw onderwerp');
	await expect(page.getByText('Bestand: onderwerpen/nieuw-onderwerp.md')).toBeVisible();
});

test('an existing file is refused on the form, before the editor', async ({ page }) => {
	await open(page, 'digi-handboek');
	await page.getByLabel('Titel').fill('Accounts');
	await page.getByLabel('Map').selectOption('onboarding');
	await page.getByRole('button', { name: 'Pagina maken' }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Er is al een pagina met het bestand' })
	).toContainText('onboarding/accounts.md');
	await expect(page).toHaveURL(/\/nieuw$/);
});
