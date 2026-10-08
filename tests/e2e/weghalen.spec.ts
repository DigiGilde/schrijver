import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/* The fake site shows melding.png on this page only, and schema.png on werkwijze/index.md and two more. */
const KWETSBAARHEID = '/sites/digi-handboek/bewerken/over/kwetsbaarheid.md';
const WERKWIJZE = '/sites/digi-handboek/bewerken/werkwijze/index.md';
const MELDING = '![Stroomschema van een melding](../afbeeldingen/kwetsbaarheid/melding.png)';
const SCHEMA = '![Schema van onze werkwijze](../afbeeldingen/werkwijze/schema.png)';
const MELDING_PAD = 'docs/afbeeldingen/kwetsbaarheid/melding.png';
const VRAAG = 'Deze afbeelding staat nu op geen enkele pagina meer. Ook het bestand verwijderen?';

/* A first visit shows the public-draft coach mark on the save button; editor.spec.ts covers it. */
test.beforeEach(({ page }) =>
	page.addInitScript(() => {
		for (const site of ['digi-handboek', 'moza-site'])
			localStorage.setItem(`schrijver:${site}:openbaar-uitgelegd`, '1');
	})
);

const editor = (page: Page) => page.locator('nldd-text-editor .cm-content');
const vraag = (page: Page) => page.getByRole('group', { name: VRAAG });

/** Opens a page and deletes `fragment` from its text, as a writer selecting it and pressing Delete would. */
async function openZonder(page: Page, url: string, kop: string, fragment: string) {
	await page.goto(url);
	await expect(editor(page)).toContainText(kop);
	await page.evaluate((fragment) => {
		const element = document.querySelector('nldd-text-editor') as unknown as {
			value: string;
			replaceRange(from: number, to: number, text: string): void;
		};
		const at = element.value.indexOf(fragment);
		if (at === -1) throw new Error(`Niet in de tekst: ${fragment}`);
		element.replaceRange(at, at + fragment.length, '');
	}, fragment);
}

/** The URLs of the requests to `path` from here on. */
function verzoeken(page: Page, path: string): string[] {
	const urls: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.endsWith(path)) urls.push(request.url());
	});
	return urls;
}

const bestand = (page: Page, ref?: string) =>
	page.request.get(
		`/api/sites/digi-handboek/bestand?${new URLSearchParams({ pad: MELDING_PAD, ...(ref ? { ref } : {}) })}`
	);

test('asks before deleting an image no other page shows, and deletes it with the text', async ({
	page
}) => {
	await openZonder(page, KWETSBAARHEID, 'Kwetsbaarheid melden', MELDING);
	const opslaan = verzoeken(page, '/opslaan');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();

	const blok = vraag(page);
	await expect(blok).toBeVisible();
	await expect(blok).toBeFocused();
	await expect(blok.getByText('melding.png', { exact: true })).toBeVisible();
	const duimnagel = blok.locator('nldd-image img');
	await expect(duimnagel).toHaveAttribute(
		'src',
		'/api/sites/digi-handboek/bestand?pad=docs%2Fafbeeldingen%2Fkwetsbaarheid%2Fmelding.png'
	);
	await expect
		.poll(() => duimnagel.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth))
		.toBe(160);
	const vinkje = blok.getByRole('checkbox', { name: 'Verwijder ook dit bestand' });
	await expect(vinkje).not.toBeChecked();
	await expect(page.getByRole('button', { name: 'Concept bewaren' })).toHaveCount(0);
	expect(opslaan).toEqual([]);

	await vinkje.check();
	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await blok.getByRole('button', { name: 'Bewaar' }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.deletions).toEqual([MELDING_PAD]);
	expect(sent.body).not.toContain('melding.png');
	const bewaard = page.getByText(/Concept bewaard als voorstel #\d+/).first();
	await expect(bewaard).toBeVisible();
	await expect(
		page.locator('nldd-notification').getByText('Ook verwijderd: melding.png')
	).toBeVisible();
	await expect(vraag(page)).toHaveCount(0);

	const branch = new URL(page.url()).searchParams.get('branch')!;
	expect((await bestand(page, branch)).status()).toBe(404);
	expect((await bestand(page)).status()).toBe(200);

	await page.goto(`/sites/digi-handboek/voorstellen/${new URL(page.url()).searchParams.get('pr')}`);
	const bestanden = page.getByRole('table', { name: 'Alle gewijzigde bestanden' });
	await expect(bestanden.getByRole('row').filter({ hasText: MELDING_PAD })).toContainText(
		'verwijderd'
	);
	await expect(
		bestanden.getByRole('row').filter({ hasText: 'docs/over/kwetsbaarheid.md' })
	).toContainText('gewijzigd');
});

test('keeps an image other pages show, and says on which', async ({ page }) => {
	await openZonder(page, WERKWIJZE, 'Onze werkwijze', SCHEMA);
	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.deletions).toBeUndefined();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(vraag(page)).toHaveCount(0);

	const melding = page
		.locator('nldd-banner')
		.filter({ hasText: "schema.png blijft staan: ook gebruikt op 2 pagina's" });
	await expect(melding).toBeVisible();
	await expect(melding.getByText('Toegankelijkheid en Beslissingen logboek')).toBeVisible();
});

test('asks nothing and checks nothing when no image goes', async ({ page }) => {
	const checks = verzoeken(page, '/afbeeldingsgebruik');
	await page.goto(KWETSBAARHEID);
	await expect(editor(page)).toContainText('Kwetsbaarheid melden');
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nEen regel erbij.');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(vraag(page)).toHaveCount(0);
	await expect(page.locator('nldd-banner[variant="neutral"]')).toHaveCount(0);
	expect(checks).toEqual([]);
});

test('Annuleer saves nothing; Bewaar without the tick keeps the file and asks no more', async ({
	page
}) => {
	await openZonder(page, KWETSBAARHEID, 'Kwetsbaarheid melden', MELDING);
	const opslaan = verzoeken(page, '/opslaan');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await vraag(page).getByRole('button', { name: 'Annuleer' }).click();
	await expect(vraag(page)).toHaveCount(0);
	await expect(editor(page)).toBeFocused();
	await expect(page.getByRole('button', { name: 'Concept bewaren' })).toBeVisible();
	expect(opslaan).toEqual([]);

	await page.keyboard.press('ControlOrMeta+s');
	await expect(vraag(page)).toBeFocused();
	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await vraag(page).getByRole('button', { name: 'Bewaar' }).click();
	expect(JSON.parse((await request).postData() ?? '{}').deletions).toBeUndefined();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	const branch = new URL(page.url()).searchParams.get('branch')!;
	expect((await bestand(page, branch)).status()).toBe(200);

	const checks = verzoeken(page, '/afbeeldingsgebruik');
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' Nog iets.');
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(vraag(page)).toHaveCount(0);
	expect(checks).toEqual([]);
});

test.describe('the question at 320 px', () => {
	test.use({ viewport: { width: 320, height: 800 } });

	test('reflows without scrolling sideways (WCAG 1.4.10)', async ({ page }) => {
		await openZonder(page, KWETSBAARHEID, 'Kwetsbaarheid melden', MELDING);
		await page.keyboard.press('ControlOrMeta+s');
		await expect(vraag(page)).toBeVisible();
		const width = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(width).toBeLessThanOrEqual(320);
		const box = (await vraag(page).boundingBox())!;
		expect(box.x + box.width).toBeLessThanOrEqual(320);
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`the question, ${colorScheme} mode`, () => {
		test.use({ colorScheme });

		test('has no axe violations', async ({ page }) => {
			await openZonder(page, KWETSBAARHEID, 'Kwetsbaarheid melden', MELDING);
			await page.getByRole('button', { name: 'Concept bewaren' }).click();
			await expect(vraag(page)).toBeVisible();
			await vraag(page).getByRole('checkbox', { name: 'Verwijder ook dit bestand' }).check();
			const result = await new AxeBuilder({ page })
				.include('[role="group"][aria-label^="Deze afbeelding"]')
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
				.analyze();
			expect(result.violations, JSON.stringify(result.violations, null, 1)).toEqual([]);
		});
	});
}
