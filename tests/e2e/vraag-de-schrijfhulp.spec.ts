import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

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

const editor = (page: Page) => page.locator('nldd-text-editor .cm-content');
/** The whole text: the editor only renders the lines near the viewport. */
const editorValue = (page: Page) =>
	page.evaluate(
		() => (document.querySelector('nldd-text-editor') as unknown as { value: string }).value
	);
const annotations = (page: Page) =>
	page.evaluate(
		() =>
			(document.querySelector('nldd-text-editor') as unknown as { annotations: unknown[] })
				.annotations.length
	);
/** The heading above a comparison in the text column. */
const vergelijking = (page: Page, naam: string) =>
	page.getByRole('heading', { name: naam, level: 2, exact: true });

/**
 * Gives the answers of the fake assistant from the test itself: the endpoint allows 20 requests a
 * minute, and the whole suite shares them.
 */
async function answerHere(page: Page) {
	await page.route('**/api/assistent', (route) => {
		const { text, action } = route.request().postDataJSON() as { text: string; action: string };
		const eind = /[.!?](?=\s|$)/.exec(text);
		return route.fulfill({
			json:
				action === 'korter'
					? {
							replacement: (eind ? text.slice(0, eind.index + 1) : text).trim(),
							explanation: 'Testantwoord, geen AI: alleen de eerste zin blijft staan.'
						}
					: {
							replacement: text.replace('Digi', 'DIGI'),
							explanation: 'Testantwoord, geen AI: één woord staat nu in hoofdletters.'
						}
		});
	});
}

async function openPanelHere(page: Page) {
	await answerHere(page);
	return openPanel(page);
}

test('without VLAM the preview answers Korter with a comparison in the text column', async ({
	page
}) => {
	const paneel = await openPanel(page);
	await expect(paneel.getByRole('group', { name: 'Op de hele tekst' })).toBeVisible();

	await paneel.getByRole('button', { name: 'Korter' }).click();
	const kop = vergelijking(page, 'Voorstel van Schrijfhulp: Korter');
	await expect(kop).toBeVisible();
	await expect(kop, 'the heading takes the focus').toBeFocused();
	await expect(paneel.getByRole('status')).toHaveText('Voorstel staat in de tekstkolom');
	await expect(
		paneel.getByText('Testantwoord, geen AI: alleen de eerste zin blijft staan.')
	).toBeVisible();
	await expect(paneel.getByText('1 wijziging staat in de tekstkolom')).toBeVisible();
	await expect(paneel.getByText('Over het Digi Gilde'), 'the panel holds no text').toHaveCount(0);

	const kolom = page.getByRole('region', { name: 'Voorstel van Schrijfhulp: Korter' });
	await expect(kolom).toContainText('Over het Digi Gilde');
	await expect(page.locator('nldd-text-editor'), 'hidden, not gone').toBeHidden();
	await expect(page.locator('nldd-text-editor')).toBeAttached();

	await paneel.getByRole('button', { name: 'Overnemen' }).click();
	await expect(kop).toHaveCount(0);
	await expect(editor(page)).toContainText(
		'We hebben deze centrale plek gemaakt zodat je snel de informatie vindt die je nodig hebt.'
	);
	await expect(editor(page)).not.toContainText('Over het Digi Gilde');
	await expect(editor(page)).toBeFocused();
	await expect(paneel.getByRole('status')).toHaveText('Overgenomen');
	expect(await annotations(page), 'nothing stays marked').toBe(0);
});

test('Verwerpen on a comparison brings the text back as it was, history and all', async ({
	page
}) => {
	const paneel = await openPanelHere(page);
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' Getypt voor het voorstel');
	const voor = await editorValue(page);

	await paneel.getByRole('button', { name: 'Korter' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toBeFocused();
	await expect(
		page.getByRole('button', { name: 'Vet' }),
		'no formatting behind the comparison'
	).toBeDisabled();

	await paneel.getByRole('button', { name: 'Verwerpen' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toHaveCount(0);
	await expect(editor(page)).toBeFocused();
	await expect(paneel.getByRole('status')).toHaveText('Verworpen');
	await expect(page.getByRole('button', { name: 'Vet' })).toBeEnabled();
	expect(await editorValue(page)).toBe(voor);
	expect(await annotations(page), 'nothing stays marked').toBe(0);

	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => editorValue(page)).not.toContain('Getypt voor het voorstel');
});

test('the comparison takes the place of Voorbeeld, which comes back as it was', async ({
	page
}) => {
	const paneel = await openPanelHere(page);
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	const voorbeeld = page.getByRole('region', { name: 'Voorbeeld' });
	await expect(voorbeeld).toBeVisible();

	await paneel.getByRole('button', { name: 'Korter' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toBeFocused();
	await expect(voorbeeld).toHaveCount(0);

	await paneel.getByRole('button', { name: 'Overnemen' }).click();
	await expect(voorbeeld).toBeVisible();
	await expect(voorbeeld).toBeFocused();
	await expect(page.getByRole('radio', { name: 'Voorbeeld' })).toBeChecked();
	await expect(
		voorbeeld.getByRole('heading', { name: 'Het Digi Handboek', level: 1 })
	).toBeVisible();
	await expect(voorbeeld).not.toContainText('Over het Digi Gilde');
	await expect(page.locator('nldd-text-editor')).toBeHidden();
});

test('the view switch in the toolbar ends the comparison like Verwerpen', async ({ page }) => {
	const paneel = await openPanelHere(page);
	await paneel.getByRole('button', { name: 'Korter' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toBeVisible();

	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toHaveCount(0);
	await expect(page.getByRole('region', { name: 'Voorbeeld' })).toContainText(
		'Over het Digi Gilde'
	);
	await expect(
		page.getByRole('radio', { name: 'Voorbeeld' }),
		'the switch keeps the focus'
	).toBeFocused();
	await expect(paneel.getByRole('status')).toHaveText('Verworpen');
	await expect(paneel.getByRole('button', { name: 'Overnemen' })).toHaveCount(0);
	expect(await annotations(page), 'nothing stays marked').toBe(0);

	await page.getByRole('radio', { name: 'Schrijven' }).click();
	await expect(editor(page)).toContainText('Over het Digi Gilde');
});

test('closing the panel ends the comparison and brings the text back', async ({ page }) => {
	const paneel = await openPanelHere(page);
	await paneel.getByRole('button', { name: 'Korter' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toBeVisible();

	await page.getByRole('button', { name: 'Schrijfhulp', expanded: true }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toHaveCount(0);
	await expect(page.locator('nldd-text-editor')).toBeVisible();
	await expect(editor(page)).toContainText('Over het Digi Gilde');
	expect(await annotations(page), 'nothing stays marked').toBe(0);

	await page.getByRole('button', { name: 'Schrijfhulp', expanded: false }).click();
	await expect(paneel.getByRole('button', { name: 'Overnemen' })).toHaveCount(0);
});

test('an answer that arrives after the panel was closed shows no comparison', async ({ page }) => {
	let antwoord = () => {};
	const vrij = new Promise<void>((klaar) => (antwoord = klaar));
	await page.route('**/api/assistent', async (route) => {
		await vrij;
		await route.fulfill({ json: { replacement: '# Kort', explanation: 'Te laat.' } });
	});
	const paneel = await openPanel(page);
	await paneel.getByRole('button', { name: 'Korter' }).click();
	await page.getByRole('button', { name: 'Schrijfhulp', expanded: true }).click();
	const geantwoord = page.waitForResponse('**/api/assistent');
	antwoord();
	await geantwoord;
	await page.evaluate(
		() => new Promise((klaar) => requestAnimationFrame(() => requestAnimationFrame(klaar)))
	);
	await expect(page.getByRole('heading', { name: /^Voorstel van Schrijfhulp/ })).toHaveCount(0);
	await expect(page.locator('nldd-text-editor')).toBeVisible();
	await expect(editor(page)).toContainText('Over het Digi Gilde');
});

for (const actie of ['Korter', 'Naar B1', 'Actiever', 'Kopjes voorstellen']) {
	test(`${actie} on the whole text names itself above the comparison`, async ({ page }) => {
		const paneel = await openPanelHere(page);
		await paneel.getByRole('button', { name: actie }).click();
		await expect(vergelijking(page, `Voorstel van Schrijfhulp: ${actie}`)).toBeFocused();
		await paneel.getByRole('button', { name: 'Verwerpen' }).click();
		await expect(editor(page)).toBeFocused();
	});
}

test('an own instruction on the whole text names no action above the comparison', async ({
	page
}) => {
	const paneel = await openPanelHere(page);
	await paneel.getByRole('textbox', { name: 'Eigen opdracht' }).fill('Maak het formeler');
	await paneel.getByRole('button', { name: 'Vraag' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp')).toBeFocused();
	await expect(
		paneel.getByText('Testantwoord, geen AI: één woord staat nu in hoofdletters.')
	).toBeVisible();
	await expect(paneel.getByText('1 wijziging staat in de tekstkolom')).toBeVisible();
});

test('the panel counts the changes of the comparison', async ({ page }) => {
	await page.route('**/api/assistent', async (route) => {
		const { text } = route.request().postDataJSON() as { text: string };
		await route.fulfill({
			json: {
				replacement: text
					.replace('Wij zijn onderdeel van', 'Wij maken deel uit van')
					.replace('## Wat we doen', '## Ons werk'),
				explanation: 'Twee plekken aangepast.'
			}
		});
	});
	const paneel = await openPanel(page);
	await paneel.getByRole('button', { name: 'Actiever' }).click();
	await expect(paneel.getByText('2 wijzigingen staan in de tekstkolom')).toBeVisible();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Actiever')).toBeFocused();
});

test('a suggestion that changes nothing says so in the panel', async ({ page }) => {
	await page.route('**/api/assistent', async (route) => {
		const { text } = route.request().postDataJSON() as { text: string };
		await route.fulfill({ json: { replacement: text, explanation: 'Niets te verbeteren.' } });
	});
	const paneel = await openPanel(page);
	await paneel.getByRole('button', { name: 'Actiever' }).click();
	await expect(paneel.getByText('Het voorstel verandert niets in je tekst')).toBeVisible();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Actiever')).toBeFocused();
});

test('a suggestion for a selection stays in the panel', async ({ page }) => {
	const paneel = await openPanelHere(page);
	await selectFirstParagraph(page);
	await paneel.hover();
	await paneel.getByRole('button', { name: 'Korter' }).click();
	await expect(
		paneel.getByRole('heading', { name: 'Voorgestelde wijziging', level: 3 })
	).toBeVisible();
	await expect(paneel.getByRole('status')).toHaveText('Voorstel beschikbaar');
	await expect(page.getByRole('heading', { name: /^Voorstel van Schrijfhulp/ })).toHaveCount(0);
	await expect(page.locator('nldd-text-editor')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Vet' })).toBeEnabled();

	await paneel.getByRole('button', { name: 'Verwerpen' }).click();
	await expect(editor(page)).toBeFocused();
	await expect(paneel.getByRole('status')).toHaveText('Verworpen');
});

test('select all, then an action, asks for the whole text and compares it in the text column', async ({
	page
}) => {
	const paneel = await openPanelHere(page);
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+a');
	await paneel.hover();
	await expect(paneel.getByRole('group', { name: 'Op de hele tekst' })).toBeVisible();

	await paneel.getByRole('button', { name: 'Korter' }).click();
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toBeFocused();
	await expect(paneel.getByRole('status')).toHaveText('Voorstel staat in de tekstkolom');
	await expect(paneel.getByText('1 wijziging staat in de tekstkolom')).toBeVisible();
	await expect(paneel.getByText('Over het Digi Gilde'), 'the panel holds no text').toHaveCount(0);
	await expect(
		page.getByRole('region', { name: 'Voorstel van Schrijfhulp: Korter' })
	).toContainText('Over het Digi Gilde');

	await paneel.getByRole('button', { name: 'Overnemen' }).click();
	await expect(editor(page)).toBeFocused();
	await expect(editor(page)).not.toContainText('Over het Digi Gilde');
	await expect(editor(page)).toContainText('Het Digi Handboek');
});

test('Samenvatting on the whole text stays in the panel', async ({ page }) => {
	const paneel = await openPanelHere(page);
	await paneel.getByRole('button', { name: 'Samenvatting', exact: true }).click();
	await expect(
		paneel.getByRole('heading', { name: 'Voorgestelde samenvatting', level: 3 })
	).toBeVisible();
	await expect(paneel.getByRole('status')).toHaveText('Voorstel beschikbaar');
	await expect(page.getByRole('heading', { name: /^Voorstel van Schrijfhulp/ })).toHaveCount(0);
	await expect(page.locator('nldd-text-editor')).toBeVisible();
});

test('the whole round trip works with the keyboard alone', async ({ page }) => {
	const paneel = await openPanelHere(page);
	const tab = async (knop: Locator) => {
		for (let i = 0; i < 30; i++) {
			if (await knop.evaluate((el) => el.matches(':focus-within'))) return;
			await page.keyboard.press('Tab');
		}
		throw new Error('Tab does not reach the button');
	};

	await paneel.getByRole('button', { name: 'Korter' }).focus();
	await page.keyboard.press('Enter');
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toBeFocused();
	await tab(paneel.getByRole('button', { name: 'Overnemen' }));
	await page.keyboard.press('Enter');
	await expect(editor(page)).toBeFocused();
	await expect(editor(page)).not.toContainText('Over het Digi Gilde');

	await paneel.getByRole('button', { name: 'Naar B1' }).focus();
	await page.keyboard.press('Enter');
	await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Naar B1')).toBeFocused();
	await tab(paneel.getByRole('button', { name: 'Verwerpen' }));
	await page.keyboard.press('Enter');
	await expect(editor(page)).toBeFocused();
	await expect(editor(page)).toContainText('Het Digi Handboek');
	expect(await editorValue(page)).not.toContain('DIGI');
});

test.describe('at 400 px', () => {
	test.use({ viewport: { width: 400, height: 800 } });

	test('the comparison comes above the panel and the round trip ends in the text', async ({
		page
	}) => {
		await answerHere(page);
		await page.goto(url);
		await expect(editor(page)).toContainText('Het Digi Handboek');
		await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
		await page.getByRole('button', { name: 'Meer' }).click();
		await page.getByRole('menuitemcheckbox', { name: 'Schrijfhulp' }).click();
		const paneel = page.locator('#schrijfhulp-paneel');
		await expect(paneel).toBeFocused();

		await paneel.getByRole('button', { name: 'Korter' }).click();
		const kop = vergelijking(page, 'Voorstel van Schrijfhulp: Korter');
		await expect(kop).toBeFocused();
		await expect(kop).toBeInViewport();
		const kolom = (await page
			.getByRole('region', { name: 'Voorstel van Schrijfhulp: Korter' })
			.boundingBox())!;
		const box = (await paneel.boundingBox())!;
		expect(box.y, 'the panel comes below the comparison').toBeGreaterThanOrEqual(
			kolom.y + kolom.height
		);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
			'no horizontal scroll'
		).toBe(true);

		await paneel.getByRole('button', { name: 'Overnemen' }).click();
		await expect(editor(page)).toBeFocused();
		await expect(editor(page)).not.toContainText('Over het Digi Gilde');
	});
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

	test(`the comparison in the text column passes axe in ${colorScheme} mode`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		const paneel = await openPanelHere(page);
		await paneel.getByRole('button', { name: 'Korter' }).click();
		await expect(vergelijking(page, 'Voorstel van Schrijfhulp: Korter')).toBeFocused();
		const result = await new AxeBuilder({ page })
			.include('#schrijfhulp-paneel')
			.include('#schrijfhulp-vergelijking')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(result.violations, JSON.stringify(result.violations, null, 1)).toEqual([]);
	});
}
