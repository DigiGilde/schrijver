import { expect, test, type Page } from '@playwright/test';
import { als } from './als';

/*
 * The test user is in the redactie of MOZa, which has four eyes on, and is no site admin there.
 * Derde Collega is in the same redactie; Tweede Collega is its beheerder.
 */
const zin = (page: Page) => page.locator('nldd-text.zin');
const knop = (page: Page, text: string) => page.locator(`nldd-box nldd-button[text="${text}"]`);
const ZELF = 'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.';
const GOEDKEURING =
	'Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed; daarna kun je hier samenvoegen. Moet er iets anders, vraag dan om een aanpassing.';

async function openSeeded(page: Page, site: string, title: string) {
	await page.goto(`/sites/${site}/voorstellen?filter=alle`);
	await page
		.locator('nldd-list[accessible-label="Alle voorstellen"]')
		.getByRole('link', { name: new RegExp(`^${title}`) })
		.first()
		.click();
	await expect(zin(page)).toBeVisible();
}

test('the writer is blocked on the proposal they sent in, and another editor is not', async ({
	page
}) => {
	// Only this test edits profielservice.md.
	await page.goto('/sites/moza-site/bewerken/onderwerpen/profielservice.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nTwee paar ogen zien meer.');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await page.getByRole('link', { name: 'Bekijk voorstel' }).click();
	await knop(page, 'Insturen').click();
	await expect(zin(page)).toHaveText(ZELF);
	await expect(knop(page, 'Samenvoegen')).toHaveCount(0);
	await expect(knop(page, 'Goedkeuren op GitHub')).toHaveCount(0);

	// Derde Collega has no GitHub account: someone with rights there approves.
	await als(page, 'derde');
	await page.reload();
	await expect(zin(page)).toHaveText(GOEDKEURING);
	await expect(knop(page, 'Goedkeuren op GitHub')).toHaveCount(0);
	await expect(knop(page, 'Vraag om aanpassing')).toHaveAttribute('appearance', 'primary');
});

test('another editor may merge the approved proposal that the test user wrote', async ({
	page
}) => {
	await openSeeded(page, 'moza-site', 'Toegankelijkheid: wie je kunt mailen');
	await expect(zin(page)).toHaveText(ZELF);
	await expect(knop(page, 'Samenvoegen')).toHaveCount(0);

	await als(page, 'derde');
	await page.reload();
	await expect(zin(page)).toHaveText(/^Jij beslist\./);
	await expect(knop(page, 'Samenvoegen')).toBeVisible();
});

test('Te beoordelen leaves out the own proposals that four eyes keep from the reader', async ({
	page
}) => {
	const list = page.locator('nldd-list[accessible-label="Te beoordelen"]');
	const own = list.getByRole('link', { name: /^Toegankelijkheid: wie je kunt mailen/ });
	await page.goto('/sites/moza-site/voorstellen?filter=beoordelen');
	await expect(list.getByRole('link', { name: /^Weekly 23 september: de demo/ })).toBeVisible();
	await expect(own).toHaveCount(0);
	const count = await list.locator('nldd-list-item').count();
	await expect(page.getByRole('radio', { name: `Te beoordelen (${count})` })).toBeChecked();

	await als(page, 'derde');
	await page.goto('/sites/moza-site/voorstellen?filter=beoordelen');
	await expect(own).toBeVisible();
});

test('someone outside the redactie of the site is told that the editors decide', async ({
	page
}) => {
	await als(page, 'derde');
	await openSeeded(page, 'digi-handboek', 'Kennis: het team stelt zich voor');
	await expect(zin(page)).toHaveText('De redactie beoordeelt dit voorstel.');
	await expect(page.getByRole('textbox', { name: 'Je reactie' })).toHaveCount(0);
	await expect(knop(page, 'Samenvoegen')).toHaveCount(0);
});
