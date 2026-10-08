import { expect, test, type Page } from '@playwright/test';

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

/*
 * The shortcut tests save MOZa pages that no other test touches, so each proposal holds one page: a
 * proposal with two pages has no shortcut.
 */
async function saveMoza(page: Page, path: string, text: string): Promise<string> {
	await page.goto(`/sites/moza-site/bewerken/${path}`);
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(`\n\n${text}`);
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const saved = page.getByText(/Concept bewaard als voorstel #\d+/).first();
	await expect(saved).toBeVisible();
	return (await saved.textContent())!.match(/#(\d+)/)![1];
}

test('the page row and the proposal row both lead back into the open proposal', async ({
	page
}) => {
	const nummer = await saveMoza(page, 'onderwerpen/portaal.md', 'Voorstel voor de lijsten');
	const verder = new RegExp(
		`/bewerken/onderwerpen/portaal\\.md\\?branch=schrijver%2Fmoza-site%2F.+&pr=${nummer}$`
	);

	await page.goto('/sites/moza-site?map=onderwerpen');
	const pages = page.locator('nldd-list[accessible-label="Pagina\'s in onderwerpen"]');
	await expect(pages.getByRole('link', { name: /^MijnOverheid Zakelijk portaal/ })).toHaveAttribute(
		'href',
		'/sites/moza-site/bewerken/onderwerpen/portaal.md'
	);
	const next = pages.getByRole('link', {
		name: 'Verder met je voorstel voor MijnOverheid Zakelijk portaal'
	});
	await expect(next).toHaveAttribute('href', verder);

	await page.goto('/sites/moza-site/voorstellen?filter=mijn');
	await expect(
		page
			.locator('nldd-list[accessible-label="Mijn voorstellen"]')
			.getByRole('link', { name: 'Verder bewerken: MijnOverheid Zakelijk portaal' })
	).toHaveAttribute('href', verder);

	await page.goto('/sites/moza-site?map=onderwerpen');
	await next.click();
	await expect(page).toHaveURL(new RegExp(`pr=${nummer}`));
	await expect(page.getByRole('button', { name: 'Opslaan' })).toBeVisible();
});

test('the shortcut of a segmented row reads as a link and gives up its label first', async ({
	page
}) => {
	const nummer = await saveMoza(page, 'onderwerpen/proeftuin.md', 'Voorstel voor de affordance');
	const rows = [
		{
			url: '/sites/moza-site?map=onderwerpen',
			list: "Pagina's in onderwerpen",
			opens: '/sites/moza-site/bewerken/onderwerpen/proeftuin.md'
		},
		{
			url: '/sites/moza-site/voorstellen?filter=mijn',
			list: 'Mijn voorstellen',
			opens: `/sites/moza-site/voorstellen/${nummer}?filter=mijn`
		}
	];
	for (const { url, list, opens } of rows) {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto(url);
		const rij = page.locator(`nldd-list[accessible-label="${list}"]`);
		// The row opens one thing and offers one shortcut; no chevron sits between the two.
		await expect(rij.locator(`nldd-list-item-segment[href="${opens}"]`)).toBeVisible();
		await expect(rij.locator(`nldd-list-item-segment[href="${opens}"] nldd-icon-cell`)).toHaveCount(
			0
		);
		const shortcut = rij.locator(`nldd-list-item-segment[href$="&pr=${nummer}"]`);
		await expect(shortcut.locator('> nldd-icon-cell:first-child')).toHaveAttribute(
			'icon',
			'pencil'
		);
		await expect(shortcut.locator('nldd-text-cell')).toHaveAttribute('color', 'accent');
		await expect(shortcut.locator('nldd-text-cell')).toBeVisible();

		await page.setViewportSize({ width: 600, height: 800 });
		await expect(shortcut.locator('nldd-icon-cell')).toBeVisible();
		await expect(shortcut.locator('nldd-text-cell')).toBeHidden();
	}
});
