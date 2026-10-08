import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const url = '/sites/digi-handboek/bewerken/index.md';

/** Opens the panel; the preview has no VLAM address, so the fake assistant answers. */
async function openPanel(page: Page) {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Het Digi Handboek');
	await page.getByRole('button', { name: 'Schrijfhulp' }).click();
	return page.getByRole('complementary', { name: 'Schrijfhulp' });
}

async function selectFirstParagraph(page: Page) {
	await page.locator('.cm-line', { hasText: 'We hebben deze centrale plek' }).click();
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+End');
}

test('without VLAM the preview answers Korter with a marked test suggestion', async ({ page }) => {
	const paneel = await openPanel(page);
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(paneel.getByRole('group', { name: 'Op de hele tekst' })).toBeVisible();

	await paneel.getByRole('button', { name: 'Korter' }).click();
	await expect(
		paneel.getByRole('heading', { name: 'Voorgestelde wijziging', level: 3 })
	).toBeVisible();
	await expect(
		paneel.getByText('Testantwoord, geen AI: alleen de eerste zin blijft staan.')
	).toBeVisible();
	await expect(paneel.getByRole('status')).toHaveText('Voorstel beschikbaar');

	await paneel.getByRole('button', { name: 'Overnemen' }).click();
	await expect(editor).toContainText(
		'We hebben deze centrale plek gemaakt zodat je snel de informatie vindt die je nodig hebt.'
	);
	await expect(editor).not.toContainText('Over het Digi Gilde');
	await expect(editor).toBeFocused();
	await expect(paneel.getByRole('status')).toHaveText('Overgenomen');
});

test('the fixed actions say whether they work on the selection', async ({ page }) => {
	const paneel = await openPanel(page);
	await selectFirstParagraph(page);
	await paneel.hover();
	await expect(paneel.getByRole('group', { name: 'Op de selectie' })).toBeVisible();
	await paneel.getByRole('button', { name: 'Korter' }).click();
	await paneel.getByRole('button', { name: 'Overnemen' }).click();
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).not.toContainText('Dit is in aanvulling');
	await expect(editor).toContainText('Over het Digi Gilde');
});

test('Vraag without an instruction says what is missing and asks nothing', async ({ page }) => {
	const paneel = await openPanel(page);
	let asked = 0;
	page.on('request', (r) => {
		if (r.url().endsWith('/api/assistent')) asked++;
	});
	await paneel.getByRole('button', { name: 'Vraag' }).click();
	await expect(paneel.getByText('Een opdracht is nodig om iets te vragen')).toBeVisible();
	const veld = paneel.getByRole('textbox', { name: 'Eigen opdracht' });
	await expect(veld).toBeFocused();
	expect(asked).toBe(0);

	await page.keyboard.type('Maak het formeler');
	await expect(paneel.getByText('Een opdracht is nodig om iets te vragen')).toHaveCount(0);
	await page.keyboard.press('Enter');
	await expect(
		paneel.getByText('Testantwoord, geen AI: één woord staat nu in hoofdletters.')
	).toBeVisible();
	expect(asked).toBe(1);
});

test('the panel takes its spacing from the design system', async ({ page }) => {
	const paneel = await openPanel(page);
	const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;
	const heading = paneel.getByRole('heading', { name: 'Schrijfhulp', level: 2 });
	// A margin on the first child would collapse through the section, so check the margin itself.
	await expect(heading, 'no gap above the heading').toHaveCSS('margin-top', '0px');
	const sectie = await box(paneel.getByRole('region', { name: 'Schrijfhulp' }));
	expect((await box(heading)).y - sectie.y).toBeLessThan(2);

	const veld = await box(paneel.locator('nldd-text-field'));
	const vraag = await box(paneel.locator('nldd-button[text="Vraag"]'));
	expect(vraag.y - (veld.y + veld.height), 'Vraag sits clear of its field').toBeGreaterThanOrEqual(
		16
	);

	const label = await box(paneel.getByText('Op de hele tekst'));
	const korter = await box(paneel.locator('nldd-button[text="Korter"]'));
	const gap = korter.y - (label.y + label.height);
	expect(gap, 'the group label sits with its buttons').toBeGreaterThan(0);
	expect(gap).toBeLessThanOrEqual(12);
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`the panel with a suggestion passes axe in ${colorScheme} mode`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		const paneel = await openPanel(page);
		await selectFirstParagraph(page);
		await paneel.getByRole('button', { name: 'Korter' }).click();
		await expect(paneel.getByRole('button', { name: 'Overnemen' })).toBeVisible();
		const result = await new AxeBuilder({ page })
			.include('#schrijfhulp-paneel')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(result.violations, JSON.stringify(result.violations, null, 1)).toEqual([]);
	});
}
