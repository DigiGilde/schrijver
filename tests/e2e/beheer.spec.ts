import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { als, alsTestgebruiker } from './als';

/*
 * The local preview seeds Digi Handboek with the test user as beheerder and an open invitation for
 * naam@rijksoverheid.nl, and MOZa with Tweede Collega (collega@example.org) as its only beheerder.
 * The platform admin is Beheerder Schrijver (SCHRIJVER_BEHEERDERS=platform). Each test leaves the
 * team as it found it. The rows, dialogs and their buttons live in shadow roots: locate them from
 * the hosts.
 */
const DH = '/instellingen/sites/digi-handboek';
const MOZA = '/instellingen/sites/moza-site';

async function open(page: Page, path: string) {
	await page.goto(path);
	await page.evaluate(() => customElements.whenDefined('nldd-list'));
	await expect(page.locator('nldd-sheet')).toHaveCount(1);
}

/** Acts as Tweede Collega, through the development-only switch. */
async function asCollega(page: Page) {
	await page
		.context()
		.addCookies([{ name: 'schrijver_test_als', value: 'collega', domain: 'localhost', path: '/' }]);
}

const team = (page: Page) => page.locator('nldd-list[accessible-label^="Team van"]');
const row = (page: Page, text: string) =>
	team(page).locator('nldd-list-item').filter({ hasText: text });
const member = (page: Page, name: string) =>
	team(page).getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });
const sheet = (page: Page) => page.locator('nldd-sheet');
const sheetOpen = (page: Page) => page.locator('nldd-sheet[open]');
const confirmation = (page: Page) => page.locator('nldd-modal-dialog');
const addForm = (page: Page) => page.locator('form[action="?/toevoegen"]');
const settingsForm = (page: Page) => page.locator('form[action="?/instellingen"]');
const status = (page: Page, text: string) =>
	page.locator('p[role="status"]').filter({ hasText: text });

async function add(
	page: Page,
	email: string,
	rol: 'Bijdrager' | 'Redactie' | 'Beheerder' = 'Redactie'
) {
	await addForm(page).getByRole('textbox', { name: 'E-mailadres' }).fill(email);
	await addForm(page)
		.getByRole('radio', { name: new RegExp(`^${rol}:`) })
		.click();
	await addForm(page).getByRole('button', { name: 'Voeg toe' }).click();
}

test('the beheer page shows the team, an open invitation and the GitHub rule', async ({ page }) => {
	await open(page, DH);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Beheer van Digi Handboek' })
	).toBeVisible();
	await expect(row(page, 'Test Gebruiker (jij)')).toContainText('Beheerder');
	await expect(row(page, 'naam@rijksoverheid.nl')).toContainText('Uitgenodigd, nog niet ingelogd');
	await expect(
		page.getByText(
			"Collega's met schrijfrechten op de repository op GitHub horen ook bij de redactie; met beheerrechten daar zijn ze beheerder."
		)
	).toBeVisible();
	await expect(
		page.getByRole('heading', { level: 2, name: 'Instellingen van de site' })
	).toBeVisible();
});

test('a known colleague is added at once, gets another role in a sheet and is removed after a confirmation', async ({
	page
}) => {
	await open(page, DH);
	await add(page, 'Collega@Example.org');
	await expect(
		status(page, 'Tweede Collega hoort nu bij het team, als lid van de redactie.')
	).toHaveCount(1);
	// Ready for the next colleague.
	await expect(addForm(page).getByRole('textbox', { name: 'E-mailadres' })).toBeFocused();
	await expect(
		page.locator(
			'nldd-banner[supporting-text="Schrijver stuurt geen e-mail: laat het je collega zelf weten."]'
		)
	).toBeVisible();
	await expect(row(page, 'Tweede Collega')).toContainText('Redactie');

	await member(page, 'Tweede Collega').click();
	await expect(sheetOpen(page)).toHaveCount(1);
	await expect(sheet(page).getByRole('radio', { name: /^Redactie:/ })).toBeChecked();
	await sheet(page)
		.getByRole('radio', { name: /^Beheerder:/ })
		.click();
	await sheet(page).getByRole('button', { name: 'Bewaar' }).click();
	await expect(sheetOpen(page)).toHaveCount(0);
	await expect(status(page, 'Tweede Collega is nu beheerder.')).toHaveCount(1);
	await expect(row(page, 'Tweede Collega')).toContainText('Beheerder');

	await member(page, 'Tweede Collega').click();
	await expect(
		sheet(page).getByText(
			'Tweede Collega beslist dan niet meer over voorstellen van Digi Handboek, tenzij die schrijfrechten heeft op de repository op GitHub.'
		)
	).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Haal uit het team' }).click();
	await expect(confirmation(page)).toHaveAttribute('text', 'Haal Tweede Collega uit het team?');
	await confirmation(page).getByRole('button', { name: 'Houd in het team' }).click();
	await expect(confirmation(page)).not.toHaveAttribute('open');
	await expect(row(page, 'Tweede Collega')).toHaveCount(1);
	await sheet(page).getByRole('button', { name: 'Haal uit het team' }).click();
	await confirmation(page).getByRole('button', { name: 'Haal uit het team' }).click();
	await expect(sheetOpen(page)).toHaveCount(0);
	await expect(row(page, 'Tweede Collega')).toHaveCount(0);
	await expect(status(page, 'Tweede Collega hoort niet meer bij het team.')).toHaveCount(1);
});

test('an unknown address is invited, and Intrekken takes the invitation back by keyboard', async ({
	page
}) => {
	await open(page, DH);
	const field = addForm(page).getByRole('textbox', { name: 'E-mailadres' });
	await field.fill('nieuw-lid@example.org');
	await addForm(page)
		.getByRole('radio', { name: /^Beheerder:/ })
		.click();
	await addForm(page).getByRole('button', { name: 'Voeg toe' }).focus();
	await page.keyboard.press('Enter');
	await expect(status(page, 'nieuw-lid@example.org is uitgenodigd als beheerder.')).toHaveCount(1);
	await expect(field).toBeFocused();
	await expect(page.locator('nldd-banner[supporting-text*="geldt 30 dagen"]')).toBeVisible();
	const invitation = row(page, 'nieuw-lid@example.org');
	await expect(invitation).toContainText('Uitgenodigd, nog niet ingelogd');
	// A control in the row, not a link: an icon with plain text, no accent colour.
	const intrekken = invitation.locator('nldd-list-item-segment[button]');
	await expect(intrekken.locator('nldd-icon-cell')).toHaveAttribute('icon', 'trash');
	await expect(intrekken.locator('nldd-text-cell')).toHaveAttribute('text', 'Intrekken');
	await expect(intrekken.locator('nldd-text-cell')).not.toHaveAttribute('color', /.+/);

	await team(page)
		.getByRole('button', { name: 'Intrekken: de uitnodiging voor nieuw-lid@example.org' })
		.focus();
	await page.keyboard.press('Enter');
	await expect(invitation).toHaveCount(0);
	await expect(
		status(page, 'De uitnodiging voor nieuw-lid@example.org is ingetrokken.')
	).toHaveCount(1);
});

test('an address that is not one is refused in Dutch, with the focus on the field', async ({
	page
}) => {
	await open(page, DH);
	await add(page, 'geen adres');
	const field = addForm(page).getByRole('textbox', { name: 'E-mailadres' });
	await expect(
		addForm(page).getByText('Een e-mailadres heeft de vorm naam@organisatie.nl.')
	).toBeVisible();
	await expect(field).toBeFocused();
	await expect(row(page, 'geen adres')).toHaveCount(0);
});

test('the last beheerder of a site cannot step down or leave, and hears why', async ({ page }) => {
	await asCollega(page);
	await open(page, MOZA);
	await member(page, 'Tweede Collega (jij)').click();
	await sheet(page)
		.getByRole('radio', { name: /^Redactie:/ })
		.click();
	await sheet(page).getByRole('button', { name: 'Bewaar' }).click();
	const refusal =
		'Je bent de enige beheerder van MijnOverheid Zakelijk. Een site heeft altijd een beheerder: maak eerst iemand anders beheerder.';
	await expect(sheet(page).locator(`nldd-banner[text="${refusal}"]`)).toBeVisible();
	await expect(sheet(page).locator('p[role="status"]')).toHaveText(refusal);

	await sheet(page).getByRole('button', { name: 'Haal uit het team' }).click();
	await expect(confirmation(page)).toHaveAttribute('text', 'Haal jezelf uit het team?');
	const answer = page.waitForResponse((r) => r.url().includes('/verwijderen'));
	await confirmation(page).getByRole('button', { name: 'Haal uit het team' }).click();
	expect((await answer).status()).toBe(200);
	await expect(sheet(page).locator(`nldd-banner[text="${refusal}"]`)).toBeVisible();
	await expect(sheet(page).locator('p[role="status"]')).toHaveText(refusal);
	await expect(confirmation(page)).not.toHaveAttribute('open');
	await expect(sheetOpen(page)).toHaveCount(1);
	await expect(sheet(page).getByRole('button', { name: 'Haal uit het team' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(sheetOpen(page)).toHaveCount(0);
	await expect(row(page, 'Tweede Collega (jij)')).toContainText('Beheerder');
});

test('a site admin manages only their own sites; anyone else gets the page that does not exist', async ({
	page
}) => {
	await asCollega(page);
	await page.goto('/instellingen');
	await expect(
		page.getByText('Je beheert het team en de instellingen van deze sites.', { exact: true })
	).toBeVisible();
	const sites = page.locator('nldd-list[accessible-label="Sites die je beheert"]');
	await expect(sites.getByRole('link')).toHaveCount(2);
	await expect(sites.getByRole('link', { name: 'MijnOverheid Zakelijk' })).toBeVisible();
	await expect(sites.getByRole('link', { name: 'Werkplaats' })).toBeVisible();
	await expect(
		page.getByText(
			'Je kenmerk bij SSO Rijk: collega. Een beheerder van Schrijver kan je hierom vragen.'
		)
	).toBeVisible();

	const response = await page.goto(DH);
	expect(response?.status()).toBe(404);
	await expect(page.getByText('Deze pagina bestaat niet')).toBeVisible();
});

test('the settings of the site are checked on the server and saved', async ({ page }) => {
	await open(page, DH);
	const form = settingsForm(page);
	const naam = form.getByRole('textbox', { name: 'Naam' });
	const adres = form.getByRole('textbox', { name: /^Adres/ });
	await naam.fill('');
	await adres.fill('ftp://example.org');
	await form.getByRole('button', { name: 'Bewaar' }).click();
	await expect(form.getByText('Een naam is nodig.')).toBeVisible();
	await expect(
		form.getByText('Een adres begint met https:// of http://, zoals https://example.org.')
	).toBeVisible();
	await expect(naam).toBeFocused();

	await naam.fill('Digi Handboek bewerkt');
	await adres.fill('https://digihandboek.rijks.app/');
	const vierOgen = form.getByRole('switch', { name: 'Vier ogen' });
	const vierOgenAan = await vierOgen.isChecked();
	await vierOgen.click();
	await form.getByRole('checkbox', { name: 'Op naam' }).click();
	await form.getByRole('button', { name: 'Bewaar' }).focus();
	await page.keyboard.press('Enter');
	await expect(status(page, 'De instellingen van de site zijn bewaard.')).toHaveCount(1);
	await expect(form.getByRole('button', { name: 'Bewaar' })).toBeFocused();
	await expect(
		page.getByRole('heading', { level: 1, name: 'Beheer van Digi Handboek bewerkt' })
	).toBeVisible();

	await page.reload();
	await page.evaluate(() => customElements.whenDefined('nldd-switch-field'));
	await expect(vierOgen).toBeChecked({ checked: !vierOgenAan });
	await expect(form.getByRole('checkbox', { name: 'Op naam' })).not.toBeChecked();
	await expect(form.getByRole('checkbox', { name: 'Gekoppeld aan GitHub' })).toBeChecked();
	await expect(page.getByText('Anoniem kan altijd. Wat mag hier nog meer?')).toBeVisible();

	await naam.fill('Digi Handboek');
	await form.getByRole('switch', { name: 'Vier ogen' }).click();
	await form.getByRole('checkbox', { name: 'Op naam' }).click();
	await form.getByRole('button', { name: 'Bewaar' }).click();
	await expect(
		page.getByRole('heading', { level: 1, name: 'Beheer van Digi Handboek' })
	).toBeVisible();
});

test('a bijdrager is added like the other roles; where everyone sees the site, everyone makes proposals', async ({
	page
}) => {
	await open(page, DH);
	await expect(
		addForm(page).getByText('Op deze site kan iedereen die inlogt al voorstellen maken.')
	).toBeVisible();
	await add(page, 'derde@example.org', 'Bijdrager');
	await expect(status(page, 'Derde Collega hoort nu bij het team, als bijdrager.')).toHaveCount(1);
	await expect(row(page, 'Derde Collega')).toContainText('Bijdrager');

	await member(page, 'Derde Collega').click();
	await expect(sheet(page).getByRole('radio', { name: /^Bijdrager:/ })).toBeChecked();
	await expect(
		sheet(page).getByText(
			'Derde Collega kan dan nog steeds voorstellen maken, zoals iedereen die inlogt.'
		)
	).toBeVisible();
	await sheet(page).getByRole('button', { name: 'Haal uit het team' }).click();
	await confirmation(page).getByRole('button', { name: 'Haal uit het team' }).click();
	await expect(row(page, 'Derde Collega')).toHaveCount(0);
});

test('Alleen het team closes a site to anyone outside its team, and Iedereen die inlogt opens it again', async ({
	page
}) => {
	const choose = async (zichtbaar: string) => {
		await open(page, DH);
		const form = settingsForm(page);
		await form.getByRole('radio', { name: zichtbaar }).click();
		await form.getByRole('button', { name: 'Bewaar' }).click();
		await expect(status(page, 'De instellingen van de site zijn bewaard.')).toHaveCount(1);
		await expect(form.getByRole('radio', { name: zichtbaar })).toBeChecked();
	};
	await open(page, DH);
	await expect(
		settingsForm(page).getByRole('radio', { name: 'Iedereen die inlogt' })
	).toBeChecked();
	await choose('Alleen het team');
	await expect(
		page.locator('nldd-text').filter({ hasText: 'Alleen het team ziet de site.' })
	).toBeVisible();
	await expect(
		addForm(page).getByText('Op deze site kan iedereen die inlogt al voorstellen maken.')
	).toHaveCount(0);

	await als(page, 'derde');
	expect((await page.goto('/sites/digi-handboek'))?.status()).toBe(404);
	await page.goto('/');
	await expect(
		page.getByRole('heading', { level: 2, name: 'MijnOverheid Zakelijk' })
	).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Digi Handboek' })).toHaveCount(0);

	await alsTestgebruiker(page);
	await choose('Iedereen die inlogt');
	await als(page, 'derde');
	expect((await page.goto('/sites/digi-handboek'))?.status()).toBe(200);
});

test('on a private repository only the team sees the site, which its admins cannot change', async ({
	page
}) => {
	await asCollega(page);
	await open(page, '/instellingen/sites/werkplaats');
	const form = settingsForm(page);
	await expect(form.getByText('Alleen het team', { exact: true })).toBeVisible();
	await expect(
		form.getByText(
			'De repository op GitHub is niet openbaar. Daarom ziet alleen het team de site, en wie de repository op GitHub mag lezen.'
		)
	).toBeVisible();
	await expect(form.getByRole('radio', { name: 'Iedereen die inlogt' })).toHaveCount(0);
	await expect(row(page, 'Test Gebruiker')).toContainText('Bijdrager');
	await expect(
		page.getByText(
			"Collega's met leesrechten op de repository op GitHub zien de site ook; met schrijfrechten horen ze bij de redactie, met beheerrechten zijn ze beheerder."
		)
	).toBeVisible();

	await form.getByRole('button', { name: 'Bewaar' }).click();
	await expect(status(page, 'De instellingen van de site zijn bewaard.')).toHaveCount(1);
	await expect(form.getByText('Alleen het team', { exact: true })).toBeVisible();
});

test('the keyboard opens a member in the sheet and Escape brings the focus back to the row', async ({
	page
}) => {
	await open(page, DH);
	const first = member(page, 'Test Gebruiker (jij)');
	await first.focus();
	await page.keyboard.press('Enter');
	await expect(sheetOpen(page)).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(sheetOpen(page)).toHaveCount(0);
	await expect(first).toBeFocused();
});

/**
 * The same exceptions as tests/e2e/axe.spec.ts: pseudo-elements and the sticky header that axe
 * cannot resolve. On the page and in the sheet axe takes two wrapped texts for partly covered,
 * though nothing covers them: the label of the last role, Beheerder (measured by hand, light / dark
 * mode: 11.3:1 / 11.4:1), and the text in the zone for leaving the team (9.7:1 / 12.3:1).
 */
const allowedContrast = [
	/^(nldd-top-title-bar|\.optisch),nldd-button(\[start-icon="chevron-left"\])?,\.button__text$/,
	/^nldd-status-bar,\.status-bar__text$/,
	/^\.woord$/,
	/^(nldd-button|\.menuknop),\.button__text$/,
	/^#nldd-field-input-[\w-]+ > nldd-radio-button-field\[aria-posinset="3"\](\[aria-setsize="3"\]\[name="rol"\])?,\.radio-button-field__label$/,
	/^nldd-rich-text > \.svelte-\w+$/
];

for (const colorScheme of ['light', 'dark'] as const) {
	test(`axe finds nothing on the beheer page and its sheet, ${colorScheme} mode`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme });
		await open(page, DH);
		await page.waitForLoadState('networkidle');
		const height = await page.evaluate(() => document.documentElement.scrollHeight);
		await page.setViewportSize({ width: 1280, height });
		const check = async () => {
			const result = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
				.analyze();
			expect(result.violations, JSON.stringify(result.violations, null, 1)).toEqual([]);
			const contrast = result.incomplete
				.filter((rule) => rule.id === 'color-contrast')
				.flatMap((rule) => rule.nodes.map((node) => node.target.join(',')))
				.filter((target) => !allowedContrast.some((allowed) => allowed.test(target)));
			expect(contrast, 'unreviewed color-contrast results').toEqual([]);
		};
		await check();
		await member(page, 'Test Gebruiker (jij)').click();
		await expect(sheetOpen(page)).toHaveCount(1);
		await check();
	});
}
