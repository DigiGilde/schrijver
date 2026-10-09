import { expect, test, type Page } from '@playwright/test';

/** How far the element sits below the sticky header: the app bar and, where there is one, the title bar. */
const clearance = (page: Page, id: string) =>
	page.evaluate((target) => {
		const bar = document.querySelector('nldd-page > [slot="header"]')!.getBoundingClientRect();
		return document.getElementById(target)!.getBoundingClientRect().top - bar.bottom;
	}, id);

test.describe('Help, how a change reaches the site', () => {
	test('is one section between the steps and the images, with an address of its own', async ({
		page
	}) => {
		await page.goto('/help');
		await expect(page.locator('nldd-rich-text h2')).toHaveText([
			'Stap voor stap',
			'Zo komt een wijziging op de site',
			'Afbeeldingen en diagrammen',
			'De schrijfhulp',
			'Wat je identiteitskeuze betekent',
			'Hulp nodig?'
		]);
		await expect(page.locator('h2#voorstellen')).toHaveText('Zo komt een wijziging op de site');
	});

	test('names the three steps and does not count an approval as one', async ({ page }) => {
		await page.goto('/help');
		const steps = page.locator('h2#voorstellen + p + ol > li');
		await expect(steps).toHaveText([/^Concept\. /, /^Ingestuurd\. /, /^Samengevoegd\. /]);
		await expect(steps.nth(0)).toContainText('de site verandert nog niet');
		await expect(steps.nth(1)).toContainText(
			'vraagt Schrijver de redactie van de site om te beslissen'
		);
		await expect(steps.nth(2)).toContainText('Na de volgende publicatie staat ze op de site');
		await expect(page.getByRole('main').getByText('Goedgekeurd')).toHaveCount(0);
	});

	test('says who decides, how to adjust a proposal and where the editors are named', async ({
		page
	}) => {
		await page.goto('/help');
		const text = page.locator('nldd-rich-text');
		await expect(text).toContainText('met "Samenvoegen"');
		await expect(text).toContainText('met "Vraag om aanpassing"');
		await expect(text).toContainText('de status "Aanpassing gevraagd"');
		await expect(text).toContainText('bij "Gesprek" op de pagina van het voorstel');
		await expect(text).toContainText('met "Verder bewerken" en kies daarna "Opnieuw insturen"');
		await expect(text).toContainText('Niemand voegt een eigen voorstel samen');
		await expect(text).toContainText(
			'Beheerders van de site mogen hun eigen voorstel wel samenvoegen'
		);
		await expect(text).toContainText('Een site kan deze regel ook uitzetten');
		await expect(text).toContainText('Bij sommige sites is eerst een goedkeuring op GitHub nodig');
		await expect(text).toContainText('bij "Over" en de naam van de site');
	});

	test('is where the last step of Stap voor stap leads, below the sticky header', async ({
		page
	}) => {
		await page.goto('/help');
		await page.evaluate(() => customElements.whenDefined('nldd-page'));
		await page.getByRole('link', { name: 'Zo komt een wijziging op de site' }).click();
		await expect(page).toHaveURL(/\/help#voorstellen$/);
		await expect(page.locator('h2#voorstellen')).toBeInViewport();
		expect(await clearance(page, 'voorstellen')).toBeGreaterThanOrEqual(7);
	});

	test('opens at that section from an address with the fragment', async ({ page }) => {
		await page.goto('/help#voorstellen');
		await expect(page.locator('h2#voorstellen')).toBeInViewport();
		await expect.poll(() => clearance(page, 'voorstellen')).toBeGreaterThanOrEqual(7);
	});
});

const SITE_PAGES = [
	'/sites/digi-handboek',
	'/sites/digi-handboek/voorstellen',
	'/sites/digi-handboek/voorstellen/1',
	'/sites/digi-handboek/bewerken/index.md',
	'/sites/digi-handboek/nieuw',
	'/sites/digi-handboek/over'
];

/** Opens the menu of the app bar, or the overflow menu that replaces it on a narrow screen. */
async function openMenu(page: Page) {
	await page.evaluate(() => customElements.whenDefined('nldd-menu'));
	const menu = page.getByRole('button', { name: 'Menu' });
	if (await menu.isVisible()) await menu.click();
	else await page.getByRole('button', { name: 'Meer' }).click();
	return page.getByRole('menuitem');
}

test.describe('the menu', () => {
	for (const url of SITE_PAGES) {
		test(`offers Over Digi Handboek, between Sites and Help, on ${url}`, async ({ page }) => {
			await page.goto(url);
			await expect(await openMenu(page)).toHaveText([
				'Sites',
				'Over Digi Handboek',
				'Help',
				'Instellingen',
				'Uitloggen'
			]);
			await expect(page.getByRole('menuitem', { name: 'Over Digi Handboek' })).toHaveAttribute(
				'href',
				'/sites/digi-handboek/over'
			);
		});
	}

	test('names the site that the page belongs to', async ({ page }) => {
		await page.goto('/sites/moza-site');
		await openMenu(page);
		await expect(
			page.getByRole('menuitem', { name: 'Over MijnOverheid Zakelijk' })
		).toHaveAttribute('href', '/sites/moza-site/over');
		await expect(page.getByRole('menuitem', { name: /^Over / })).toHaveCount(1);
	});

	for (const url of ['/', '/help', '/instellingen', '/sites/bestaat-niet']) {
		test(`has no Over item on ${url}, which belongs to no site`, async ({ page }) => {
			await page.goto(url);
			await expect(await openMenu(page)).toHaveText(['Sites', 'Help', 'Instellingen', 'Uitloggen']);
		});
	}

	test('leads to the Over page inside the app, from the mouse and from the keyboard', async ({
		page
	}) => {
		const navigations = () =>
			page.evaluate(() => performance.getEntriesByType('navigation').length);
		await page.goto('/sites/digi-handboek');
		const before = await navigations();
		await (await openMenu(page)).getByText('Over Digi Handboek').click();
		await expect(page).toHaveURL(/\/sites\/digi-handboek\/over$/);
		expect(await navigations(), 'a navigation inside the app, not a page load').toBe(before);

		await page.goto('/sites/moza-site');
		await page.evaluate(() => customElements.whenDefined('nldd-menu'));
		await page.getByRole('button', { name: 'Menu' }).focus();
		await page.keyboard.press('Enter');
		const over = page.getByRole('menuitem', { name: 'Over MijnOverheid Zakelijk' });
		for (let i = 0; i < 5 && !(await over.evaluate((el) => el.matches(':focus'))); i++) {
			await page.keyboard.press('ArrowDown');
		}
		await expect(over).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/\/sites\/moza-site\/over$/);
	});

	test.describe('at 320 px and 200% text', () => {
		test.use({ viewport: { width: 320, height: 800 } });

		test('moves Over <site> into the overflow menu, with the other destinations', async ({
			page
		}) => {
			await page.goto('/sites/digi-handboek');
			await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
			await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
			await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
			await page.getByRole('button', { name: 'Meer' }).click();
			await expect(page.getByRole('menuitem')).toHaveText([
				'Sites',
				'Over Digi Handboek',
				'Help',
				'Instellingen',
				'Uitloggen'
			]);
			await expect(page.getByRole('menuitem', { name: 'Over Digi Handboek' })).toHaveAttribute(
				'href',
				'/sites/digi-handboek/over'
			);
		});
	});
});
