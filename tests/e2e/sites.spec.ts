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
	const sites = list(page, 'Sites');
	await expect(sites.getByRole('link', { name: /Digi Handboek/ })).toHaveAttribute(
		'href',
		'/sites/digi-handboek'
	);
	await expect(sites.getByRole('link', { name: /MOZa-site/ })).toHaveAttribute(
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
	await page.evaluate(() => scrollTo(0, 400));
	const titleBar = (await page.locator('nldd-top-title-bar').boundingBox())!;
	const column = page.locator('nldd-sidebar-section > [slot="sidebar"]');
	await expect
		.poll(async () => (await column.boundingBox())!.y)
		.toBeGreaterThanOrEqual(titleBar.y + titleBar.height);
});

test('the proposals list shows the seeded draft', async ({ page }) => {
	await page.goto('/sites/digi-handboek?tab=alle');
	await expect(page.getByText('Concept').first()).toBeVisible();
	await expect(page.getByRole('link', { name: /Voorbeeldvoorstel Digi Handboek/ })).toHaveAttribute(
		'href',
		/\/sites\/digi-handboek\/voorstellen\/\d+/
	);
	await expect(page.getByText('Voorbeeldvoorstel Digi Handboek')).toBeVisible();
});

test('a proposal row ends with the chevron of a row that opens something', async ({ page }) => {
	await page.goto('/sites/digi-handboek?tab=alle');
	const rows = list(page, 'Alle voorstellen').locator('nldd-list-item[href]');
	await expect(rows.first()).toBeVisible();
	for (const row of await rows.all()) {
		await expect(row.locator('> nldd-icon-cell:last-child')).toHaveAttribute(
			'icon',
			'chevron-right'
		);
	}
});

test('the Te beoordelen block is there only while a proposal waits for the editors', async ({
	page
}) => {
	// The block and the tab list come from one load, so a single visit tells which state this is.
	await page.goto('/sites/digi-handboek?tab=beoordelen');
	const lists = page.locator('nldd-list[accessible-label="Te beoordelen"]');
	await expect(lists.last()).toBeVisible();
	const waiting = await lists.last().locator('nldd-list-item').count();
	await expect(page.getByRole('heading', { name: /^Te beoordelen \(/, level: 2 })).toHaveCount(
		waiting > 0 ? 1 : 0
	);
	await expect(lists).toHaveCount(waiting > 0 ? 2 : 1);
	await expect(page.getByRole('link', { name: 'Te beoordelen' })).toBeVisible();
});

test('the proposal page shows what changed before the comment form', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen/1');
	await expect(page.getByRole('heading', { name: 'Wijzigingen', level: 2 })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Opmerking', level: 2 })).toBeVisible();
	expect(
		await inDocumentOrder(page, [
			'nldd-badge',
			'nldd-toolbar[label="Acties voor dit voorstel"]',
			'nldd-title[text="Wijzigingen"]',
			'nldd-title[text="Opmerking"]'
		]),
		'status, actions, changes, comment'
	).toBe(true);
});

test('Nieuwe pagina is a plain primary button, not a one-item toolbar', async ({ page }) => {
	await page.goto('/sites/digi-handboek');
	const knop = page.locator('nldd-button[text="Nieuwe pagina"]');
	await expect(knop).toHaveAttribute('appearance', 'primary');
	await expect(knop).toHaveAttribute('href', '/sites/digi-handboek/nieuw');
	await expect(page.locator('nldd-toolbar nldd-button[text="Nieuwe pagina"]')).toHaveCount(0);
});

test('the primary action of a proposal is the first action in its toolbar', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen/1');
	await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
	const toolbar = page.locator('nldd-toolbar[label="Acties voor dit voorstel"]');
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
