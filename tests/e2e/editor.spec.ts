import { expect, test, type Page } from '@playwright/test';

const url = '/sites/digi-handboek/bewerken/index.md';
const key = 'schrijver:digi-handboek:new:index.md';

/** The whole text: the editor only renders the lines near the viewport. */
const editorValue = (page: Page) =>
	page.evaluate(
		() => (document.querySelector('nldd-text-editor') as unknown as { value: string }).value
	);

/** Below 1008 px the public-draft explanation is a banner instead of the coach mark. */
const uitlegBanner = (page: Page) =>
	page.getByRole('status').filter({ hasText: 'Je concept wordt openbaar' });
const uitgelegd = (page: Page, site: string) =>
	page.evaluate((id) => localStorage.getItem(`schrijver:${id}:openbaar-uitgelegd`), site);
/** A new MOZa page whose required description is still empty, so its properties open on arrival. */
const nieuwOnderwerp = (titel: string) =>
	`/sites/moza-site/bewerken/onderwerpen/${titel.toLowerCase().replaceAll(' ', '-')}.md?nieuw=1&soort=Onderwerp&map=onderwerpen&titel=${encodeURIComponent(titel)}`;

/* A first visit shows the public-draft coach mark; the tests tagged @uitleg are about it, the others start past it. */
test.beforeEach(async ({ page }, testInfo) => {
	if (testInfo.tags.includes('@uitleg')) return;
	await page.addInitScript(() => {
		for (const site of ['digi-handboek', 'moza-site'])
			localStorage.setItem(`schrijver:${site}:openbaar-uitgelegd`, '1');
	});
});

test('opens a file, follows edits and offers to restore a draft', async ({ page }) => {
	await page.goto(url);

	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('Het Digi Handboek');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Het Digi Handboek');
	await expect(
		page.getByText('docs/index.md · Openbaar concept · De titel is de eerste kop van de tekst')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Titel wijzigen' })).toHaveCount(0);
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toHaveCount(0);

	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\n## Nieuwe kop uit e2e');
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	await expect(page.locator('nldd-rich-text h2', { hasText: 'Nieuwe kop uit e2e' })).toBeVisible();

	await expect
		.poll(() => page.evaluate((k) => localStorage.getItem(k), key))
		.toContain('Nieuwe kop uit e2e');

	await page.reload();
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toBeVisible();
	await page.getByRole('button', { name: 'Herstel', exact: true }).click();
	await expect.poll(() => editorValue(page)).toContain('Nieuwe kop uit e2e');
	await expect(editor).toBeFocused();

	await page.reload();
	await page.getByRole('button', { name: 'Gooi weg' }).click();
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toHaveCount(0);
	await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

test('the text has no visible label and keeps its name, right below the toolbar', async ({
	page
}) => {
	await page.goto(url);
	const tekst = page.getByRole('textbox', { name: 'Tekst', exact: true });
	await expect(tekst).toBeVisible();
	await expect(page.locator('nldd-form-field[label="Tekst"]')).toHaveCount(0);
	await expect(page.getByText('Tekst', { exact: true })).toHaveCount(0);
	const toolbar = (await page.locator('nldd-toolbar[label="Opmaak"]').boundingBox())!;
	const editor = (await page.locator('nldd-text-editor').boundingBox())!;
	expect(editor.y - (toolbar.y + toolbar.height), 'nothing between toolbar and text').toBeLessThan(
		24
	);
});

test('the page title follows the first heading as you type', async ({ page }) => {
	await page.goto(url);
	await page.locator('nldd-text-editor .cm-line', { hasText: '# Het Digi Handboek' }).click();
	await page.keyboard.press('End');
	await page.keyboard.type(' bewerkt');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Het Digi Handboek bewerkt');
});

test('a page without a title of its own is called by its file name', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/kennis/index.md');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kennis');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('Alleen tekst, geen kop');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('index.md');
});

test('a link in Voorbeeld opens a new tab and the editor keeps its own file', async ({
	page,
	context
}) => {
	await page.goto('/sites/digi-handboek/bewerken/contact.md');
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('Heb je een vraag over het Digi Gilde');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nAangevuld bij contact');

	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	const link = page
		.getByRole('region', { name: 'Voorbeeld' })
		.getByRole('link', { name: 'bijdragen aan het Digi Handboek (opent in nieuw tabblad)' });
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	const [tab] = await Promise.all([context.waitForEvent('page'), link.click()]);
	await expect(tab).toHaveURL(/\/bewerken\/bijdragen-aan-handboek\.md$/);
	await tab.close();

	await expect(page).toHaveURL(/\/bewerken\/contact\.md$/);
	await expect(page).toHaveTitle(/^Contact bewerken/);
	await page.getByRole('radio', { name: 'Schrijven' }).click();
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' En nog een zin.');
	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.path).toBe('docs/contact.md');
	expect(sent.body).toContain('Aangevuld bij contact En nog een zin.');
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
});

test('moving client-side to another page starts a session for that page', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/contact.md');
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toContainText('Heb je een vraag over het Digi Gilde');
	// SvelteKit keeps the page component when only the file changes; a link in the app does that.
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/sites/digi-handboek/bewerken/offboarding.md';
		link.textContent = 'Naar offboarding';
		document.querySelector('#inhoud')!.prepend(link);
	});
	let release = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route(/__data\.json/, async (route) => {
		await held;
		await route.continue();
	});
	await page.getByRole('link', { name: 'Naar offboarding' }).click();
	// Typed while the next page loads, so the draft is flushed as this page leaves.
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nAlleen voor contact');
	release();

	await expect(page).toHaveURL(/\/bewerken\/offboarding\.md$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Offboarding');
	await expect.poll(() => editorValue(page)).toContain('We vinden het jammer om je te zien gaan');
	expect(await editorValue(page)).not.toContain('Alleen voor contact');
	await expect(page.getByText('Niet-bewaarde tekst gevonden')).toHaveCount(0);
	const drafts = await page.evaluate(() => ({
		contact: localStorage.getItem('schrijver:digi-handboek:new:contact.md'),
		offboarding: localStorage.getItem('schrijver:digi-handboek:new:offboarding.md')
	}));
	expect(drafts.contact).toContain('Alleen voor contact');
	expect(drafts.offboarding).toBeNull();

	await page.unroute(/__data\.json/);
	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.path).toBe('docs/offboarding.md');
	expect(sent.body).toContain('We vinden het jammer om je te zien gaan');
	expect(sent.body).not.toContain('Alleen voor contact');
});

test('after the first save Back from another page opens the proposal, and the session stays', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/bewerken/werkwijze/principes.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nBewaard voor de terugknop.');
	// A mark on the editor element: a remount would replace the element and lose it.
	await page.evaluate(
		() => ((document.querySelector('nldd-text-editor') as unknown as { sessie: number }).sessie = 1)
	);
	const geladen: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('__data.json')) geladen.push(request.url());
	});
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(page).toHaveURL(/\?branch=schrijver%2Fdigi-handboek%2F[^&]+&pr=\d+$/);
	const sessie = await page.evaluate(
		() => (document.querySelector('nldd-text-editor') as unknown as { sessie?: number }).sessie
	);
	expect(sessie, 'the editor was not mounted again').toBe(1);
	expect(geladen, 'the save loads no page data').toEqual([]);

	await page.getByRole('link', { name: 'Digi Handboek' }).first().click();
	await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
	await page.goBack();
	await expect(page.getByRole('button', { name: 'Bewaar', exact: true })).toBeVisible();
	await expect.poll(() => editorValue(page)).toContain('Bewaard voor de terugknop.');
});

test('Back to a new page after its first save opens the proposal', async ({ page }) => {
	await page.goto(
		'/sites/digi-handboek/bewerken/kennis/terug-na-bewaren.md?nieuw=1&map=kennis&titel=Terug+na+bewaren'
	);
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nDe eerste versie.');
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(page).toHaveURL(/\/bewerken\/kennis\/terug-na-bewaren\.md\?branch=/);

	await page.getByRole('link', { name: 'Digi Handboek' }).first().click();
	await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
	await page.goBack();
	await expect(page.getByRole('button', { name: 'Bewaar', exact: true })).toBeVisible();
	await expect.poll(() => editorValue(page)).toContain('De eerste versie.');
});

test('rejects path traversal and unknown files', async ({ request }) => {
	expect((await request.get('/sites/digi-handboek/bewerken/..%2f..%2fx.md')).status()).toBe(400);
	expect((await request.get('/sites/digi-handboek/bewerken/bestaat-niet.md')).status()).toBe(404);
});

test('toolbar buttons format through the editor', async ({ page }) => {
	await page.goto(url);
	const editor = page.locator('nldd-text-editor .cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.getByRole('button', { name: 'Vet' }).click();
	await page.keyboard.type('dikgedrukt');
	await expect(page.getByRole('button', { name: 'Vet' })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	await expect(page.locator('nldd-rich-text strong', { hasText: 'dikgedrukt' })).toBeVisible();
});

test.describe('one writing surface at 1280 px', () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test('shows no preview next to the editor', async ({ page }) => {
		await page.goto(url);
		const editor = page.locator('nldd-text-editor');
		await expect(editor).toBeVisible();
		await expect(page.getByRole('radio', { name: 'Schrijven' })).toBeChecked();
		await expect(page.getByRole('region', { name: 'Voorbeeld' })).toHaveCount(0);
		await expect(page.locator('nldd-rich-text')).toHaveCount(0);
		const box = await editor.boundingBox();
		const column = await page.locator('nldd-toolbar[label="Opmaak"]').boundingBox();
		expect(box!.width).toBeGreaterThan(column!.width - 2);
	});

	test('Voorbeeld shows the rendered page, Schrijven brings back the typed text', async ({
		page
	}) => {
		await page.goto(url);
		const editor = page.locator('nldd-text-editor .cm-content');
		await editor.click();
		await page.keyboard.press('ControlOrMeta+End');
		await page.keyboard.type('\n\nGetypt voor het voorbeeld');

		await page.getByRole('radio', { name: 'Voorbeeld' }).click();
		const voorbeeld = page.getByRole('region', { name: 'Voorbeeld' });
		await expect(voorbeeld.locator('nldd-rich-text h1')).toHaveText('Het Digi Handboek');
		await expect(voorbeeld).toContainText('Getypt voor het voorbeeld');
		await expect(editor).toBeHidden();
		await expect(page.getByRole('button', { name: 'Vet' })).toHaveCount(0);

		await page.getByRole('radio', { name: 'Schrijven' }).click();
		await expect(voorbeeld).toHaveCount(0);
		await expect(editor).toBeVisible();
		expect(await editorValue(page)).toContain('Getypt voor het voorbeeld');
		// The undo history survived the preview: the editor was hidden, not rebuilt.
		await editor.focus();
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(() => editorValue(page)).not.toContain('Getypt voor het voorbeeld');
	});

	test('the toolbar sticks below the title bar to the end of a long page', async ({ page }) => {
		await page.goto(url);
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		const toolbar = page.locator('nldd-toolbar[label="Opmaak"]');
		await expect(toolbar).toBeInViewport();
		await expect
			.poll(async () => {
				const bar = (await page.locator('nldd-top-title-bar').first().boundingBox())!;
				return (await toolbar.boundingBox())!.y - (bar.y + bar.height);
			}, 'the toolbar sits just below the title bar, not under it')
			.toBeGreaterThanOrEqual(0);
		const bar = (await page.locator('nldd-top-title-bar').first().boundingBox())!;
		expect((await toolbar.boundingBox())!.y).toBeLessThan(bar.y + bar.height + 16);
		await page.getByRole('button', { name: 'Vet' }).click();
		await expect(page.getByRole('button', { name: 'Vet' })).toHaveAttribute('aria-pressed', 'true');
	});

	test('the save button stays in view at the end of a long page', async ({ page }) => {
		await page.goto(url);
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		const height = await page.evaluate(() => document.documentElement.scrollHeight);
		expect(height, 'the page is longer than the window').toBeGreaterThan(1800);
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		await expect(page.getByRole('button', { name: 'Bewaar', exact: true })).toBeInViewport();
		await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
		await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	});
});

for (const viewport of [
	{ width: 1280, height: 800 },
	{ width: 400, height: 700 }
]) {
	test.describe(`the caret at ${viewport.width} px`, () => {
		test.use({ viewport });

		// From the end the caret needs some 25 lines to reach the bars; 40 also walks it past them.
		test('moving up through a long page keeps the caret line below the toolbar', async ({
			page
		}) => {
			await page.goto(url);
			await page.locator('nldd-text-editor .cm-content').click();
			await page.keyboard.press('ControlOrMeta+End');
			const clearance = () =>
				page.evaluate(() => {
					const editor = document.querySelector('nldd-text-editor') as unknown as {
						getSelection(): { rect: DOMRect | null };
					};
					const bars = [
						document.querySelector('nldd-top-title-bar')!,
						document.querySelector('nldd-toolbar[label="Opmaak"]')!
					].map((bar) => bar.getBoundingClientRect().bottom);
					return (editor.getSelection().rect?.top ?? -Infinity) - Math.max(...bars);
				});
			for (let line = 1; line <= 40; line++) {
				await page.keyboard.press('ArrowUp');
				await expect.poll(clearance, `caret ${line} lines up`).toBeGreaterThanOrEqual(0);
			}
		});
	});
}

test.describe('at 320 by 256 px, a 1280 px screen at 400% zoom', () => {
	test.use({ viewport: { width: 320, height: 256 } });

	const bottoms = (page: Page) =>
		page.evaluate(() => {
			const bottom = (selector: string) =>
				document.querySelector(selector)!.getBoundingClientRect().bottom;
			return {
				header: bottom('nldd-page > [slot="header"]'),
				toolbar: bottom('nldd-toolbar[label="Opmaak"]')
			};
		});

	test('the header and the toolbar scroll away with the page, so the text gets the room', async ({
		page
	}) => {
		await page.goto(url);
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2));
		await expect
			.poll(async () => (await bottoms(page)).toolbar, 'the toolbar scrolled away')
			.toBeLessThanOrEqual(0);
		expect((await bottoms(page)).header, 'the header scrolled away').toBeLessThanOrEqual(0);
		const text = (await page.locator('nldd-text-editor').boundingBox())!;
		expect(text.y, 'the text fills the window from the top').toBeLessThanOrEqual(0);
		expect(text.y + text.height).toBeGreaterThanOrEqual(256);

		await page.setViewportSize({ width: 320, height: 568 });
		await expect
			.poll(async () => (await bottoms(page)).toolbar, 'a taller window keeps the bars in view')
			.toBeGreaterThan(0);
	});

	test('the caret line can go up to the top of the window', async ({ page }) => {
		await page.goto(url);
		await page.locator('nldd-text-editor .cm-content').click();
		await page.keyboard.press('ControlOrMeta+End');
		for (let line = 1; line <= 30; line++) await page.keyboard.press('ArrowUp');
		// The caret code scrolls a frame after the selection moves; read the caret once it has.
		const top = await page.evaluate(async () => {
			for (let frame = 0; frame < 3; frame++)
				await new Promise((done) => requestAnimationFrame(done));
			const editor = document.querySelector('nldd-text-editor') as unknown as {
				getSelection(): { rect: DOMRect | null };
			};
			return editor.getSelection().rect?.top ?? -1;
		});
		expect(top, 'nothing keeps the caret line down').toBeLessThan(64);
		expect(top, 'the caret line stays in view').toBeGreaterThanOrEqual(0);
	});
});

test('the properties sheet opens from the toolbar and its values are saved', async ({ page }) => {
	await page.goto(url);
	await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Samenvatting' })).toBeHidden();

	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeVisible();
	// The content is slotted into the dialog, so it is found from the sheet element.
	const sheet = page.locator('nldd-sheet');
	await expect(sheet.getByText('Deze waarden worden met de pagina bewaard.')).toBeVisible();
	await sheet.getByRole('textbox', { name: 'Samenvatting' }).fill('Samenvatting uit de sheet');
	await sheet.getByRole('button', { name: 'Sluit' }).click();
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Eigenschappen' })).toBeFocused();

	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	const sent = JSON.parse((await request).postData() ?? '{}');
	expect(sent.frontmatter.description).toBe('Samenvatting uit de sheet');
	expect(sent.changedKeys).toContain('description');
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await expect(page.getByRole('textbox', { name: 'Samenvatting' })).toHaveValue(
		'Samenvatting uit de sheet'
	);
});

test('the properties sheet sits in the document root and leaves with the page', async ({
	page
}) => {
	await page.goto(url);
	await expect
		.poll(() => page.evaluate(() => document.querySelector('nldd-sheet')?.parentElement?.localName))
		.toBe('body');
	await page.getByRole('link', { name: 'Digi Handboek' }).first().click();
	await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
	await expect(
		page.locator('nldd-sheet', { has: page.locator('nldd-title[text="Eigenschappen"]') })
	).toHaveCount(0);
});

test('the toolbar counts the empty required properties before a save', async ({ page }) => {
	await page.goto('/sites/moza-site/bewerken/contact.md');
	const sheet = page.locator('nldd-sheet');
	const dialog = page.getByRole('dialog', { name: 'Eigenschappen' });
	const een = page.getByRole('button', { name: 'Eigenschappen, 1 verplicht veld leeg' });
	await expect(een).toBeVisible();
	await expect(een).toHaveText('Eigenschappen (1 leeg)');

	await een.click();
	await sheet.getByRole('textbox', { name: 'Titel' }).fill('');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	const twee = page.getByRole('button', { name: 'Eigenschappen, 2 verplichte velden leeg' });
	await expect(twee).toHaveText('Eigenschappen (2 leeg)');

	await twee.click();
	await sheet.getByRole('textbox', { name: 'Titel' }).fill('Contact');
	await sheet.getByRole('textbox', { name: 'Beschrijving' }).fill('Hoe je het team bereikt.');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	const geen = page.getByRole('button', { name: 'Eigenschappen', exact: true });
	await expect(geen).toHaveText('Eigenschappen');
	await expect(page.getByRole('button', { name: /verplicht/ })).toHaveCount(0);
});

test('in the toolbar menu Eigenschappen spells out the count', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto('/sites/moza-site/bewerken/contact.md');
	await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
	await page.getByRole('button', { name: 'Meer' }).click();
	const item = page.getByRole('menuitem', { name: 'Eigenschappen (1 verplicht veld leeg)' });
	await expect(item).toBeVisible();
	const box = (await item.boundingBox())!;
	expect(box.x + box.width, 'the item fits the viewport').toBeLessThanOrEqual(320);
});

test('a save with a missing required field offers to open the properties', async ({ page }) => {
	await page.goto('/sites/moza-site/bewerken/contact.md');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact');
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();

	const melding = page
		.getByRole('alert')
		.filter({ hasText: 'Vul de gemarkeerde velden in bij Eigenschappen' });
	await expect(page.locator('.foutmelding')).toBeFocused();
	await expect(melding.getByRole('listitem')).toHaveText(['Beschrijving is verplicht']);
	const aanpassen = melding.getByRole('button', { name: 'Eigenschappen wijzigen' });
	for (let i = 0; i < 4; i++) {
		await page.keyboard.press('Tab');
		if (await aanpassen.evaluate((el) => el.matches(':focus-within'))) break;
	}
	await expect(aanpassen, 'the banner keeps its button in the Tab order').toBeFocused();
	await aanpassen.click();

	const dialog = page.getByRole('dialog', { name: 'Eigenschappen' });
	await expect(dialog).toBeVisible();
	const sheet = page.locator('nldd-sheet');
	await expect(sheet.locator('nldd-text-field[invalid]')).toHaveCount(1);
	await expect(sheet.getByText('Beschrijving is verplicht')).toBeVisible();

	await sheet.getByRole('textbox', { name: 'Beschrijving' }).fill('Hoe je het team bereikt.');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
});

test('a new page shows its properties once when a required one is still empty', async ({
	page
}) => {
	await page.goto(
		'/sites/moza-site/bewerken/onderwerpen/nieuw-onderwerp.md?nieuw=1&soort=Onderwerp&map=onderwerpen&titel=Nieuw+onderwerp'
	);
	const dialog = page.getByRole('dialog', { name: 'Eigenschappen' });
	await expect(dialog).toBeVisible();
	const sheet = page.locator('nldd-sheet');
	await expect(sheet.getByRole('textbox', { name: 'Titel' })).toHaveValue('Nieuw onderwerp');
	await sheet.getByRole('textbox', { name: 'Beschrijving' }).fill('Een onderwerp uit e2e.');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.locator('nldd-text-editor .cm-content')).toBeFocused();

	const request = page.waitForRequest((r) => r.url().endsWith('/opslaan'));
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	expect(JSON.parse((await request).postData() ?? '{}').frontmatter).toEqual({
		title: 'Nieuw onderwerp',
		description: 'Een onderwerp uit e2e.'
	});
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await expect(dialog).toBeHidden();
});

test('a new page without required properties opens on the text', async ({ page }) => {
	await page.goto(
		'/sites/digi-handboek/bewerken/kennis/nieuwe-kennis.md?nieuw=1&map=kennis&titel=Nieuwe+kennis'
	);
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Nieuwe kennis');
	await expect(page.locator('nldd-sheet')).toHaveCount(1);
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
	);
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeHidden();
});

test('the title of a field-titled page follows the field', async ({ page }) => {
	await page.goto('/sites/moza-site/bewerken/contact.md');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact');
	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await page.getByRole('textbox', { name: 'Titel' }).fill('Contact met het team');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeHidden();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact met het team');
});

test('the title button opens the properties with the focus in the title field', async ({
	page
}) => {
	await page.goto('/sites/moza-site/bewerken/over-moza.md');
	const knop = page.getByRole('button', { name: 'Titel wijzigen' });
	await expect(
		page.locator('#paginatitel > [slot="end"]').getByRole('button', { name: 'Titel wijzigen' })
	).toHaveCount(1);
	await expect(
		knop.getByText('Titel wijzigen', { exact: true }),
		'the button says what it does'
	).toBeVisible();
	await expect(page.getByText('De titel is de eerste kop van de tekst')).toHaveCount(0);

	await knop.click();
	const dialog = page.getByRole('dialog', { name: 'Eigenschappen' });
	await expect(dialog).toBeVisible();
	const veld = page.locator('nldd-sheet').getByRole('textbox', { name: 'Titel' });
	await expect(veld).toBeFocused();
	await veld.fill('Over MOZa');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Over MOZa');
	await expect(knop).toBeFocused();

	await page.getByRole('button', { name: 'Eigenschappen' }).click();
	await expect(dialog).toBeVisible();
	await expect(veld).not.toBeFocused();
});

test('below 641 px the title button is an icon, so a long title keeps its words whole', async ({
	page
}) => {
	await page.setViewportSize({ width: 400, height: 800 });
	await page.goto('/sites/moza-site/bewerken/onderwerpen/actualiteitenservice.md');
	const knop = page.getByRole('button', { name: 'Titel wijzigen' });
	await expect(knop).toBeVisible();
	await expect(knop.getByText('Titel wijzigen', { exact: true })).toBeHidden();
	const regels = await page.evaluate(() => {
		const kop = document.querySelector('#paginatitel')!.shadowRoot!.querySelector('h1')!;
		const tekst = document.createRange();
		tekst.selectNodeContents(kop);
		return new Set([...tekst.getClientRects()].map((regel) => Math.round(regel.top))).size;
	});
	expect(regels, '"Actualiteitenservice" on one line').toBe(1);

	await knop.click();
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(knop).toBeFocused();
});

test('the properties and the help page say that a new title keeps the file name', async ({
	page
}) => {
	const regel =
		'De bestandsnaam is het adres van de pagina op de site. Die verandert niet als je de titel wijzigt.';
	await page.goto('/sites/moza-site/bewerken/over-moza.md');
	await page.getByRole('button', { name: 'Titel wijzigen' }).click();
	await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeVisible();
	await expect(page.locator('nldd-sheet').getByText(regel)).toBeVisible();

	await page.goto('/help');
	await expect(page.getByText(regel)).toBeVisible();
});

test(
	'the save button says once that a draft becomes public, until the first save',
	{ tag: '@uitleg' },
	async ({ page }) => {
		await page.goto('/sites/digi-handboek/bewerken/onboarding/eerste-dagen.md');
		const uitleg = page.getByRole('dialog', { name: 'Je concept wordt openbaar' });
		await expect(uitleg).toBeVisible();
		await expect(uitleg).toContainText(
			'Iedereen kan het op GitHub lezen zodra je het bewaart, ook voordat je het instuurt.'
		);
		await expect(
			page.getByText('docs/onboarding/eerste-dagen.md · Openbaar concept')
		).toBeVisible();
		await expect(page.getByText('openbaar leesbaar')).toHaveCount(0);

		await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
		await expect(uitleg).toBeHidden();
		await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();

		await page.goto('/sites/digi-handboek/bewerken/onboarding/accounts.md');
		const coachmark = page.locator('nldd-just-in-time-education');
		await expect(coachmark).toBeAttached();
		await expect(coachmark).not.toHaveAttribute('active');

		await page.goto('/sites/moza-site/bewerken/over-moza.md');
		await expect(uitleg).toBeVisible();
	}
);

test(
	'the public-draft coach mark comes back when clicked past, not when dismissed',
	{ tag: '@uitleg' },
	async ({ page }) => {
		await page.goto('/sites/moza-site/bewerken/onderwerpen/notificatiedienst.md');
		const uitleg = page.getByRole('dialog', { name: 'Je concept wordt openbaar' });
		await expect(uitleg).toBeVisible();
		await page.locator('nldd-text-editor .cm-content').click();
		await expect(uitleg).toBeHidden();

		await page.reload();
		await expect(uitleg).toBeVisible();
		await uitleg.getByRole('button', { name: 'Verberg' }).click();
		await expect(uitleg).toBeHidden();

		await page.reload();
		const coachmark = page.locator('nldd-just-in-time-education');
		await expect(coachmark).toBeAttached();
		await expect(coachmark).not.toHaveAttribute('active');
	}
);

test(
	'the public-draft coach mark takes the focus on arrival and hands it to the save button',
	{ tag: '@uitleg' },
	async ({ page }) => {
		await page.goto('/sites/digi-handboek/bewerken/over/licentie.md');
		const uitleg = page.getByRole('dialog', { name: 'Je concept wordt openbaar' });
		await expect(uitleg).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(uitleg).toBeHidden();
		await expect(page.getByRole('button', { name: 'Bewaar', exact: true })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Vet' })).toBeFocused();

		await page.reload();
		const coachmark = page.locator('nldd-just-in-time-education');
		await expect(coachmark).toBeAttached();
		await expect(coachmark).not.toHaveAttribute('active');
	}
);

test(
	'on a narrow screen the public-draft explanation leaves the toolbar free',
	{ tag: '@uitleg' },
	async ({ page }) => {
		await page.setViewportSize({ width: 400, height: 800 });
		await page.goto('/sites/digi-handboek/bewerken/over/licentie.md');
		await expect(page.getByRole('button', { name: 'Bewaar', exact: true })).toBeVisible();
		// Where the coach mark shows, it opens within a frame of the button getting its box.
		await page.evaluate(
			() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
		);
		await expect(page.locator('nldd-just-in-time-education')).not.toHaveAttribute('active');
		await expect(uitlegBanner(page)).toBeVisible();
		await page.getByRole('button', { name: 'Meer' }).click();
		await expect(page.getByRole('menuitemcheckbox', { name: 'Vet' })).toBeVisible();
	}
);

test(
	'below 1008 px a banner above the toolbar explains a public draft, until a dismissal',
	{ tag: '@uitleg' },
	async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 800 });
		await page.goto('/sites/moza-site/bewerken/onderwerpen/actualiteitenservice.md');
		const banner = uitlegBanner(page);
		await expect(banner).toContainText(
			'Iedereen kan het op GitHub lezen zodra je het bewaart, ook voordat je het instuurt.'
		);
		await expect(page.locator('nldd-just-in-time-education')).not.toHaveAttribute('active');
		const box = (await banner.boundingBox())!;
		const toolbar = (await page.locator('nldd-toolbar[label="Opmaak"]').boundingBox())!;
		expect(box.y + box.height, 'the banner sits above the toolbar').toBeLessThanOrEqual(toolbar.y);

		await banner.getByRole('button', { name: 'Verberg' }).click();
		await expect(banner).toHaveCount(0);
		await expect(page.locator('nldd-text-editor .cm-content')).toBeFocused();
		expect(await uitgelegd(page, 'moza-site')).toBe('1');

		await page.reload();
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		await page.evaluate(
			() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
		);
		await expect(banner).toHaveCount(0);
	}
);

test(
	'below 1008 px a save after the banner counts as seen',
	{ tag: '@uitleg' },
	async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 800 });
		await page.goto('/sites/moza-site/bewerken/onderwerpen/open-werken.md');
		await expect(uitlegBanner(page)).toBeVisible();
		await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
		await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
		await expect(uitlegBanner(page)).toHaveCount(0);
		expect(await uitgelegd(page, 'moza-site')).toBe('1');
	}
);

for (const { width, uitleg } of [
	{
		width: 1280,
		uitleg: (page: Page) => page.getByRole('dialog', { name: 'Je concept wordt openbaar' })
	},
	{ width: 900, uitleg: uitlegBanner }
]) {
	test(
		`on a new page at ${width} px the public-draft explanation follows the properties`,
		{ tag: '@uitleg' },
		async ({ page }) => {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(nieuwOnderwerp('Openbaar uitgelegd'));
			const dialog = page.getByRole('dialog', { name: 'Eigenschappen' });
			await expect(dialog).toBeVisible();
			await expect(uitleg(page)).toHaveCount(0);
			await page
				.locator('nldd-sheet')
				.getByRole('textbox', { name: 'Beschrijving' })
				.fill('Een onderwerp uit e2e.');
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			await expect(uitleg(page)).toBeVisible();
		}
	);
}

test(
	'a save before the public-draft explanation has shown does not count as seen',
	{ tag: '@uitleg' },
	async ({ page }) => {
		await page.goto(nieuwOnderwerp('Bewaard voor de uitleg'));
		await expect(page.getByRole('dialog', { name: 'Eigenschappen' })).toBeVisible();
		await page
			.locator('nldd-sheet')
			.getByRole('textbox', { name: 'Beschrijving' })
			.fill('Bewaard terwijl de eigenschappen open staan.');
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
		expect(await uitgelegd(page, 'moza-site')).toBeNull();

		await page.goto('/sites/moza-site/bewerken/onderwerpen/actualiteitenservice.md');
		await expect(page.getByRole('dialog', { name: 'Je concept wordt openbaar' })).toBeVisible();
	}
);

test('on a narrow screen Schrijfhulp from the toolbar menu takes the focus', async ({ page }) => {
	await page.setViewportSize({ width: 400, height: 800 });
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
	await page.getByRole('button', { name: 'Meer' }).click();
	await page.getByRole('menuitemcheckbox', { name: 'Schrijfhulp' }).click();
	const paneel = page.locator('#schrijfhulp-paneel');
	await expect(paneel).toBeFocused();
	await expect(paneel).toBeInViewport();
});

test.describe('the Schrijfhulp panel at 1280 px', () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	const paneel = (page: Page) => page.locator('#schrijfhulp-paneel');

	async function openPaneel(page: Page) {
		await page.goto(url);
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		await page.getByRole('button', { name: 'Schrijfhulp', exact: true }).click();
		await expect(paneel(page)).toBeVisible();
	}

	/** Scrolls the page 300 px once the panel could stick, and reports how far the panel went along: 0 when it stays. */
	async function meegeschoven(page: Page) {
		const top = () => paneel(page).evaluate((el) => el.getBoundingClientRect().top);
		await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
		const before = await top();
		await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'instant' }));
		return before - (await top());
	}

	test('stays beside the text, below the sticky bars, while it fits in the window', async ({
		page
	}) => {
		await openPaneel(page);
		expect(await meegeschoven(page)).toBe(0);
		const toolbar = (await page.locator('nldd-toolbar[label="Opmaak"]').boundingBox())!;
		const box = (await paneel(page).boundingBox())!;
		expect(box.y, 'the panel sits below the toolbar').toBeGreaterThanOrEqual(
			toolbar.y + toolbar.height
		);
		await expect(paneel(page)).toBeInViewport({ ratio: 1 });
	});

	test('scrolls with the page, without a scrollbar of its own, when it is taller than the window', async ({
		page
	}) => {
		await page.setViewportSize({ width: 1280, height: 560 });
		await openPaneel(page);
		expect(await meegeschoven(page)).toBe(300);
		const eigen = await paneel(page).evaluate((el) => {
			const style = getComputedStyle(el);
			return {
				overflowY: style.overflowY,
				maxHeight: style.maxHeight,
				verborgen: el.scrollHeight - el.clientHeight
			};
		});
		expect(eigen).toEqual({ overflowY: 'visible', maxHeight: 'none', verborgen: 0 });
	});

	test('lets go when the window gets too short and sticks again when it is tall enough', async ({
		page
	}) => {
		await openPaneel(page);
		expect(await meegeschoven(page)).toBe(0);
		await page.setViewportSize({ width: 1280, height: 560 });
		await expect.poll(() => meegeschoven(page)).toBe(300);
		await page.setViewportSize({ width: 1280, height: 900 });
		await expect.poll(() => meegeschoven(page)).toBe(0);
	});

	test('lets go when a suggestion makes it taller than the window', async ({ page }) => {
		await page.route('**/api/assistent', (route) =>
			route.fulfill({
				json: {
					replacement: 'We hebben deze centrale plek gemaakt.',
					explanation: 'Testantwoord, geen AI: alleen de eerste zin blijft staan.'
				}
			})
		);
		await page.setViewportSize({ width: 1280, height: 720 });
		await openPaneel(page);
		expect(await meegeschoven(page)).toBe(0);
		await page.locator('.cm-line', { hasText: 'We hebben deze centrale plek' }).click();
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+ArrowDown');
		await page.keyboard.press('Shift+End');
		await paneel(page).hover();
		await paneel(page).getByRole('button', { name: 'Korter' }).click();
		await expect(paneel(page).getByRole('button', { name: 'Neem suggestie over' })).toBeVisible();
		await expect.poll(() => meegeschoven(page)).toBe(300);
	});

	test('below 1008 px the panel keeps its place below the text', async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 900 });
		await openPaneel(page);
		expect(await meegeschoven(page)).toBe(300);
		const text = (await page.locator('nldd-text-editor').boundingBox())!;
		const box = (await paneel(page).boundingBox())!;
		expect(box.y, 'below the text').toBeGreaterThanOrEqual(text.y + text.height);
	});
});
