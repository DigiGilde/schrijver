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

test('Maak een opzet fills title and outline, and Pagina maken opens the editor with them', async ({
	page
}) => {
	await open(page, 'digi-handboek');
	const beschrijving = page.getByLabel('Of beschrijf wat je wilt schrijven');
	await beschrijving.fill('Een pagina over de koffieautomaat. Waar staat hij en hoe werkt hij?');
	await expect(page.getByText(/^Voorstellen komen van een AI-taalmodel \(VLAM\)/)).toBeVisible();
	await page.getByRole('button', { name: 'Maak een opzet' }).click();

	await expect(page.getByLabel('Titel')).toHaveValue('Een pagina over de koffieautomaat');
	const opzet = page.getByLabel('Opzet', { exact: true });
	await expect(opzet).toHaveValue(/^## Waar gaat het over\n\nEen pagina over de koffieautomaat\./);
	await expect(page.getByText(/^Testantwoord, geen AI: /)).toBeVisible();
	await expect(page.locator('form').getByRole('status')).toHaveText(
		'Titel en opzet staan klaar. Controleer ze voordat je de pagina maakt.'
	);
	await expect(
		page.getByText('Bestand: kennis/een-pagina-over-de-koffieautomaat.md')
	).toBeVisible();

	await opzet.fill('## Waar staat hij\n\nOp de vierde verdieping.');
	await page.getByRole('button', { name: 'Pagina maken' }).click();
	await expect(page).toHaveURL(
		/\/bewerken\/kennis\/een-pagina-over-de-koffieautomaat\.md\?nieuw=1&.*opzet=1/
	);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Een pagina over de koffieautomaat'
	);
	// The outline arrives as an unsaved draft; nothing reaches the forge before "Concept bewaren".
	await expect(
		page.getByText('Deze opzet komt van Schrijfhulp. Lees en pas alles aan voordat je het bewaart.')
	).toBeVisible();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toHaveCount(0);
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('# Een pagina over de koffieautomaat');
	await expect(editor).toContainText('## Waar staat hij');
	await expect(editor).toContainText('Op de vierde verdieping.');
});

test('Maak een opzet without a description says what is missing and asks nothing', async ({
	page
}) => {
	await open(page, 'moza-site');
	let asked = 0;
	page.on('request', (r) => {
		if (r.url().endsWith('/api/assistent')) asked++;
	});
	await page.getByRole('button', { name: 'Maak een opzet' }).click();
	await expect(page.getByText('Een beschrijving is nodig voor een opzet')).toBeVisible();
	await expect(page.getByLabel('Of beschrijf wat je wilt schrijven')).toBeFocused();
	expect(asked).toBe(0);
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
