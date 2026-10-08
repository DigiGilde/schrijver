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

test('the page row and the proposal row both lead back into the open proposal', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/bewerken/offboarding.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nVoorstel voor de lijsten');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const saved = page.getByText(/Concept bewaard als voorstel #\d+/).first();
	await expect(saved).toBeVisible();
	const nummer = (await saved.textContent())!.match(/#(\d+)/)![1];
	const verder = new RegExp(
		`/bewerken/offboarding\\.md\\?branch=schrijver%2Fdigi-handboek%2F.+&pr=${nummer}$`
	);

	await page.goto('/sites/digi-handboek');
	const pages = page.locator('nldd-list[accessible-label="Pagina\'s"]');
	await expect(pages.getByRole('link', { name: /^Offboarding/ })).toHaveAttribute(
		'href',
		'/sites/digi-handboek/bewerken/offboarding.md'
	);
	const next = pages.getByRole('link', { name: 'Verder met je voorstel voor Offboarding' });
	await expect(next).toHaveAttribute('href', verder);
	await expect(
		page
			.locator('nldd-list[accessible-label="Mijn voorstellen"]')
			.getByRole('link', { name: 'Verder bewerken: Offboarding' })
	).toHaveAttribute('href', verder);

	await next.click();
	await expect(page).toHaveURL(new RegExp(`pr=${nummer}`));
	await expect(page.getByRole('button', { name: 'Opslaan' })).toBeVisible();
});

test('segmented rows keep their chevron and show the shortcut as a link', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/offboarding.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nVoorstel voor de affordance');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const saved = page.getByText(/Concept bewaard als voorstel #\d+/).first();
	await expect(saved).toBeVisible();
	const nummer = (await saved.textContent())!.match(/#(\d+)/)![1];

	await page.goto('/sites/digi-handboek');
	const rows = [
		{
			list: page.locator('nldd-list[accessible-label="Pagina\'s"]'),
			opens: '/sites/digi-handboek/bewerken/offboarding.md'
		},
		{
			list: page.locator('nldd-list[accessible-label="Mijn voorstellen"]'),
			opens: `/sites/digi-handboek/voorstellen/${nummer}`
		}
	];
	for (const { list, opens } of rows) {
		await expect(
			list.locator(`nldd-list-item-segment[href="${opens}"] > nldd-icon-cell:last-child`)
		).toHaveAttribute('icon', 'chevron-right');
		const shortcut = list.locator(`nldd-list-item-segment[href$="&pr=${nummer}"]`);
		await expect(shortcut.locator('> nldd-icon-cell:first-child')).toHaveAttribute(
			'icon',
			'pencil'
		);
		await expect(shortcut.locator('nldd-text-cell')).toHaveAttribute('color', 'accent');
	}
});
