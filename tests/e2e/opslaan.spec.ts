import { expect, test } from '@playwright/test';

/* A first visit shows the public-draft coach mark on the save button; editor.spec.ts covers it. */
test.beforeEach(({ page }) =>
	page.addInitScript(() => {
		for (const site of ['digi-handboek', 'moza-site'])
			localStorage.setItem(`schrijver:${site}:openbaar-uitgelegd`, '1');
	})
);

test('saves an edit as a draft proposal and keeps the branch on reload', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nOpgeslagen door e2e');

	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Opslaan' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('button', { name: 'Opslaan' })).toBeVisible();
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	await expect(page.locator('nldd-rich-text')).toContainText('Opgeslagen door e2e');

	await page.goto('/sites/digi-handboek?tab=alle');
	await expect(page.getByRole('link', { name: /^Het Digi Handboek/ }).first()).toBeVisible();
});

test('the save notification leaving on its own keeps the view and the focus', async ({ page }) => {
	await page.clock.install();
	await page.goto('/sites/digi-handboek/bewerken/werkwijze/principes.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nBewaard en dan bekeken');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const melding = page.locator('nldd-notification');
	await expect(melding).toBeVisible();

	const voorbeeld = page.getByRole('radio', { name: 'Voorbeeld' });
	await voorbeeld.click();
	await expect(page.getByRole('region', { name: 'Voorbeeld' })).toBeVisible();
	await page.clock.fastForward(11_000);
	await expect(melding).toHaveCount(0);
	await expect(voorbeeld).toBeChecked();
	await expect(voorbeeld).toBeFocused();
	await expect(page.getByRole('region', { name: 'Voorbeeld' })).toBeVisible();
});

test('dismissing the save notification from within keeps the preview showing', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/werkwijze/code-review.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nBewaard en weggeklikt');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const melding = page.locator('nldd-notification');
	await expect(melding).toBeVisible();
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();

	await melding.getByRole('link', { name: 'Bekijk voorstel' }).focus();
	await page.keyboard.press('Escape');
	await expect(melding).toHaveCount(0);
	await expect(page.getByRole('radio', { name: 'Voorbeeld' })).toBeChecked();
	await expect(page.getByRole('region', { name: 'Voorbeeld' })).toBeFocused();
});

test('warns when a stored draft is based on an older version', async ({ page }) => {
	const key = 'schrijver:digi-handboek:new:index.md';
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.evaluate((k) => {
		localStorage.setItem(
			k,
			JSON.stringify({ path: 'index.md', body: 'Oud concept', frontmatter: {}, at: 1, sha: 'oud' })
		);
	}, key);
	await page.reload();
	await expect(page.getByText('Niet-opgeslagen concept gevonden')).toBeVisible();
	await expect(page.getByText(/gebaseerd op een oudere versie/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Herstellen' })).toBeVisible();
	await page.getByRole('button', { name: 'Weggooien' }).click();
});

test('flushes the last keystrokes when the page is hidden', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('laatste woorden');
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	const stored = await page.evaluate(() =>
		localStorage.getItem('schrijver:digi-handboek:new:index.md')
	);
	expect(stored).toContain('laatste woorden');
	expect(stored).toContain('"sha"');
});
