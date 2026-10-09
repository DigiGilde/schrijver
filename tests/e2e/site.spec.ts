import { expect, test, type Page } from '@playwright/test';

/** Tabs and rows are found by their host: they are slotted into it, so not descendants of its landmark or list. */
const tabs = (page: Page) =>
	page.locator('nldd-tab-bar[accessible-label="Onderdelen van de site"]');
const list = (page: Page, label: string) => page.locator(`nldd-list[accessible-label="${label}"]`);

const FILTERS = [
	{
		value: 'alle',
		radio: /^Alle voorstellen/,
		label: 'Alle voorstellen',
		empty: 'Er zijn geen open voorstellen.'
	},
	{
		value: 'beoordelen',
		radio: /^Te beoordelen/,
		label: 'Te beoordelen',
		empty: 'Er wachten geen voorstellen op de redactie.'
	},
	{
		value: 'mijn',
		radio: /^Mijn voorstellen/,
		label: 'Mijn voorstellen',
		empty: 'Je hebt geen open voorstellen.'
	}
];
/** The line under the filter. A status is found by its role: its host is not a descendant of main. */
const resultLine = (page: Page) => page.getByRole('status').filter({ hasText: /voorstel/ });

/** Saves an edit of a Digi Handboek page as a proposal and sends it in; these pages are this file's own. */
async function sendIn(page: Page, path: string, text: string): Promise<string> {
	await page.goto(`/sites/digi-handboek/bewerken/${path}`);
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(`\n\n${text}`);
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const saved = page.getByText(/Concept bewaard als voorstel #\d+/).first();
	await expect(saved).toBeVisible();
	const nummer = (await saved.textContent())!.match(/#(\d+)/)![1];
	await page.goto(`/sites/digi-handboek/voorstellen/${nummer}`);
	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(page.locator('nldd-badge[text="Ingestuurd"]')).toBeVisible();
	return nummer;
}

test('a site has three tabs, each at its own address', async ({ page }) => {
	await page.goto('/sites/moza-site');
	const bar = tabs(page);
	const paginas = bar.getByRole('link', { name: "Pagina's" });
	const voorstellen = bar.getByRole('link', { name: 'Voorstellen' });
	const over = bar.getByRole('link', { name: 'Over deze site' });
	await expect(paginas).toHaveAttribute('aria-current', 'page');

	await voorstellen.click();
	await expect(page).toHaveURL(/\/sites\/moza-site\/voorstellen$/);
	await expect(voorstellen).toHaveAttribute('aria-current', 'page');
	await expect(paginas).not.toHaveAttribute('aria-current', 'page');
	await expect(page.getByRole('radio', { name: 'Mijn voorstellen' })).toBeChecked();

	await over.click();
	await expect(page).toHaveURL(/\/sites\/moza-site\/over$/);
	await expect(over).toHaveAttribute('aria-current', 'page');
	await expect(
		page.getByRole('heading', { name: 'Zo komt een wijziging op de site', level: 2 })
	).toBeVisible();

	await paginas.click();
	await expect(page).toHaveURL(/\/sites\/moza-site$/);
	await expect(list(page, "Pagina's")).toBeVisible();
});

test('under the site name are its description and public address, not the repository', async ({
	page
}) => {
	await page.goto('/sites/moza-site');
	await expect(
		page.getByRole('heading', { name: 'MijnOverheid Zakelijk', level: 1 })
	).toBeVisible();
	await expect(
		page.getByText(
			'Een overheidsbrede samenwerking om de dienstverlening voor ondernemers te verbeteren.'
		)
	).toBeVisible();
	await expect(page.getByRole('link', { name: /^mijnoverheidzakelijk\.nl/ })).toHaveAttribute(
		'href',
		'https://mijnoverheidzakelijk.nl/'
	);
	await expect(page.getByText('MinBZK/moza-site')).toHaveCount(0);
});

test('Nieuwe pagina and the page list are one block, one section padding below the tabs', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek');
	await expect(
		page.locator('nldd-sidebar-section > [slot="header"] nldd-button[text="Nieuwe pagina"]')
	).toHaveAttribute('href', '/sites/digi-handboek/nieuw');
	await page.evaluate(() => customElements.whenDefined('nldd-sidebar-section'));
	const kop = page.getByRole('heading', { name: "Pagina's", level: 2 });
	// A section pads 48 px at this width; two stacked paddings would leave 96 px.
	await expect
		.poll(async () => {
			const bar = (await tabs(page).boundingBox())!;
			return (await kop.boundingBox())!.y - (bar.y + bar.height);
		})
		.toBeLessThan(64);
});

test('the Voorstellen tab counts what waits for the editors', async ({ page }) => {
	await sendIn(page, 'onboarding/dev-machine.md', 'Telt mee voor de redactie');
	await page.goto('/sites/digi-handboek');
	const voorstellen = tabs(page).getByRole('link', { name: /^Voorstellen/ });
	await expect(voorstellen).toHaveText(/^\s*Voorstellen \(\d+\)\s*$/);
	await expect(voorstellen).toHaveAccessibleName(
		/^Voorstellen, \d+ (wacht|wachten) op beoordeling$/
	);
	await expect(voorstellen).toHaveAttribute(
		'href',
		'/sites/digi-handboek/voorstellen?filter=beoordelen'
	);
	await voorstellen.click();
	await expect(page.getByRole('radio', { name: /^Te beoordelen \(\d+\)$/ })).toBeChecked();
	await expect(
		list(page, 'Te beoordelen')
			.getByRole('link', { name: /Wacht op beoordeling door de redactie/ })
			.first()
	).toBeVisible();

	await page.goto('/sites/moza-site');
	const gewoon = tabs(page).getByRole('link', { name: /^Voorstellen/ });
	await expect(gewoon).toHaveAccessibleName('Voorstellen');
	await expect(gewoon).toHaveAttribute('href', '/sites/moza-site/voorstellen');
});

test('an old ?tab= link opens the proposals tab with the same filter', async ({
	page,
	request
}) => {
	const res = await request.get('/sites/digi-handboek?tab=alle', { maxRedirects: 0 });
	expect(res.status()).toBe(308);
	expect(res.headers()['location']).toBe('/sites/digi-handboek/voorstellen?filter=alle');

	await page.goto('/sites/digi-handboek?tab=alle');
	await expect(page).toHaveURL(/\/sites\/digi-handboek\/voorstellen\?filter=alle$/);
	await expect(page.getByRole('radio', { name: 'Alle voorstellen' })).toBeChecked();

	await page.goto('/sites/moza-site?tab=beoordelen');
	await expect(page).toHaveURL(/\/sites\/moza-site\/voorstellen\?filter=beoordelen$/);
	await expect(page.getByRole('radio', { name: 'Mijn voorstellen' })).toBeChecked();
	await expect(page.getByRole('radio', { name: /Te beoordelen/ })).toHaveCount(0);
});

test('a proposal row says where it stands and what comes next', async ({ page }) => {
	const nummer = await sendIn(page, 'onboarding/eerste-dagen.md', 'Een rij met uitleg');
	await page.goto('/sites/digi-handboek/voorstellen?filter=alle');
	const rows = list(page, 'Alle voorstellen');

	const seeded = rows.getByRole('link', { name: /^Voorbeeldvoorstel Digi Handboek/ });
	await expect(seeded).toHaveAccessibleName(
		/^Voorbeeldvoorstel Digi Handboek Nog niet ingestuurd, alleen zichtbaar als voorstel · Bijgewerkt \d{1,2} [a-z]+( \d{4})? Concept$/
	);
	const sent = rows.locator(`a[href="/sites/digi-handboek/voorstellen/${nummer}?filter=alle"]`);
	await expect(sent).toHaveAccessibleName(
		/ Wacht op beoordeling door de redactie · Bijgewerkt \d{1,2} [a-z]+( \d{4})? Ingestuurd$/
	);

	// One destination and at most one shortcut: the chevron only ends a row that has no shortcut.
	for (const segment of await rows.locator('nldd-list-item-segment[width="full"]').all()) {
		await expect(segment.locator('nldd-icon-cell')).toHaveCount(0);
	}
	for (const row of await rows.locator('nldd-list-item[href]').all()) {
		await expect(row.locator('> nldd-icon-cell:last-child')).toHaveAttribute(
			'icon',
			'chevron-right'
		);
	}
});

test('choosing a filter shows it at once and keeps it in the address', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	const loads = await page.evaluate(() => performance.getEntriesByType('navigation').length);
	await page.getByRole('radio', { name: 'Alle voorstellen' }).click();
	await expect(list(page, 'Alle voorstellen')).toBeVisible();
	await expect(page).toHaveURL(/\/voorstellen\?filter=alle$/);
	expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(loads);

	await page.reload();
	await expect(page.getByRole('radio', { name: 'Alle voorstellen' })).toBeChecked();
});

test('a chosen filter shows before its page data has arrived', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	let release = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route(/\/voorstellen\/__data\.json/, async (route) => {
		await held;
		await route.continue();
	});
	await page.getByRole('radio', { name: 'Alle voorstellen' }).click();
	await expect(list(page, 'Alle voorstellen')).toBeVisible();

	release();
	await expect(page).toHaveURL(/\/voorstellen\?filter=alle$/);
});

test('choosing a filter leaves the focus on its radio', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	const radio = page.getByRole('radio', { name: 'Alle voorstellen' });
	await radio.click();
	await expect(page).toHaveURL(/\/voorstellen\?filter=alle$/);
	await expect(radio).toBeFocused();
});

test('choosing a filter says in one status line how many proposals it shows', async ({ page }) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	const line = resultLine(page);
	await expect(line).toHaveCount(1);
	const element = await line.elementHandle();
	for (const { radio, label, empty } of FILTERS) {
		await page.getByRole('radio', { name: radio }).click();
		await expect(list(page, label)).toBeVisible();
		const rows = await list(page, label).locator('nldd-list-item').count();
		await expect(line).toHaveText(
			rows === 0 ? empty : `${label}: ${rows} ${rows === 1 ? 'voorstel' : 'voorstellen'}`
		);
	}
	expect(await element!.evaluate((node) => node.isConnected), 'the line stays in place').toBe(true);
});

test('a filter without proposals says so in the status line', async ({ page }) => {
	// A navigation within the app asks for the page data: answer it as if nothing were open.
	await page.route(/\/voorstellen\/__data\.json/, async (route) => {
		const response = await route.fetch();
		const body = await response.json();
		for (const node of body.nodes) {
			const root = node.data?.[0];
			if (root && 'proposals' in root) node.data[root.proposals] = [];
		}
		await route.fulfill({
			status: response.status(),
			contentType: 'application/json',
			body: JSON.stringify(body)
		});
	});
	await page.goto('/sites/digi-handboek');
	await page.evaluate(() => customElements.whenDefined('nldd-tab-bar-item'));
	await tabs(page)
		.getByRole('link', { name: /^Voorstellen/ })
		.click();
	await expect(page).toHaveURL(/\/voorstellen/);
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	for (const { value, radio, empty } of FILTERS) {
		await page.getByRole('radio', { name: radio }).click();
		await expect(resultLine(page)).toHaveText(empty);
		await expect(page).toHaveURL(new RegExp(`/voorstellen\\?filter=${value}$`));
	}
});

test('a proposal row carries its filter, and back from the proposal returns to it', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	await page.getByRole('radio', { name: 'Alle voorstellen' }).click();
	const row = list(page, 'Alle voorstellen').getByRole('link', {
		name: /^Voorbeeldvoorstel Digi Handboek/
	});
	await expect(row).toHaveAttribute('href', /\/voorstellen\/\d+\?filter=alle$/);
	await row.click();
	await expect(page).toHaveURL(/\/voorstellen\/\d+\?filter=alle$/);

	await page.getByRole('link', { name: 'Digi Handboek', exact: true }).click();
	await expect(page).toHaveURL(/\/voorstellen\?filter=alle$/);
	await expect(page.getByRole('radio', { name: 'Alle voorstellen' })).toBeChecked();
});

test("the browser's Back from a proposal returns to the filter that was chosen", async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	await page.getByRole('radio', { name: 'Alle voorstellen' }).click();
	await expect(page).toHaveURL(/\/voorstellen\?filter=alle$/);
	const row = list(page, 'Alle voorstellen').getByRole('link', {
		name: /^Voorbeeldvoorstel Digi Handboek/
	});
	await row.click();
	await expect(page).toHaveURL(/\/voorstellen\/\d+\?filter=alle$/);

	await page.goBack();
	await expect(page).toHaveURL(/\/voorstellen\?filter=alle$/);
	await expect(page.getByRole('radio', { name: 'Alle voorstellen' })).toBeChecked();
	await expect(row).toBeVisible();
});

test('the Voorstellen tab link shows its own filter from a list that shows another one', async ({
	page
}) => {
	await sendIn(page, 'over/privacy.md', 'Een tab met een eigen filter');
	await page.goto('/sites/digi-handboek/voorstellen?filter=mijn');
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	await page.getByRole('radio', { name: 'Alle voorstellen' }).click();
	await expect(page).toHaveURL(/\/voorstellen\?filter=alle$/);

	await tabs(page)
		.getByRole('link', { name: /^Voorstellen/ })
		.click();
	await expect(page).toHaveURL(/\/voorstellen\?filter=beoordelen$/);
	await expect(page.getByRole('radio', { name: /^Te beoordelen/ })).toBeChecked();
	await expect(list(page, 'Te beoordelen')).toBeVisible();
});

test('back from a proposal opened without a filter goes where the Voorstellen tab goes', async ({
	page
}) => {
	const nummer = await sendIn(page, 'kennis/reservation-bot.md', 'Terug naar de lijst');
	await page.getByRole('link', { name: 'Digi Handboek', exact: true }).click();
	await expect(page).toHaveURL(/\/voorstellen\?filter=beoordelen$/);
	await expect(page.getByRole('radio', { name: /^Te beoordelen/ })).toBeChecked();

	// A filter that was chosen beats that default, though something still waits.
	await page.evaluate(() => customElements.whenDefined('nldd-toggle-button'));
	await page.getByRole('radio', { name: /^Mijn voorstellen/ }).click();
	await list(page, 'Mijn voorstellen')
		.locator(`a[href^="/sites/digi-handboek/voorstellen/${nummer}?"]`)
		.click();
	await expect(page).toHaveURL(new RegExp(`/voorstellen/${nummer}\\?filter=mijn$`));
	await page.getByRole('link', { name: 'Digi Handboek', exact: true }).click();
	await expect(page).toHaveURL(/\/voorstellen\?filter=mijn$/);
	await expect(page.getByRole('radio', { name: /^Mijn voorstellen/ })).toBeChecked();
});

test('the about page explains the flow and names the redactie', async ({ page }) => {
	await page.goto('/sites/digi-handboek/over');
	await expect(tabs(page).getByRole('link', { name: 'Over deze site' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const tekst = page.locator('nldd-simple-section nldd-rich-text');
	for (const adres of ['naam@rijksoverheid.nl', 'test@example.org']) {
		await expect(tekst.getByRole('link', { name: adres })).toHaveAttribute(
			'href',
			`mailto:${adres}`
		);
	}
	await expect(
		tekst.getByText('iedereen met schrijfrechten op de repository op GitHub.')
	).toBeVisible();
	await expect(
		tekst.getByText(
			'Goedkeuren gebeurt op GitHub: door de redactie (naam@rijksoverheid.nl en test@example.org) met een GitHub-account, of door iemand met schrijfrechten op de repository.'
		)
	).toBeVisible();
	await expect(tekst.getByText('Op naam', { exact: true })).toBeVisible();
	await expect(
		tekst.getByText(
			'dan ondertekent Schrijver hier met minder gegevens van jou, bijvoorbeeld anoniem.'
		)
	).toBeVisible();
	await expect(tekst.getByRole('link', { name: 'Instellingen' })).toHaveAttribute(
		'href',
		'/instellingen'
	);
	await expect(
		page.getByRole('heading', { name: 'Concepten zijn openbaar', level: 2 })
	).toBeVisible();
	await expect(
		tekst.getByRole('link', { name: 'DigiGilde/handboek, branch main' })
	).toHaveAttribute('href', 'https://github.com/DigiGilde/handboek/tree/main');
	await expect(
		tekst.getByText(/configuratierepository example\/config, die niet openbaar is\./)
	).toBeVisible();
	await expect(tekst.getByRole('link', { name: /example\/config/ })).toHaveCount(0);

	await page.goto('/sites/moza-site/over');
	await expect(tekst.getByRole('link', { name: 'redactie@example.org' })).toBeVisible();
	await expect(tekst.getByText('Gekoppeld aan GitHub', { exact: true })).toBeVisible();
	await expect(tekst.getByText('Op naam', { exact: true })).toHaveCount(0);
	await expect(
		page.getByRole('heading', {
			name: 'Een voorstel krijgt een voorbeeld zodra het is ingestuurd',
			level: 2
		})
	).toBeVisible();
});

test.describe('on a 320 px screen', () => {
	test.use({ viewport: { width: 320, height: 800 } });

	test('the tabs fit because the last one takes its short name', async ({ page }) => {
		await page.goto('/sites/moza-site/over');
		const over = tabs(page).getByRole('link', { name: 'Over', exact: true });
		await expect(over).toHaveAttribute('aria-current', 'page');
		const bar = (await tabs(page).boundingBox())!;
		expect(bar.x + bar.width).toBeLessThanOrEqual(320);
		const truncated = await tabs(page).evaluate((host) =>
			[...host.querySelectorAll('nldd-tab-bar-item')].some((item) => {
				const text = item.shadowRoot?.querySelector('.tab-bar__item-text');
				return !!text && text.scrollWidth > text.clientWidth;
			})
		);
		expect(truncated, 'a tab label is cut off').toBe(false);
	});
});
