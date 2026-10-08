import { expect, test } from '@playwright/test';

test('returns to an open proposal and saves into the same pull request', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nEerste sessie');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const saved = page.getByText(/Concept bewaard als voorstel #\d+/).first();
	await expect(saved).toBeVisible();
	const nummer = (await saved.textContent())!.match(/#(\d+)/)![1];

	// A fresh visit: the editor URL with the branch is gone, the proposal page is the way back.
	await page.goto(`/sites/digi-handboek/voorstellen/${nummer}`);
	await page.getByRole('link', { name: 'Verder bewerken' }).click();
	await expect(page).toHaveURL(new RegExp(`branch=schrijver%2Fdigi-handboek%2F.+&pr=${nummer}`));
	await expect(page.getByRole('button', { name: 'Opslaan' })).toBeVisible();
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	await expect(page.locator('nldd-rich-text')).toContainText('Eerste sessie');
	await page.getByRole('radio', { name: 'Schrijven' }).click();

	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nTweede sessie');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByText(`Concept bewaard als voorstel #${nummer}`).first()).toBeVisible();

	await page.goto('/sites/digi-handboek');
	await expect(
		page.getByRole('link', { name: /Verder met je voorstel voor/ }).first()
	).toBeVisible();
});
