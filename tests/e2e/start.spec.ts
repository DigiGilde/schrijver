import { expect, test, type Page } from '@playwright/test';
import { als } from './als';

/** The card of a site is found by its host: the heading is slotted into it, so it is no descendant of the article inside. */
const siteCard = (page: Page, name: string) =>
	page.locator('nldd-card').filter({ has: page.getByRole('heading', { name, level: 2 }) });

test('each site is one card that says what the site is', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Kies een site', level: 1 })).toBeVisible();

	const digi = siteCard(page, 'Digi Handboek');
	await expect(digi).toHaveAttribute('href', '/sites/digi-handboek');
	await expect(digi).toContainText(
		'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.'
	);
	await expect(digi).toContainText('digihandboek.rijks.app');
	await expect(digi).not.toContainText('https://');

	const moza = siteCard(page, 'MijnOverheid Zakelijk');
	await expect(moza).toHaveAttribute('href', '/sites/moza-site');
	await expect(moza).toContainText('Een overheidsbrede samenwerking');
	await expect(moza).toContainText('mijnoverheidzakelijk.nl');

	// No review-model jargon on the start page.
	await expect(page.getByText('Met goedkeuring')).toHaveCount(0);
});

test('the description stays on the card and is not repeated under the site name', async ({
	page
}) => {
	const description = 'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.';
	await page.goto('/');
	await expect(siteCard(page, 'Digi Handboek')).toContainText(description);
	await page.getByRole('link', { name: 'Digi Handboek' }).click();
	await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
	await expect(page.getByRole('heading', { name: 'Digi Handboek', level: 1 })).toBeVisible();
	await expect(page.getByText(description)).toHaveCount(0);
});

test('a site is one Tab stop and the start page has no rows with a chevron', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Digi Handboek' })).toBeVisible();
	await expect(page.getByRole('main').locator('nldd-list, nldd-icon-cell')).toHaveCount(0);

	await page.getByRole('link', { name: 'Digi Handboek' }).focus();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'MijnOverheid Zakelijk' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/sites\/moza-site$/);
});

test('the cards sit side by side on a wide screen', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	const digi = (await siteCard(page, 'Digi Handboek').boundingBox())!;
	const moza = (await siteCard(page, 'MijnOverheid Zakelijk').boundingBox())!;
	expect(moza.y).toBe(digi.y);
	expect(moza.x).toBeGreaterThan(digi.x + digi.width);
});

test('sites beyond the first page of the collection stay reachable', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => customElements.whenDefined('nldd-collection'));
	const cards = page.locator('nldd-collection > nldd-card');
	const sites = await cards.count();
	// The collection hides what exceeds max-items, and only show-load-more gives it back.
	await page.locator('nldd-collection').evaluate((collection) => {
		const card = collection.querySelector('nldd-card')!;
		for (let i = 0; i < 24; i++) collection.append(card.cloneNode(true));
	});
	await expect(cards).toHaveCount(sites + 24);
	await expect(cards.filter({ visible: true })).toHaveCount(24);
	await page.getByRole('button', { name: 'Toon meer' }).click();
	await expect(cards.filter({ visible: true })).toHaveCount(sites + 24);
});

test.describe('on a narrow screen', () => {
	test.use({ viewport: { width: 400, height: 800 } });

	test('the cards stack in one column of the full width', async ({ page }) => {
		await page.goto('/');
		const digi = (await siteCard(page, 'Digi Handboek').boundingBox())!;
		const moza = (await siteCard(page, 'MijnOverheid Zakelijk').boundingBox())!;
		expect(moza.x).toBe(digi.x);
		expect(moza.y).toBeGreaterThan(digi.y + digi.height);
		expect(digi.width).toBeGreaterThan(400 - 2 * 24);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			400
		);
	});
});

test('a card says what waits for you on that site', async ({ page }) => {
	// A page no other test saves to, so this proposal is the test's alone.
	await page.goto('/sites/digi-handboek/bewerken/onboarding/accounts.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nGezien op de startpagina');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await page.getByRole('link', { name: 'Bekijk voorstel' }).click();
	await expect(page.locator('nldd-step-bar-item[status="current"][text="Concept"]')).toBeVisible();
	const proposal = page.url();

	await page.goto('/');
	const card = siteCard(page, 'Digi Handboek');
	await expect(card).toContainText(/Je hebt \d+ open voorstel(len)?/);

	// The test user is editorial on this site: a sent-in proposal waits for review.
	await page.goto(proposal);
	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(
		page.locator('nldd-step-bar-item[status="current"][text="Ingestuurd"]')
	).toBeVisible();
	await page.goto('/');
	await expect(card).toContainText(/(1 voorstel wacht|\d+ voorstellen wachten) op beoordeling/);

	// Derde Collega is on the team of MOZa, not on that of Digi Handboek.
	await als(page, 'derde');
	await page.goto('/');
	await expect(siteCard(page, 'MijnOverheid Zakelijk')).toContainText('op beoordeling');
	await expect(card).not.toContainText('op beoordeling');
});
