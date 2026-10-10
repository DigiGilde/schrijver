import { expect, test, type Page } from '@playwright/test';
import { als, alsTestgebruiker } from './als';

/*
 * Turns "Samenvoegen in Schrijver" off for MOZa for everyone, so playwright.config.ts runs this spec
 * after the others. Tweede Collega, its beheerder, changes the setting; the test user, in its
 * redactie, reads the proposal.
 */
const zin = (page: Page) => page.locator('nldd-text.zin');

async function samenvoegenInSchrijver(page: Page, aan: boolean) {
	await als(page, 'collega');
	await page.goto('/instellingen/sites/moza-site');
	await page.evaluate(() => customElements.whenDefined('nldd-switch-field'));
	const form = page.locator('form[action="?/instellingen"]');
	const schakelaar = form.getByRole('switch', { name: 'Samenvoegen in Schrijver' });
	if ((await schakelaar.isChecked()) !== aan) await schakelaar.click();
	await form.getByRole('button', { name: 'Bewaar' }).click();
	await expect(
		page
			.locator('p[role="status"]')
			.filter({ hasText: 'De instellingen van de site zijn bewaard.' })
	).toHaveCount(1);
	await alsTestgebruiker(page);
}

test('with merging in Schrijver switched off, the editors merge on GitHub', async ({ page }) => {
	await page.goto('/sites/moza-site/voorstellen?filter=alle');
	await page
		.locator('nldd-list[accessible-label="Alle voorstellen"]')
		.getByRole('link', { name: /^Weekly 23 september: de demo/ })
		.click();
	await expect(zin(page)).toHaveText(
		'Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed; daarna kun je hier samenvoegen. Moet er iets anders, vraag dan om een aanpassing.'
	);
	const voorstel = page.url();

	await samenvoegenInSchrijver(page, false);
	try {
		await page.goto(voorstel);
		// The test user has no GitHub account: someone with rights there merges.
		await expect(zin(page)).toHaveText(
			'Bij deze site gebeurt samenvoegen op GitHub. Iemand met rechten op GitHub voegt het voorstel daar samen. Moet er iets anders, vraag dan om een aanpassing.'
		);
		await expect(page.locator('nldd-box nldd-button[text="Beoordelen op GitHub"]')).toHaveCount(0);
		await expect(page.locator('nldd-box nldd-button[text="Aanpassing vragen"]')).toHaveAttribute(
			'appearance',
			'primary'
		);
		await expect(page.locator('nldd-box nldd-button[text="Voeg samen"]')).toHaveCount(0);
		await page.goto('/sites/moza-site/over');
		await expect(
			page.getByText('Op deze site gebeurt het samenvoegen op GitHub, niet in Schrijver.')
		).toBeVisible();
	} finally {
		await samenvoegenInSchrijver(page, true);
	}

	await page.goto(voorstel);
	await expect(zin(page)).toHaveText(
		'Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed; daarna kun je hier samenvoegen. Moet er iets anders, vraag dan om een aanpassing.'
	);
});
