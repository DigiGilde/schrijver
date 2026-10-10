import { expect, test, type Page } from '@playwright/test';

/** The content of a page: the main landmark is inside nldd-page, so slotted content is not its descendant. */
const inhoud = (page: Page) => page.locator('#inhoud');

/** How far the element sits below the sticky header: the app bar and, where there is one, the title bar. */
const clearance = (page: Page, id: string) =>
	page.evaluate((target) => {
		const bar = document.querySelector('nldd-page > [slot="header"]')!.getBoundingClientRect();
		return document.getElementById(target)!.getBoundingClientRect().top - bar.bottom;
	}, id);

/** Lets the browser lay out and paint twice, so what a script does after the first frame has happened. */
const afterFrames = (page: Page) =>
	page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
	);

/** The element was scrolled to: it sits just below the sticky header, not merely somewhere in the viewport. */
async function expectScrolledTo(page: Page, id: string) {
	await expect
		.poll(() => clearance(page, id), 'clear of the sticky header')
		.toBeGreaterThanOrEqual(7);
	await expect.poll(() => clearance(page, id), 'scrolled up to it').toBeLessThanOrEqual(40);
}

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
		await expect(inhoud(page).getByText('Goedgekeurd')).toHaveCount(0);
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
		await expectScrolledTo(page, 'voorstellen');
	});

	test('scrolls to its fragment on a direct load, below the sticky header', async ({ page }) => {
		await page.goto('/help#voorstellen');
		await expectScrolledTo(page, 'voorstellen');
		await afterFrames(page);
		const after = await clearance(page, 'voorstellen');
		expect(after, 'nothing scrolls it away later').toBeGreaterThanOrEqual(7);
		expect(after, 'nothing scrolls it away later').toBeLessThanOrEqual(40);
	});

	test('scrolls to it once: a reader who scrolls away stays there', async ({ page }) => {
		await page.goto('/help#voorstellen');
		await expectScrolledTo(page, 'voorstellen');
		await page.evaluate(() => window.scrollTo(0, 0));
		await afterFrames(page);
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
	});

	for (const fragment of ['#bestaat-niet', '#%E0%A4%A']) {
		test(`leaves the fragment ${fragment}, which names no element, alone`, async ({ page }) => {
			const errors: Error[] = [];
			page.on('pageerror', (error) => errors.push(error));
			await page.goto(`/help${fragment}`);
			await page.evaluate(() => customElements.whenDefined('nldd-page'));
			await afterFrames(page);
			expect(await page.evaluate(() => window.scrollY)).toBe(0);
			expect(errors).toEqual([]);
		});
	}

	test.describe('at 400 px', () => {
		test.use({ viewport: { width: 400, height: 800 } });

		test('scrolls to its fragment on a direct load, below the sticky header', async ({ page }) => {
			await page.goto('/help#voorstellen');
			await expectScrolledTo(page, 'voorstellen');
		});
	});

	test('has its address in the server-rendered page, where a browser looks for the fragment', async ({
		request
	}) => {
		const html = await (await request.get('/help')).text();
		expect(html).toContain('<h2 id="voorstellen">Zo komt een wijziging op de site</h2>');
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

/** A part of the Over page is found by its heading: the heading and the text sit in one container. */
const part = (page: Page, heading: string) =>
	page.locator(`nldd-container:has(> nldd-title[text="${heading}"])`);

/**
 * Shows the Over page that a navigation inside the app leads to with other data than the server sent,
 * for what no fixture site has: a repository that is not public, a site that merges only on GitHub.
 */
async function patchAbout(page: Page, patch: Record<string, unknown>) {
	await page.route(/\/over\/__data\.json/, async (route) => {
		const response = await route.fetch();
		const body = await response.json();
		for (const node of body.nodes) {
			const root = node?.data?.[0];
			if (!root || !('conceptenOpenbaar' in root)) continue;
			// devalue stores each distinct value once, so a changed value gets an entry of its own.
			for (const [path, value] of Object.entries(patch)) {
				const keys = path.split('.');
				const last = keys.pop()!;
				const holder = keys.reduce((object, key) => node.data[object[key]], root);
				holder[last] = node.data.push(value) - 1;
			}
		}
		await route.fulfill({
			status: response.status(),
			contentType: 'application/json',
			body: JSON.stringify(body)
		});
	});
}

async function openAboutFromSite(page: Page, site: string, name: string) {
	await page.goto(`/sites/${site}`);
	await openMenu(page);
	await page.getByRole('menuitem', { name: `Over ${name}` }).click();
	await expect(page).toHaveURL(new RegExp(`/sites/${site}/over$`));
}

test.describe('the Over page', () => {
	test('is titled Over <site>, leads back to the site and has no tabs', async ({ page }) => {
		await page.goto('/sites/digi-handboek/over');
		await expect(page.getByRole('heading', { name: 'Over Digi Handboek', level: 1 })).toBeVisible();
		await expect(page).toHaveTitle('Over Digi Handboek · Schrijver');
		await expect(page.locator('nldd-tab-bar')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Sites', exact: true })).toHaveCount(0);
		await page.getByRole('link', { name: 'Digi Handboek', exact: true }).click();
		await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
	});

	test('opens with the description and the public address as a link', async ({ page }) => {
		await page.goto('/sites/moza-site/over');
		await expect(
			page.getByText(
				'Een overheidsbrede samenwerking om de dienstverlening voor ondernemers te verbeteren.'
			)
		).toBeVisible();
		const address = page.getByRole('link', { name: /^mijnoverheidzakelijk\.nl/ });
		await expect(address).toHaveAttribute('href', 'https://mijnoverheidzakelijk.nl/');
		await expect(address).toHaveAttribute('target', '_blank');
	});

	test('has no opening for a site without description and public address', async ({ page }) => {
		await patchAbout(page, { 'site.omschrijving': null, 'site.adres': null });
		await openAboutFromSite(page, 'digi-handboek', 'Digi Handboek');
		await expect(page.getByRole('heading', { name: 'Redactie', level: 2 })).toBeVisible();
		await expect(inhoud(page).locator('nldd-text, nldd-link')).toHaveCount(0);
	});

	test('has a heading in title form for each part, and ends with a pointer to Help', async ({
		page
	}) => {
		await page.goto('/sites/digi-handboek/over');
		await expect(page.getByRole('heading', { level: 2 })).toHaveText([
			'Redactie',
			'Ondertekenen',
			'Concepten',
			'Voorbeeld van een voorstel',
			'Bestanden op GitHub'
		]);
		const last = inhoud(page).locator('nldd-rich-text').last();
		await expect(last).toHaveText('Hoe een wijziging op de site komt, lees je bij Help.');
		await expect(last.getByRole('link', { name: 'Help' })).toHaveAttribute(
			'href',
			'/help#voorstellen'
		);
	});

	test('does not explain the flow, which Help does', async ({ page }) => {
		await page.goto('/sites/digi-handboek/over');
		const main = inhoud(page);
		await expect(
			page.getByRole('heading', { name: 'Zo komt een wijziging op de site' })
		).toHaveCount(0);
		await expect(main.locator('ol')).toHaveCount(0);
		await expect(main).not.toContainText(/Goedgekeurd|Goedkeuren|pull request|merge/i);
	});

	test('names the team by name and role, and everyone with write access, in one block', async ({
		page
	}) => {
		await page.goto('/sites/digi-handboek/over');
		const redactie = part(page, 'Redactie');
		await expect(redactie).toHaveCount(1);
		await expect(redactie.getByRole('listitem')).toHaveText(['Test Gebruiker (beheerder)']);
		await expect(redactie).toContainText(
			'Ook wie op GitHub schrijfrechten heeft op DigiGilde/handboek, hoort bij de redactie; met admin-rechten ben je beheerder.'
		);
		await expect(redactie).toContainText(
			'Een vraag aan de redactie stel je in het gesprek bij je voorstel.'
		);
		await expect(redactie).not.toContainText('@');
		await expect(redactie).not.toContainText('Uitgenodigd');
		await expect(redactie.locator('a[href^="mailto:"]')).toHaveCount(0);
		await expect(redactie).not.toContainText('samenvoegen');
	});

	test('lists the beheerders first, then the redactie by name', async ({ page }) => {
		await page.goto('/sites/moza-site/over');
		await expect(part(page, 'Redactie').getByRole('listitem')).toHaveText([
			'Tweede Collega (beheerder)',
			'Derde Collega',
			'Test Gebruiker'
		]);
	});

	test('leads a site admin to the beheer page of the site, and nobody else', async ({ page }) => {
		await page.goto('/sites/digi-handboek/over');
		await expect(
			part(page, 'Redactie').getByRole('link', { name: 'Beheer van Digi Handboek' })
		).toHaveAttribute('href', '/instellingen/sites/digi-handboek');
		await page.goto('/sites/moza-site/over');
		await expect(part(page, 'Redactie')).toContainText('Test Gebruiker');
		await expect(part(page, 'Redactie').getByRole('link', { name: /^Beheer van/ })).toHaveCount(0);
	});

	test('says when merging happens on GitHub only', async ({ page }) => {
		await patchAbout(page, { mergenVanuitSchrijver: false });
		await openAboutFromSite(page, 'digi-handboek', 'Digi Handboek');
		await expect(part(page, 'Redactie')).toContainText(
			'Op deze site gebeurt het samenvoegen op GitHub, niet in Schrijver.'
		);
	});

	test('lists the ways to sign that the site allows, with a link to Instellingen', async ({
		page
	}) => {
		await page.goto('/sites/digi-handboek/over');
		const ondertekenen = part(page, 'Ondertekenen');
		await expect(ondertekenen.getByRole('listitem')).toHaveText([
			'Anoniem: op GitHub staat alleen een codenaam, geen naam of e-mailadres.',
			'Gekoppeld aan GitHub: je wijziging staat onder je GitHub-profiel. Je werk-e-mailadres blijft verborgen.',
			'Op naam: je volledige naam en e-mailadres staan bij je wijziging.'
		]);
		await expect(ondertekenen.getByRole('link', { name: 'Instellingen' })).toHaveAttribute(
			'href',
			'/instellingen'
		);
		await expect(ondertekenen).toContainText(
			'dan ondertekent Schrijver hier met minder gegevens van jou, bijvoorbeeld anoniem.'
		);

		await page.goto('/sites/moza-site/over');
		await expect(part(page, 'Ondertekenen').getByRole('listitem')).toHaveText([
			/^Anoniem: /,
			/^Gekoppeld aan GitHub: /
		]);
	});

	test('says whether drafts are public', async ({ page }) => {
		await page.goto('/sites/digi-handboek/over');
		await expect(part(page, 'Concepten')).toContainText(
			'Concepten zijn openbaar. De repository van deze site is openbaar'
		);

		await patchAbout(page, { conceptenOpenbaar: false });
		await openAboutFromSite(page, 'digi-handboek', 'Digi Handboek');
		await expect(part(page, 'Concepten')).toContainText(
			'Concepten zijn niet openbaar. De repository van deze site is niet openbaar'
		);
	});

	test('says what kind of preview a proposal gets', async ({ page }) => {
		await page.goto('/sites/digi-handboek/over');
		await expect(part(page, 'Voorbeeld van een voorstel')).toContainText(
			'Elk voorstel krijgt een voorbeeld van de site.'
		);
		await page.goto('/sites/moza-site/over');
		await expect(part(page, 'Voorbeeld van een voorstel')).toContainText(
			'Een voorstel krijgt een voorbeeld zodra het is ingestuurd.'
		);

		await patchAbout(page, { voorbeeld: 'geen' });
		await openAboutFromSite(page, 'digi-handboek', 'Digi Handboek');
		await expect(part(page, 'Voorbeeld van een voorstel')).toContainText(
			'Deze site maakt geen voorbeeld van een voorstel.'
		);
	});

	test('names the repository and branch, and where the structure of the site sits', async ({
		page
	}) => {
		await page.goto('/sites/digi-handboek/over');
		const bestanden = part(page, 'Bestanden op GitHub');
		await expect(
			bestanden.getByRole('link', { name: 'DigiGilde/handboek, branch main' })
		).toHaveAttribute('href', 'https://github.com/DigiGilde/handboek/tree/main');
		await expect(bestanden.getByRole('link', { name: '.schrijver op GitHub' })).toHaveAttribute(
			'href',
			'https://github.com/DigiGilde/handboek/tree/main/.schrijver'
		);
		await expect(bestanden).toContainText(
			'Dat wijzig je met een voorstel in de repository van de site.'
		);
		await expect(bestanden).not.toContainText('configuratierepository');
		await expect(bestanden).toContainText('met "Via GitHub"');
	});

	test('leads to the section of Help that explains the flow', async ({ page }) => {
		await page.goto('/sites/digi-handboek/over');
		await page.evaluate(() => customElements.whenDefined('nldd-page'));
		const navigations = () =>
			page.evaluate(() => performance.getEntriesByType('navigation').length);
		const before = await navigations();
		await inhoud(page).getByRole('link', { name: 'Help', exact: true }).click();
		await expect(page).toHaveURL(/\/help#voorstellen$/);
		expect(await navigations(), 'a navigation inside the app, not a page load').toBe(before);
		await expectScrolledTo(page, 'voorstellen');
	});

	test('can be reached in reading order with the keyboard', async ({ page }) => {
		await page.goto('/sites/digi-handboek/over');
		await page.evaluate(() => customElements.whenDefined('nldd-page'));
		await expect(page.locator('nldd-top-title-bar')).toBeVisible();
		const stops: string[] = [];
		for (let i = 0; i < 14; i++) {
			await page.keyboard.press('Tab');
			stops.push(
				await page.evaluate(() => {
					let active: Element | null = document.activeElement;
					while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
					const link = active?.closest?.('a') ?? active;
					return link?.getAttribute?.('href') ?? link?.getAttribute?.('aria-label') ?? '';
				})
			);
		}
		const reading = [
			'/sites/digi-handboek',
			'https://digihandboek.rijks.app/',
			'/instellingen/sites/digi-handboek',
			'/instellingen',
			'https://github.com/DigiGilde/handboek/tree/main',
			'/help#voorstellen'
		];
		const seen = reading.map((href) => stops.indexOf(href));
		expect(
			seen.every((i) => i >= 0),
			`stops: ${stops.join(' | ')}`
		).toBe(true);
		expect(seen, 'in reading order').toEqual([...seen].sort((a, b) => a - b));
	});
});
