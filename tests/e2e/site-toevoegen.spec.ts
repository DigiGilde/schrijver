import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { als, alsTestgebruiker } from './als';

/*
 * The local preview has three repositories that cannot be a site (MinBZK/elders without the App,
 * DigiGilde/nieuwsbrief without .schrijver/, DigiGilde/intranet with files that are not valid) and
 * two that can: DigiGilde/kennisbank, and DigiGilde/besloten, which is private. Adding them and
 * removing them again leaves the sites as they were. DigiGilde/intern is the site Werkplaats.
 * Oude site is in Schrijver with old files: only platform admins see it. The platform admin is
 * Beheerder Schrijver (SCHRIJVER_BEHEERDERS=platform).
 */
test.describe.configure({ mode: 'serial' });

const repoField = (page: Page) => page.getByRole('textbox', { name: 'Repository op GitHub' });
const status = (page: Page, text: string) =>
	page.locator('p[role="status"]').filter({ hasText: text });
const siteCard = (page: Page, name: string) =>
	page.locator('nldd-card').filter({ has: page.getByRole('heading', { name, level: 2 }) });
const stepTwo = (page: Page) => page.locator('form[action$="/toevoegen"]');

async function check(page: Page, repo: string) {
	await repoField(page).fill(repo);
	await page.getByRole('button', { name: 'Controleer repository' }).click();
}

async function openAdd(page: Page) {
	await page.goto('/instellingen/sites/nieuw');
	await page.evaluate(() => customElements.whenDefined('nldd-step-bar'));
}

test('only a platform admin adds or removes a site', async ({ page }) => {
	await page.goto('/instellingen');
	await expect(
		page.getByText('Je beheert het team en de instellingen van deze site.', { exact: true })
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Site toevoegen' })).toHaveCount(0);
	expect((await page.goto('/instellingen/sites/nieuw'))?.status()).toBe(404);
	await page.goto('/instellingen/sites/digi-handboek');
	await expect(page.getByRole('heading', { level: 2, name: 'Structuur' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Site verwijderen' })).toHaveCount(0);
});

test('Site toevoegen says why a repository cannot be a site', async ({ page }) => {
	await als(page, 'platform');
	await page.goto('/instellingen');
	await page.getByRole('link', { name: 'Site toevoegen' }).click();
	await expect(page).toHaveURL(/\/instellingen\/sites\/nieuw$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Site toevoegen' })).toBeVisible();
	await page.evaluate(() => customElements.whenDefined('nldd-step-bar'));

	await check(page, 'geen repository');
	await expect(
		status(page, 'Een repository schrijf je als eigenaar/naam, zoals DigiGilde/handboek.')
	).toHaveCount(1);
	await expect(repoField(page)).toBeFocused();

	await check(page, 'MinBZK/elders');
	await expect(status(page, 'De Schrijver-app staat niet op MinBZK/elders.')).toHaveCount(1);
	await expect(
		page.getByRole('link', { name: 'Schrijver-app installeren op GitHub' })
	).toHaveAttribute('href', 'https://github.com/apps/schrijver/installations/new');

	await check(page, 'DigiGilde/nieuwsbrief');
	await expect(status(page, 'DigiGilde/nieuwsbrief heeft nog geen map .schrijver.')).toHaveCount(1);
	await expect(
		page.getByRole('link', { name: 'Uitleg over .schrijver bekijken op GitHub' })
	).toHaveAttribute('href', /\/docs\/een-site-aansluiten\.md$/);

	await check(page, 'DigiGilde/intern');
	await expect(status(page, 'DigiGilde/intern hoort al bij de site Werkplaats')).toHaveCount(1);

	await check(page, 'DigiGilde/intranet');
	await expect(
		status(page, 'De structuur in .schrijver van DigiGilde/intranet klopt niet.')
	).toHaveCount(1);
	await expect(
		page.getByText('.schrijver/site.yaml: preview.url: moet {nummer} bevatten')
	).toBeVisible();
	await expect(
		page.getByText('.schrijver/schema.yaml: velden.kleur.type: moet een van deze waarden zijn')
	).toBeVisible();

	await check(page, 'https://github.com/digigilde/handboek');
	await expect(status(page, 'DigiGilde/handboek hoort al bij de site Digi Handboek')).toHaveCount(
		1
	);
	await expect(page.getByRole('link', { name: 'Beheer van Digi Handboek' })).toHaveAttribute(
		'href',
		'/instellingen/sites/digi-handboek'
	);
	await expect(repoField(page)).toHaveValue('https://github.com/digigilde/handboek');
});

test('Site toevoegen adds a site, and Site verwijderen takes it out again', async ({ page }) => {
	await als(page, 'platform');
	await openAdd(page);
	await check(page, 'digigilde/kennisbank');
	await expect(page).toHaveURL(/\?repo=digigilde%2Fkennisbank$/);
	await expect(page.getByRole('heading', { level: 2, name: 'Gegevens van de site' })).toBeVisible();
	await expect(status(page, 'DigiGilde/kennisbank kan een site worden.')).toHaveCount(1);
	await expect(
		page.getByText(
			'De Schrijver-app staat op DigiGilde/kennisbank en de structuur in .schrijver klopt. Schrijver werkt op de standaardbranch main.'
		)
	).toBeVisible();
	await expect(page.locator('nldd-step-bar-item[status="current"]')).toHaveAttribute(
		'text',
		'Gegevens van de site'
	);
	const form = stepTwo(page);
	const id = form.getByRole('textbox', { name: 'Naam in het adres' });
	await expect(id).toHaveValue('kennisbank');
	await expect(form.getByRole('textbox', { name: 'Naam', exact: true })).toHaveValue('Kennisbank');
	await expect(form.getByRole('textbox', { name: /^Omschrijving/ })).toHaveValue(
		'Wat het Digi Gilde weet over werken bij de overheid.'
	);
	await expect(form.getByRole('textbox', { name: /^Adres/ })).toHaveValue(
		'https://kennisbank.example.org/'
	);
	await expect(form.getByRole('radio', { name: 'Ik' })).toBeChecked();
	await expect(form.getByRole('textbox', { name: 'E-mailadres van je collega' })).toHaveCount(0);

	await id.fill('moza-site');
	await form.getByRole('radio', { name: 'Een collega' }).click();
	const email = form.getByRole('textbox', { name: 'E-mailadres van je collega' });
	await form.getByRole('button', { name: 'Voeg site toe' }).click();
	await expect(
		form.getByText('Er is al een site met deze naam in het adres. Kies een andere.')
	).toBeVisible();
	await expect(form.getByText('Een e-mailadres is nodig.')).toBeVisible();
	await expect(status(page, 'Niet alles klopt. Kijk de velden met een melding na.')).toHaveCount(1);
	await expect(id).toBeFocused();

	await id.fill('kennisbank');
	await email.fill('Derde@Example.org');
	await form.getByRole('button', { name: 'Voeg site toe' }).click();
	await expect(page).toHaveURL(/\/instellingen\/sites\/kennisbank\?toegevoegd=1$/);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Beheer van Kennisbank' })
	).toBeVisible();
	await expect(status(page, 'Kennisbank staat nu in Schrijver.')).toHaveCount(1);
	await expect(
		page.locator('nldd-list[accessible-label="Team van Kennisbank"] nldd-list-item').filter({
			hasText: 'Derde Collega'
		})
	).toContainText('Beheerder');
	await expect(page.getByText('inhoud/**/*.md')).toBeVisible();

	// A site everyone can work on now.
	await alsTestgebruiker(page);
	await page.goto('/');
	await expect(siteCard(page, 'Kennisbank')).toHaveAttribute('href', '/sites/kennisbank');
	await page.goto('/sites/kennisbank');
	await expect(page.getByRole('heading', { level: 1, name: 'Kennisbank' })).toBeVisible();

	await als(page, 'platform');
	await page.goto('/instellingen/sites/kennisbank');
	const zone = page.locator('nldd-box[background="critical"]');
	await expect(zone.getByRole('heading', { name: 'Site verwijderen' })).toBeVisible();
	await expect(zone).toContainText(
		"De repository, de pagina's en de voorstellen blijven op GitHub."
	);
	const dialog = page.locator('nldd-modal-dialog[text="Verwijder Kennisbank uit Schrijver?"]');
	await zone.getByRole('button', { name: 'Verwijder site' }).click();
	await expect(dialog).toHaveAttribute('open');
	await expect(dialog).toHaveAttribute(
		'supporting-text',
		'De instellingen, het team en de uitnodigingen gaan weg. Dat kun je niet terugdraaien. De repository en de voorstellen blijven op GitHub.'
	);
	await dialog.getByRole('button', { name: 'Houd de site' }).click();
	await expect(dialog).not.toHaveAttribute('open');
	await expect(page).toHaveURL(/\/instellingen\/sites\/kennisbank$/);

	await zone.getByRole('button', { name: 'Verwijder site' }).click();
	await dialog.getByRole('button', { name: 'Verwijder site' }).click();
	await expect(page).toHaveURL(/\/instellingen\?verwijderd=1$/);
	await expect(status(page, 'De site is uit Schrijver verwijderd.')).toHaveCount(1);
	const sites = page.locator('nldd-list[accessible-label="Sites die je beheert"]');
	await expect(sites.getByRole('link', { name: 'Digi Handboek' })).toBeVisible();
	await expect(sites.getByRole('link', { name: 'Kennisbank' })).toHaveCount(0);
	await page.goto('/');
	await expect(siteCard(page, 'Kennisbank')).toHaveCount(0);
	expect((await page.goto('/sites/kennisbank'))?.status()).toBe(404);
	expect((await page.goto('/instellingen/sites/kennisbank'))?.status()).toBe(404);
});

test('a private repository becomes a site that only its team sees', async ({ page }) => {
	await als(page, 'platform');
	await openAdd(page);
	await check(page, 'DigiGilde/besloten');
	await expect(page.getByRole('heading', { level: 2, name: 'Gegevens van de site' })).toBeVisible();
	const form = stepTwo(page);
	await expect(form.getByText('Alleen het team', { exact: true })).toBeVisible();
	await expect(
		form.getByText(
			'DigiGilde/besloten is niet openbaar op GitHub. Daarom ziet alleen het team de site, en wie met een gekoppeld GitHub-account de repository mag lezen.'
		)
	).toBeVisible();
	await expect(form.getByRole('radio', { name: 'Iedereen die inlogt' })).toHaveCount(0);
	await expect(form.getByRole('radio', { name: 'Ik' })).toBeChecked();
	await expect(
		form.getByText(
			'De beheerder regelt het team en de instellingen van de site. Alleen het team ziet de site: de beheerder voegt de anderen toe.'
		)
	).toBeVisible();

	// Nobody but a platform admin could let in a colleague who never signed in.
	await form.getByRole('radio', { name: 'Een collega' }).click();
	await expect(
		form.getByText(
			'Een collega die al eens heeft ingelogd bij Schrijver: die wordt meteen beheerder. Schrijver stuurt geen e-mail: laat het je collega zelf weten.'
		)
	).toBeVisible();
	const email = form.getByRole('textbox', { name: 'E-mailadres van je collega' });
	await email.fill('nog-nooit-ingelogd@example.org');
	await form.getByRole('button', { name: 'Voeg site toe' }).click();
	await expect(
		form.getByText(
			'Deze collega heeft nog niet ingelogd bij Schrijver. Alleen het team ziet deze site: kies jezelf als eerste beheerder, of een collega die al eens heeft ingelogd.'
		)
	).toBeVisible();
	await expect(email).toBeFocused();

	await form.getByRole('radio', { name: 'Ik' }).click();
	await form.getByRole('button', { name: 'Voeg site toe' }).click();
	await expect(page).toHaveURL(/\/instellingen\/sites\/besloten\?toegevoegd=1$/);
	await expect(
		page.locator('form[action="?/instellingen"]').getByText('Alleen het team', { exact: true })
	).toBeVisible();

	await page.goto('/');
	await expect(siteCard(page, 'Besloten')).toHaveAttribute('href', '/sites/besloten');
	await als(page, 'derde');
	await page.goto('/');
	await expect(siteCard(page, 'MijnOverheid Zakelijk')).toBeVisible();
	await expect(siteCard(page, 'Besloten')).toHaveCount(0);
	expect((await page.goto('/sites/besloten'))?.status()).toBe(404);

	await als(page, 'platform');
	await page.goto('/instellingen/sites/besloten');
	await page
		.locator('nldd-box[background="critical"]')
		.getByRole('button', { name: 'Verwijder site' })
		.click();
	await page
		.locator('nldd-modal-dialog[text="Verwijder Besloten uit Schrijver?"]')
		.getByRole('button', { name: 'Verwijder site' })
		.click();
	await expect(page).toHaveURL(/\/instellingen\?verwijderd=1$/);
	expect((await page.goto('/sites/besloten'))?.status()).toBe(404);
});

test('a site whose files are not valid shows only its admins what is wrong', async ({ page }) => {
	await page.goto('/');
	await expect(siteCard(page, 'Digi Handboek')).toBeVisible();
	await expect(siteCard(page, 'Oude site')).toHaveCount(0);
	expect((await page.goto('/sites/oude-site'))?.status()).toBe(404);

	await als(page, 'platform');
	await page.goto('/');
	const card = siteCard(page, 'Oude site');
	await expect(card).toContainText('De structuur in .schrijver klopt niet');
	await expect(card).toHaveAttribute('href', '/instellingen/sites/oude-site');
	await expect(card).toHaveAttribute('accessible-label', 'Beheer van Oude site');
	await card.click();
	await expect(page).toHaveURL(/\/instellingen\/sites\/oude-site$/);
	await expect(
		page.locator('nldd-banner[text="De structuur in .schrijver klopt niet"]')
	).toHaveAttribute('supporting-text', /Zolang dat zo is, kan niemand de site bewerken/);
	await expect(
		page.getByText(
			'.schrijver/site.yaml: naam: hoort niet meer in dit bestand. Je stelt het in bij Beheer van de site in Schrijver, onder Instellingen van de site.'
		)
	).toBeVisible();
	await expect(page.getByText('.schrijver/schema.yaml: ontbreekt')).toBeVisible();
	await expect(page.getByRole('link', { name: '.schrijver bekijken op GitHub' })).toHaveAttribute(
		'href',
		'https://github.com/DigiGilde/oude-site/tree/main/.schrijver'
	);
});

/**
 * The same exceptions as tests/e2e/beheer.spec.ts, with the step bar of tests/e2e/axe.spec.ts, whose
 * track is a pseudo-element; axe names an item by its reflected href too. In the removal dialog axe
 * takes the wrapped supporting text for partly covered, though nothing covers it (measured by hand,
 * light / dark mode: 11.3:1 / 11.4:1).
 */
const allowedContrast = [
	/^nldd-modal-dialog(:nth-child\(\d+\))?,nldd-inline-dialog,\.inline-dialog__supporting-text$/,
	/^(nldd-top-title-bar|\.optisch),nldd-button(\[start-icon="chevron-left"\])?,\.button__text$/,
	/^nldd-step-bar-item\[(status="current"|text="[^"]+"|href="[^"]*")\],\.step-bar__item-(number|title)$/,
	/^nldd-status-bar,\.status-bar__text$/,
	/^\.woord$/,
	/^(nldd-button|\.menuknop),\.button__text$/
];

async function axe(page: Page) {
	await page.waitForLoadState('networkidle');
	const height = await page.evaluate(() => document.documentElement.scrollHeight);
	await page.setViewportSize({ width: 1280, height });
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(result.violations, JSON.stringify(result.violations, null, 1)).toEqual([]);
	const contrast = result.incomplete
		.filter((rule) => rule.id === 'color-contrast')
		.flatMap((rule) => rule.nodes.map((node) => node.target.join(',')))
		.filter((target) => !allowedContrast.some((allowed) => allowed.test(target)));
	expect(contrast, 'unreviewed color-contrast results').toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
	test(`axe finds nothing on Site toevoegen and on a site with a problem, ${colorScheme} mode`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme });
		await als(page, 'platform');
		await openAdd(page);
		await check(page, 'DigiGilde/intranet');
		await expect(status(page, 'klopt niet')).toHaveCount(1);
		await axe(page);

		await page.setViewportSize({ width: 1280, height: 800 });
		await check(page, 'DigiGilde/kennisbank');
		await expect(
			page.getByRole('heading', { level: 2, name: 'Gegevens van de site' })
		).toBeVisible();
		await stepTwo(page).getByRole('radio', { name: 'Een collega' }).click();
		await stepTwo(page).getByRole('button', { name: 'Voeg site toe' }).click();
		await expect(stepTwo(page).getByText('Een e-mailadres is nodig.')).toBeVisible();
		await axe(page);

		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/instellingen/sites/oude-site');
		await expect(page.getByRole('heading', { level: 2, name: 'Structuur' })).toBeVisible();
		await axe(page);

		const dialog = page.locator('nldd-modal-dialog[text="Verwijder Oude site uit Schrijver?"]');
		await page
			.locator('nldd-box[background="critical"]')
			.getByRole('button', { name: 'Verwijder site' })
			.click();
		await expect(dialog).toHaveAttribute('open');
		// The dialog fades in; mid-way its text has no contrast yet.
		await page.waitForFunction(() => {
			const shown = document
				.querySelector('nldd-modal-dialog[open]')
				?.shadowRoot?.querySelector('dialog');
			return (
				!!shown?.open &&
				shown.getAnimations({ subtree: true }).length === 0 &&
				getComputedStyle(shown).opacity === '1'
			);
		});
		await axe(page);
		await page.keyboard.press('Escape');
		await expect(dialog).not.toHaveAttribute('open');
	});
}
