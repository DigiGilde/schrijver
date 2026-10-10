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
	const ook = page.locator('nldd-text.bestanden');
	await expect(ook).toHaveText(
		/^Ook in dit voorstel: afbeelding\s+melding\.png\s+Opent in nieuw tabblad\s+verwijderd\.\s*$/
	);
	await expect(ook.getByRole('link', { name: /^melding\.png/ })).toHaveAttribute(
		'href',
		/\/files$/
	);
	await expect(page.getByRole('heading', { name: 'Kwetsbaarheid melden', level: 3 })).toBeVisible();
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

/* Only this test edits privacy.md, and only on its own proposal branch. */
test('says an image may still be used where another page of the proposal only names it', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/bewerken/over/privacy.md');
	await expect(editor(page)).toContainText('Privacy');
	await page.evaluate((text) => {
		const element = document.querySelector('nldd-text-editor') as unknown as {
			value: string;
			replaceRange(from: number, to: number, text: string): void;
		};
		element.replaceRange(element.value.length, element.value.length, text);
	}, '\n\nHet stroomschema staat in melding.png.\n');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await bewaarNieuw(page);
	await expect(page).toHaveURL(/[?&]pr=\d+/);
	const voorstel = new URL(page.url()).search;

	await openZonder(page, `${KWETSBAARHEID}${voorstel}`, 'Kwetsbaarheid melden', MELDING);
	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Opslaan' }).click();
	expect(JSON.parse((await request).postData() ?? '{}').deletions).toBeUndefined();
	await expect(vraag(page)).toHaveCount(0);
	const melding = page
		.locator('nldd-banner')
		.filter({ hasText: 'melding.png blijft staan: mogelijk gebruikt op 1 pagina' });
	await expect(melding).toBeVisible();
	await expect(melding.getByText('Privacy')).toBeVisible();
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

/* Only this test edits these two pages: it merges into main, which every spec shares. */
const BOT = '/sites/digi-handboek/bewerken/kennis/reservation-bot.md';
const SSO = '/sites/digi-handboek/bewerken/kennis/sso-rijk-keycloak.md';
const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

async function bewaarNieuw(page: Page): Promise<string> {
	const bewaard = page.getByText(/Concept bewaard als voorstel #\d+/).first();
	await expect(bewaard).toBeVisible();
	return (await bewaard.textContent())!.match(/#(\d+)/)![1];
}

const stap = (page: Page, naam: string) =>
	page.locator(`nldd-step-bar-item[status="current"][text="${naam}"]`);

async function stuurIn(page: Page, nummer: string) {
	await page.goto(`/sites/digi-handboek/voorstellen/${nummer}`);
	await page.getByRole('button', { name: 'Stuur in' }).click();
	await expect(stap(page, 'Ingestuurd')).toBeVisible();
}

async function voegSamen(page: Page, nummer: string) {
	await stuurIn(page, nummer);
	await page.getByRole('button', { name: 'Voeg samen' }).click();
	await expect(stap(page, 'Samengevoegd')).toBeVisible();
}

test('refuses to merge a deletion while a page merged since shows the image', async ({ page }) => {
	await page.goto(BOT);
	await expect(editor(page)).toContainText('Reservation Bot');
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.getByRole('button', { name: 'Afbeelding invoegen' }).click();
	const dialog = page.locator('nldd-modal-dialog');
	await dialog
		.locator('input[type=file]')
		.setInputFiles({ name: 'bot.png', mimeType: 'image/png', buffer: PIXEL });
	await dialog.getByLabel('Alt-tekst').fill('De bot');
	await dialog.getByRole('button', { name: 'Invoegen' }).click();
	await expect(editor(page)).toContainText('![De bot](');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await voegSamen(page, await bewaarNieuw(page));

	const fragment = '![De bot](../afbeeldingen/reservation-bot/bot.png)';
	await openZonder(page, BOT, 'Reservation Bot', fragment);
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await vraag(page).getByRole('checkbox', { name: 'Verwijder ook dit bestand' }).check();
	await vraag(page).getByRole('button', { name: 'Bewaar' }).click();
	const weg = await bewaarNieuw(page);
	await stuurIn(page, weg);

	await page.goto(SSO);
	await expect(editor(page)).toContainText('SSO-Rijk');
	await page.evaluate((text) => {
		const element = document.querySelector('nldd-text-editor') as unknown as {
			value: string;
			replaceRange(from: number, to: number, text: string): void;
		};
		element.replaceRange(element.value.length, element.value.length, text);
	}, `\n\n${fragment}\n`);
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await voegSamen(page, await bewaarNieuw(page));

	await page.goto(`/sites/digi-handboek/voorstellen/${weg}`);
	await page.getByRole('button', { name: 'Voeg samen' }).click();
	await expect(page.locator('nldd-banner[variant="critical"]')).toHaveAttribute(
		'text',
		'Niet samengevoegd: dit voorstel verwijdert bot.png, maar die afbeelding staat nog op docs/kennis/sso-rijk-keycloak.md.'
	);
	await expect(stap(page, 'Ingestuurd')).toBeVisible();
	const bestand = await page.request.get(
		`/api/sites/digi-handboek/bestand?${new URLSearchParams({ pad: 'docs/afbeeldingen/reservation-bot/bot.png' })}`
	);
	expect(bestand.status()).toBe(200);
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
