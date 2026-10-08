import { expect, test } from '@playwright/test';

test('sends in, comments and merges a draft proposal', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page
		.locator('nldd-text-editor .cm-line')
		.filter({ hasText: 'Het Digi Gilde is enthousiast' })
		.click({ position: { x: 2, y: 2 } });
	await page.keyboard.press('Shift+ControlOrMeta+End');
	await page.keyboard.type('Voorstel door e2e');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await page.getByRole('link', { name: 'Bekijk voorstel' }).click();
	await expect(page.locator('nldd-badge[text="Concept"]')).toBeVisible();
	await expect(
		page.locator('[data-diff="toegevoegd"]').filter({ hasText: 'Voorstel door e2e' })
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Over het Digi Gilde' })).toHaveCount(0);
	await expect(
		page.locator('nldd-rich-text').filter({ hasText: 'Voorstel door e2e' })
	).toBeVisible();
	const bar = (state: string) =>
		page
			.locator(`[data-diff="${state}"]`)
			.first()
			.evaluate((block) => getComputedStyle(block, '::before').borderInlineStartStyle);
	expect(await bar('toegevoegd')).toBe('solid');
	expect(await bar('verwijderd')).toBe('dashed');
	await expect(page.locator('[data-diff="was"]')).toHaveCount(0);
	await expect(page.getByText('doorgetrokken lijn')).toContainText('onderbroken lijn');
	await expect(page.getByRole('button', { name: 'Goedkeuren' })).toHaveCount(0);
	await expect(page.getByRole('table', { name: 'Alle gewijzigde bestanden' })).toContainText(
		'docs/index.md'
	);
	await page.getByRole('radio', { name: 'Brontekst' }).click();
	await expect(page.locator('pre.bron ins').filter({ hasText: 'Voorstel door e2e' })).toBeVisible();
	await page.getByRole('radio', { name: 'Hele pagina' }).click();
	await expect(page.getByRole('heading', { name: 'Over het Digi Gilde' })).toBeVisible();

	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(page.locator('nldd-badge[text="Ingestuurd"]')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Beoordelen op GitHub' })).toBeVisible();

	await page.getByRole('textbox', { name: 'Opmerking' }).fill('Ziet er goed uit');
	await page.getByRole('button', { name: 'Opmerking plaatsen' }).click();
	await expect(page.getByText('Je opmerking is geplaatst').first()).toBeVisible();

	await page.getByRole('button', { name: 'Samenvoegen' }).click();
	await expect(page.locator('nldd-badge[text="Samengevoegd"]')).toBeVisible();
});
