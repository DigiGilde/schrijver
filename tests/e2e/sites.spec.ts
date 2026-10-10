import { expect, test, type Page } from '@playwright/test';

/** A list is found by its host: its rows are slotted into it, so they are not descendants of its role=list. */
const list = (page: Page, label: string) => page.locator(`nldd-list[accessible-label="${label}"]`);

/** True when the first match of every selector comes after the previous one in document order. */
function inDocumentOrder(page: Page, selectors: string[]) {
	return page.evaluate(
		(selectorList) =>
			selectorList.every(
				(selector, i) =>
					i === 0 ||
					!!(
						document
							.querySelector(selectorList[i - 1])!
							.compareDocumentPosition(document.querySelector(selector)!) &
						Node.DOCUMENT_POSITION_FOLLOWING
					)
			),
		selectors
	);
}

test('the home page lists both sites', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Kies een site' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Digi Handboek' })).toHaveAttribute(
		'href',
		'/sites/digi-handboek'
	);
	await expect(page.getByRole('link', { name: 'MijnOverheid Zakelijk' })).toHaveAttribute(
		'href',
		'/sites/moza-site'
	);
});

test('the site page shows the folder tree and page titles', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await page.goto('/sites/digi-handboek');
	const folders = page.getByRole('navigation', { name: 'Mappen' });
	await expect(folders.getByRole('link', { name: 'kennis', exact: true })).toBeVisible();
	await expect(
		list(page, "Pagina's").getByText('Het Digi Handboek', { exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mappen' })).toBeHidden();
	await folders.getByRole('link', { name: 'kennis', exact: true }).click();
	await expect(page).toHaveURL(/map=kennis/);
	await expect(list(page, "Pagina's in kennis").getByRole('link').first()).toHaveAttribute(
		'href',
		/\/sites\/digi-handboek\/bewerken\/kennis\//
	);
	expect(errors).toEqual([]);
});

test.describe('on a narrow screen', () => {
	test.use({ viewport: { width: 400, height: 800 } });

	test('the folders open in a sheet behind a Mappen button', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		await page.goto('/sites/digi-handboek');
		const button = page.getByRole('button', { name: 'Mappen' });
		const folders = page.getByRole('navigation', { name: 'Mappen' });
		await expect(button).toBeVisible();
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await expect(folders).toBeHidden();

		await button.click();
		await expect(button).toHaveAttribute('aria-expanded', 'true');
		await folders.getByRole('link', { name: 'kennis', exact: true }).click();
		await expect(page).toHaveURL(/map=kennis/);
		await expect(button).toHaveAttribute('aria-expanded', 'false');
		await expect(folders).toBeHidden();
		await expect(list(page, "Pagina's in kennis")).toBeVisible();
		expect(errors).toEqual([]);
	});
});

test('a page row is one link to the editor, named after the page title', async ({ page }) => {
	await page.goto('/sites/digi-handboek');
	const rows = list(page, "Pagina's");
	for (const [title, file] of [
		['Het Digi Handboek', 'index.md'],
		['Contact', 'contact.md'],
		['Bijdragen aan het Digi Handboek', 'bijdragen-aan-handboek.md']
	]) {
		const link = rows.getByRole('link', { name: new RegExp(`^${title}`) });
		await expect(link).toHaveAttribute('href', `/sites/digi-handboek/bewerken/${file}`);
		await expect(link).toHaveAccessibleName(`${title} ${file}`);
	}
});

test('the open folder is marked as current', async ({ page }) => {
	await page.goto('/sites/digi-handboek');
	const folders = page.getByRole('navigation', { name: 'Mappen' });
	const top = folders.getByRole('link', { name: 'Hoogste niveau' });
	const kennis = folders.getByRole('link', { name: 'kennis', exact: true });
	await expect(top).toHaveAttribute('aria-current', 'page');
	await expect(kennis).not.toHaveAttribute('aria-current', 'page');
	await kennis.click();
	await expect(page).toHaveURL(/map=kennis/);
	await expect(kennis).toHaveAttribute('aria-current', 'page');
	await expect(top).not.toHaveAttribute('aria-current', 'page');
});

test('the folder column stays below the sticky bars while the page scrolls', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 600 });
	await page.goto('/sites/moza-site?map=weekly%2F2025');
	await page.evaluate(() => customElements.whenDefined('nldd-sidebar-section'));
	// Far enough for the column to stick, not to the end of the page, where its section pushes it up.
	await page.evaluate(() => scrollTo(0, 300));
	const titleBar = (await page.locator('nldd-top-title-bar').boundingBox())!;
	const column = page.locator('nldd-sidebar-section > [slot="sidebar"]');
	await expect
		.poll(async () => (await column.boundingBox())!.y)
		.toBeGreaterThanOrEqual(titleBar.y + titleBar.height);
});

test('the proposals tab lists the seeded draft', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=alle');
	const rows = list(page, 'Alle voorstellen');
	await expect(rows.getByRole('link', { name: /Voorbeeldvoorstel Digi Handboek/ })).toHaveAttribute(
		'href',
		/\/sites\/digi-handboek\/voorstellen\/\d+/
	);
	await expect(rows.locator('nldd-text-cell[text="Concept"]').first()).toBeVisible();
});

test('a proposal row without a shortcut ends with the chevron of a row that opens something', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=alle');
	const rows = list(page, 'Alle voorstellen').locator('nldd-list-item[href]');
	await expect(rows.first()).toBeVisible();
	for (const row of await rows.all()) {
		await expect(row.locator('> nldd-icon-cell:last-child')).toHaveAttribute(
			'icon',
			'chevron-right'
		);
	}
});

test('Te beoordelen is a filter of the proposals tab, for editorial members only', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek');
	await expect(page.getByRole('heading', { name: /^Te beoordelen/ })).toHaveCount(0);
	await expect(page.locator('nldd-list[accessible-label="Te beoordelen"]')).toHaveCount(0);

	await page.goto('/sites/digi-handboek/voorstellen');
	await expect(page.getByRole('radio', { name: /^Te beoordelen/ })).toBeVisible();
	await page.goto('/sites/moza-site/voorstellen');
	await expect(page.getByRole('radio', { name: 'Alle voorstellen' })).toBeVisible();
	await expect(page.getByRole('radio', { name: /^Te beoordelen/ })).toHaveCount(0);
});

test('the proposal page says what now, then what changes, then the conversation', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/voorstellen/1');
	await expect(page.getByRole('heading', { name: 'Wat er verandert', level: 2 })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Gesprek', level: 2 })).toBeVisible();
	expect(
		await inDocumentOrder(page, [
			'nldd-box nldd-step-bar',
			'nldd-box nldd-text.zin',
			'nldd-title[text="Wat er verandert"]',
			'nldd-title[text="Gesprek"]',
			'nldd-form'
		]),
		'flow, what now, changes, conversation, reaction'
	).toBe(true);
});

test('the reaction form follows the NLDD form pattern', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen/1');
	const form = page.locator('nldd-form > form');
	await expect(
		form.locator('nldd-form-field[label="Je reactie"] nldd-multi-line-text-field')
	).toHaveCount(1);
	await expect(
		form.locator('nldd-form-actions > nldd-button-group > nldd-button[type="submit"]')
	).toHaveAttribute('text', 'Plaats reactie');
});

test('Nieuwe pagina is a plain primary button, not a one-item toolbar', async ({ page }) => {
	await page.goto('/sites/digi-handboek');
	const knop = page.locator('nldd-button[text="Nieuwe pagina"]');
	await expect(knop).toHaveAttribute('appearance', 'primary');
	await expect(knop).toHaveAttribute('href', '/sites/digi-handboek/nieuw');
	await expect(page.locator('nldd-toolbar nldd-button[text="Nieuwe pagina"]')).toHaveCount(0);
});

test('the primary action of a proposal comes first among its actions', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await list(page, 'Mijn voorstellen')
		.getByRole('link', { name: /^Onboarding: begin bij je buddy/ })
		.click();
	await expect(page).toHaveURL(/\/voorstellen\/\d+\?filter=mijn$/);
	await page.evaluate(() => customElements.whenDefined('nldd-button-group'));
	const toolbar = page.locator('nldd-box nldd-button-group');
	const primary = toolbar.locator('nldd-button[appearance="primary"]');
	await expect(primary).toHaveAttribute('text', 'Insturen');
	const others = await toolbar.locator('nldd-button:not([appearance="primary"])').all();
	expect(others.length).toBeGreaterThan(0);
	for (const other of others) {
		await expect
			.poll(async () => (await other.boundingBox())!.x - (await primary.boundingBox())!.x)
			.toBeGreaterThan(0);
	}
});

test('the settings page has a block each for signing, GitHub and logging out', async ({ page }) => {
	await page.goto('/instellingen');
	for (const name of ['Ondertekenen', 'GitHub-account', 'Uitloggen']) {
		await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
	}
	expect(
		await inDocumentOrder(page, [
			'nldd-title[text="Ondertekenen"]',
			'nldd-title[text="GitHub-account"]',
			'nldd-title[text="Uitloggen"]'
		])
	).toBe(true);

	await page.goto('/onboarding');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
});

test('the new page form submits through the design system controls', async ({ page }) => {
	await page.goto('/sites/digi-handboek/nieuw');
	await page.evaluate(() => customElements.whenDefined('nldd-text-field'));
	await page.getByLabel('Map').selectOption('werkwijze');
	await page.getByLabel('Titel').fill('Toegankelijk formulier');
	await page.getByRole('button', { name: 'Pagina maken' }).click();
	await expect(page).toHaveURL(/\/bewerken\/werkwijze\/toegankelijk-formulier\.md\?/);
});
