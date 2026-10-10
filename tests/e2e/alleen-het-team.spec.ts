import { expect, test, type Page } from '@playwright/test';
import { als } from './als';

/*
 * Werkplaats is the private repository DigiGilde/intern in the local preview, a site only its team
 * sees: Tweede Collega is its beheerder and the test user a bijdrager; Derde Collega is outside it.
 */
const SITE = '/sites/werkplaats';
const IMAGE = '/api/sites/werkplaats/bestand?pad=inhoud%2Fafbeeldingen%2Forganogram.png';
const API = { 'X-Requested-With': 'Schrijver' };

const siteCard = (page: Page, name: string) =>
	page.locator('nldd-card').filter({ has: page.getByRole('heading', { name, level: 2 }) });

/** The address of the proposal seeded on Werkplaats, as the test user finds it. */
async function proposalAddress(page: Page): Promise<string> {
	await page.goto(`${SITE}/voorstellen?filter=alle`);
	await page
		.locator('nldd-list[accessible-label="Alle voorstellen"]')
		.getByRole('link', { name: /^Werkplaats: het rooster van de week/ })
		.click();
	await expect(page).toHaveURL(/\/sites\/werkplaats\/voorstellen\/\d+/);
	return new URL(page.url()).pathname;
}

test('a member of its team finds the site on the start page, opens it and makes a proposal', async ({
	page
}) => {
	await page.goto('/');
	const card = siteCard(page, 'Werkplaats');
	await expect(card).toHaveAttribute('href', SITE);
	await card.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Werkplaats' })).toBeVisible();

	await page.goto(`${SITE}/bewerken/index.md`);
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('Hier bereidt het team');
	// The repository is private: no word of a draft that becomes public.
	await expect(
		page.getByText('inhoud/index.md · De titel is de eerste kop van de tekst')
	).toBeVisible();
	await expect(page.getByText('Openbaar concept')).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Je concept wordt openbaar' })).toHaveCount(0);
	await expect(
		page.getByRole('status').filter({ hasText: 'Je concept wordt openbaar' })
	).toHaveCount(0);

	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nAlleen voor het team.');
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();

	expect((await page.request.get(IMAGE)).status()).toBe(200);
	expect(
		(
			await page.request.get(`${SITE.replace('/sites', '/api/sites')}/mermaid`, { headers: API })
		).status()
	).toBe(200);
});

test('someone outside its team gets the page that does not exist, everywhere under the site', async ({
	page
}) => {
	const proposal = await proposalAddress(page);
	await als(page, 'derde');

	await page.goto('/');
	await expect(siteCard(page, 'MijnOverheid Zakelijk')).toBeVisible();
	await expect(siteCard(page, 'Werkplaats')).toHaveCount(0);

	for (const path of [
		SITE,
		`${SITE}/over`,
		`${SITE}/voorstellen`,
		proposal,
		`${SITE}/bewerken/index.md`,
		`${SITE}/nieuw`
	]) {
		const response = await page.goto(path);
		expect(response?.status(), path).toBe(404);
		// The page that does not exist as the app shows it, with its bar and menu.
		await expect(page.getByRole('img', { name: 'Schrijver' })).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 1, name: 'Pagina niet gevonden' })
		).toBeVisible();
		await expect(page.getByRole('link', { name: 'Naar de startpagina' })).toHaveAttribute(
			'href',
			'/'
		);
	}
	expect((await page.request.get(`${SITE}/__data.json`)).status()).toBe(404);
	expect((await page.request.get(IMAGE)).status()).toBe(404);
	const api = await page.request.get('/api/sites/werkplaats/mermaid', { headers: API });
	expect(api.status()).toBe(404);
	expect(await api.json()).toMatchObject({
		message: 'Deze site bestaat niet, of alleen het team van de site ziet hem.'
	});
	const assistent = await page.request.post('/api/assistent', {
		headers: API,
		data: { siteId: 'werkplaats', action: 'korter', text: 'Een tekst.' }
	});
	expect(assistent.status()).toBe(404);

	// The same as for a site that does not exist.
	expect((await page.goto('/sites/bestaat-niet'))?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1, name: 'Pagina niet gevonden' })).toBeVisible();
	expect((await page.goto('/sites/moza-site'))?.status()).toBe(200);
});

test('the Over page says who sees the site, and Help that some sites only a team sees', async ({
	page
}) => {
	await page.goto(`${SITE}/over`);
	await expect(page.getByRole('heading', { level: 2, name: 'Zichtbaar voor' })).toBeVisible();
	await expect(
		page.getByText(
			'Alleen het team ziet deze site in Schrijver: de redactie hierboven en de bijdragers.'
		)
	).toBeVisible();
	await expect(
		page.getByText(
			'Wie de repository op GitHub mag lezen, ziet de site ook, als die een GitHub-account aan Schrijver heeft gekoppeld.'
		)
	).toBeVisible();
	await expect(page.getByText('Anderen zien de site niet')).toHaveCount(0);
	await expect(
		page.getByText(
			"Collega's die hun GitHub-account aan Schrijver hebben gekoppeld, horen met schrijfrechten op de repository op GitHub ook bij de redactie; met beheerrechten daar zijn ze beheerder."
		)
	).toBeVisible();
	await expect(page.getByText(/^Concepten zijn niet openbaar\./)).toBeVisible();
	await expect(page.getByText(/^Concepten zijn openbaar\./)).toHaveCount(0);

	await page.goto('/sites/digi-handboek/over');
	await expect(page.getByRole('heading', { level: 2, name: 'Zichtbaar voor' })).toHaveCount(0);

	await page.goto('/help');
	await expect(
		page.getByText(
			"Sommige sites ziet alleen hun team: mis je zo'n site, vraag dan een beheerder van die site om je toe te voegen."
		)
	).toBeVisible();
});
