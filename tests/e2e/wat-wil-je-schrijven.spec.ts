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

test('the file preview caps a long file name at a word', async ({ page }) => {
	await open(page, 'digi-handboek');
	await page.getByLabel('Titel').fill('woord '.repeat(40));
	await expect(page.getByText(`Bestand: kennis/${'woord-'.repeat(12)}woord.md`)).toBeVisible();
});

test('Maak een opzet fills title and outline, and Maak pagina opens the editor with them', async ({
	page
}) => {
	await open(page, 'digi-handboek');
	const beschrijving = page.getByLabel('Of beschrijf wat je wilt schrijven');
	await beschrijving.fill('Een pagina over de koffieautomaat. Waar staat hij en hoe werkt hij?');
	await expect(page.getByText(/^Suggesties komen van een AI-taalmodel \(VLAM\)/)).toBeVisible();
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
	await page.getByRole('button', { name: 'Maak pagina' }).click();
	await expect(page).toHaveURL(
		/\/bewerken\/kennis\/een-pagina-over-de-koffieautomaat\.md\?nieuw=1&/
	);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Een pagina over de koffieautomaat'
	);
	// The outline arrives as an unsaved draft; nothing reaches the forge before "Bewaar".
	const herkomst = page.getByText(
		'Deze opzet komt van Schrijfhulp. Lees en pas alles aan voordat je het bewaart.'
	);
	await expect(herkomst).toBeVisible();
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toHaveCount(0);
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('# Een pagina over de koffieautomaat');
	await expect(editor).toContainText('## Waar staat hij');
	await expect(editor).toContainText('Op de vierde verdieping.');

	// Once taken over, the outline is the writer's draft: a reload asks about it like any other.
	expect(page.url(), 'the outline travels in the draft').not.toContain('opzet');
	const sleutel = 'schrijver:digi-handboek:new:kennis/een-pagina-over-de-koffieautomaat.md';
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nMijn eigen zin.');
	await expect
		.poll(() => page.evaluate((k) => localStorage.getItem(k), sleutel))
		.toContain('Mijn eigen zin.');
	await page.reload();
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toBeVisible();
	await expect(herkomst).toHaveCount(0);
});

test('Back into an outline the writer worked on asks about the draft, without the banner', async ({
	page
}) => {
	await open(page, 'digi-handboek');
	await page.getByLabel('Of beschrijf wat je wilt schrijven').fill('Een pagina over de lift.');
	await page.getByRole('button', { name: 'Maak een opzet' }).click();
	await expect(page.getByLabel('Opzet', { exact: true })).not.toHaveValue('');
	await page.getByRole('button', { name: 'Maak pagina' }).click();
	const herkomst = page.getByText(
		'Deze opzet komt van Schrijfhulp. Lees en pas alles aan voordat je het bewaart.'
	);
	await expect(herkomst).toBeVisible();
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nMijn eigen zin.');

	await page.getByRole('link', { name: 'Digi Handboek' }).first().click();
	await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
	await page.goBack();
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toBeVisible();
	await expect(herkomst).toHaveCount(0);
});

test('a marked outline is taken over once, also with a page load', async ({ page }) => {
	const pad = 'kennis/een-opzet-bij-het-laden.md';
	const sleutel = `schrijver:digi-handboek:new:${pad}`;
	await open(page, 'digi-handboek');
	await page.evaluate(
		([k, path]) =>
			localStorage.setItem(
				k,
				JSON.stringify({
					path,
					body: '# Een opzet bij het laden\n\n## Eerst\n',
					frontmatter: {},
					at: Date.now(),
					sha: null,
					images: [],
					outline: true
				})
			),
		[sleutel, pad]
	);
	await page.goto(
		`/sites/digi-handboek/bewerken/${pad}?nieuw=1&map=kennis&titel=Een+opzet+bij+het+laden`
	);
	const herkomst = page.getByText(
		'Deze opzet komt van Schrijfhulp. Lees en pas alles aan voordat je het bewaart.'
	);
	await expect(herkomst).toBeVisible();
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('## Eerst');
	expect(
		await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').outline, sleutel),
		'the mark goes with the first restore'
	).toBeUndefined();

	await page.reload();
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toBeVisible();
	await expect(herkomst).toHaveCount(0);
});

test('Maak een opzet keeps a title the writer typed and names the suggestion', async ({ page }) => {
	await open(page, 'digi-handboek');
	await page.getByLabel('Titel').fill('Mijn eigen titel');
	await page
		.getByLabel('Of beschrijf wat je wilt schrijven')
		.fill('Een pagina over de koffieautomaat. Waar staat hij en hoe werkt hij?');
	await page.getByRole('button', { name: 'Maak een opzet' }).click();

	await expect(page.getByLabel('Opzet', { exact: true })).toHaveValue(/^## Waar gaat het over/);
	await expect(page.locator('form').getByRole('status')).toHaveText(
		'De opzet staat klaar. Je eigen titel is blijven staan. Suggestie van Schrijfhulp voor de titel: "Een pagina over de koffieautomaat". Controleer de opzet voordat je de pagina maakt.'
	);
	await expect(page.getByLabel('Titel')).toHaveValue('Mijn eigen titel');
	await expect(page.getByText('Bestand: kennis/mijn-eigen-titel.md')).toBeVisible();
});

test('a second Maak een opzet replaces the title it filled in, not one the writer edited', async ({
	page
}) => {
	await open(page, 'digi-handboek');
	const beschrijving = page.getByLabel('Of beschrijf wat je wilt schrijven');
	const opzet = page.getByLabel('Opzet', { exact: true });
	const maak = page.getByRole('button', { name: 'Maak een opzet' });

	await beschrijving.fill('Een pagina over de koffieautomaat. Waar staat hij en hoe werkt hij?');
	await maak.click();
	await expect(page.getByLabel('Titel')).toHaveValue('Een pagina over de koffieautomaat');

	await beschrijving.fill('Een pagina over het afval. Wat gaat waar in?');
	await maak.click();
	await expect(opzet).toHaveValue(/Een pagina over het afval\./);
	await expect(page.getByLabel('Titel')).toHaveValue('Een pagina over het afval');

	await page.getByLabel('Titel').fill('Afval scheiden');
	await beschrijving.fill('Een pagina over de kantine. Wat staat er op het menu?');
	await maak.click();
	await expect(opzet).toHaveValue(/Een pagina over de kantine\./);
	await expect(page.locator('form').getByRole('status')).toHaveText(
		'De opzet staat klaar. Je eigen titel is blijven staan. Suggestie van Schrijfhulp voor de titel: "Een pagina over de kantine". Controleer de opzet voordat je de pagina maakt.'
	);
	await expect(page.getByLabel('Titel')).toHaveValue('Afval scheiden');
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
	await page.getByRole('button', { name: 'Maak pagina' }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Er is al een pagina met het bestand' })
	).toContainText('onboarding/accounts.md');
	await expect(page).toHaveURL(/\/nieuw$/);
});

test('a title above 300 characters is refused on the form, keeping what was typed', async ({
	page
}) => {
	await open(page, 'digi-handboek');
	const titel = `${'woord '.repeat(50)}x`;
	await page.getByLabel('Titel').fill(titel);
	await page.getByRole('button', { name: 'Maak pagina' }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'De titel is te lang: gebruik hoogstens 300 tekens' })
	).toBeVisible();
	await expect(page.getByLabel('Titel')).toHaveValue(titel);
	await expect(page).toHaveURL(/\/nieuw$/);
});
