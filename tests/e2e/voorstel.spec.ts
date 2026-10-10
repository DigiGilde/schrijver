import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { als, alsTestgebruiker } from './als';

const stap = (page: Page) =>
	page.locator('nldd-step-bar[accessible-label="Voortgang van dit voorstel"]');
const huidigeStap = (page: Page, naam: string) =>
	stap(page).locator(`nldd-step-bar-item[status="current"][text="${naam}"]`);
const zin = (page: Page) => page.locator('nldd-text.zin');
const gesprek = (page: Page) => page.locator('ol.gesprek > li');
/** A button of the block that says what now. */
const knop = (page: Page, text: string) => page.locator(`nldd-box nldd-button[text="${text}"]`);

async function openSeeded(page: Page, site: string, title: string) {
	await page.goto(`/sites/${site}/voorstellen?filter=alle`);
	await page
		.locator('nldd-list[accessible-label="Alle voorstellen"]')
		.getByRole('link', { name: new RegExp(`^${title}`) })
		.first()
		.click();
	await expect(zin(page)).toBeVisible();
}

/** The headings as Chromium's accessibility tree has them: Playwright takes the level of an h1 from its tag. */
async function outline(page: Page): Promise<[string, number][]> {
	const client = await page.context().newCDPSession(page);
	const { nodes } = await client.send('Accessibility.getFullAXTree');
	await client.detach();
	return nodes
		.filter((node) => node.role?.value === 'heading' && !node.ignored)
		.map((node) => [
			String(node.name?.value),
			Number(node.properties?.find((property) => property.name === 'level')?.value.value)
		]);
}

// The merge changes main of the forge that all specs share. On a page no other spec edits, their
// saves meet no newer version, whatever order the spec files run in.
test('sends in an own proposal, reacts and merges it, as a writer who may merge', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/bewerken/onboarding/hybride-werken.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page
		.locator('nldd-text-editor .cm-line')
		.filter({ hasText: 'Een goede thuiswerkplek is belangrijk' })
		.click({ position: { x: 2, y: 2 } });
	await page.keyboard.press('Shift+ControlOrMeta+End');
	await page.keyboard.type('Voorstel door e2e');
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await page.getByRole('link', { name: 'Voorstel bekijken', exact: true }).click();

	// What now, for the writer of a concept, in one block under the title.
	await expect(huidigeStap(page, 'Concept')).toBeVisible();
	expect(
		await stap(page)
			.locator('nldd-step-bar-item')
			.evaluateAll((items) => items.map((item) => item.getAttribute('text')))
	).toEqual(['Concept', 'Ingestuurd', 'Samengevoegd']);
	await expect(zin(page)).toHaveText(
		'Je voorstel is nog een concept. Klaar? Kies "Stuur in", dan beoordeelt de redactie het.'
	);
	await expect(page.locator('#paginatitel')).toHaveAttribute(
		'supporting-text',
		/^Voor de pagina Hybride werken · van jou · bijgewerkt \d{1,2} [a-z]+$/
	);
	await expect(page.getByRole('link', { name: 'Uitleg over voorstellen' })).toHaveAttribute(
		'href',
		'/help#voorstellen'
	);
	await expect(page.getByRole('link', { name: 'Voorbeeldsite bekijken' })).toHaveAttribute(
		'href',
		/\/_preview\/pr-\d+\/$/
	);
	for (const weg of ['Geen controles', 'Beoordelen op GitHub', 'Convert to draft']) {
		await expect(page.getByText(weg)).toHaveCount(0);
	}
	await expect(page.locator('nldd-badge[text="Concept"]')).toHaveCount(0);
	await expect(
		page.locator('#inhoud').getByRole('link', { name: 'Voorstel bekijken op GitHub' })
	).toBeVisible();

	// What changes: words on the changes, dimmed context, the Markdown view.
	await expect(page.getByRole('heading', { name: 'Wat er verandert', level: 2 })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Hybride werken', level: 3 })).toBeVisible();
	await expect(page.getByText('Alle gewijzigde bestanden')).toHaveCount(0);
	const nieuw = page.locator('[data-diff="toegevoegd"]').filter({ hasText: 'Voorstel door e2e' });
	await expect(nieuw).toBeVisible();
	await expect(nieuw.locator('.diff-woord')).toHaveText('Nieuw');
	await expect(page.locator('.diff-woord[data-woord="verwijderd"]').first()).toHaveText(
		'Verwijderd'
	);
	const bar = (state: string) =>
		page
			.locator(`[data-diff="${state}"]`)
			.first()
			.evaluate((block) => getComputedStyle(block, '::before').borderInlineStartStyle);
	expect(await bar('toegevoegd')).toBe('solid');
	expect(await bar('verwijderd')).toBe('dashed');
	const kleur = (selector: string) =>
		page
			.locator(selector)
			.first()
			.evaluate((element) => getComputedStyle(element).color);
	const context =
		'nldd-rich-text.context > :not([data-diff], .diff-overgeslagen, .diff-woord, .sr-only)';
	expect(await kleur(context)).not.toBe(
		await kleur('nldd-rich-text.context > [data-diff="toegevoegd"]')
	);
	await expect(page.getByText(/^\d+ alinea('s)? ongewijzigd$/).first()).toBeVisible();
	await expect(page.getByText('doorgetrokken lijn')).toHaveCount(0);
	await page.getByRole('radio', { name: 'Markdown' }).click();
	await expect(
		page.getByText('De tekst met de opmaakcodes, zoals hij in het bestand staat.')
	).toBeVisible();
	await expect(page.locator('pre.bron ins').filter({ hasText: 'Voorstel door e2e' })).toBeVisible();
	await page.getByRole('radio', { name: 'Hele pagina' }).click();
	// The headings of the page sit under its title, an h3, in the outline.
	await expect
		.poll(() => outline(page))
		.toEqual(
			expect.arrayContaining([
				['Hybride werken', 3],
				['Hybride werken', 4],
				['Locaties', 5],
				['Beatrixpark', 6]
			])
		);

	// Sent in: on this site without four eyes, the writer in the redactie may merge it.
	await page.getByRole('button', { name: 'Stuur in' }).click();
	await expect(huidigeStap(page, 'Ingestuurd')).toBeVisible();
	await expect(zin(page)).toHaveText(
		'Je schreef dit voorstel zelf en je mag het samenvoegen. Klopt alles, voeg het dan samen.'
	);
	await expect(zin(page)).toBeFocused();
	await expect(knop(page, 'Voeg samen')).toHaveAttribute('appearance', 'primary');
	await expect(knop(page, 'Verder bewerken')).toBeVisible();
	await expect(knop(page, 'Aanpassing vragen')).toHaveCount(0);

	// An empty reaction is refused with the focus on the field.
	const veld = page.getByRole('textbox', { name: 'Je reactie' });
	await page.locator('form#reactie').getByRole('button', { name: 'Plaats reactie' }).click();
	await expect(veld).toBeFocused();
	await expect(page.locator('form#reactie nldd-form-field-help-text')).toHaveText(
		'Schrijf eerst je reactie'
	);
	await veld.fill('Aangepast, de werkplekken staan nu in een lijst.');
	await page.getByRole('button', { name: 'Plaats reactie' }).click();
	await expect(page.getByText('Je reactie is geplaatst').first()).toBeVisible();
	const reactie = gesprek(page).filter({ hasText: 'Aangepast, de werkplekken' });
	await expect(reactie).toContainText('Schrijver van dit voorstel ·');

	await page.getByRole('button', { name: 'Voeg samen' }).click();
	await expect(huidigeStap(page, 'Samengevoegd')).toBeVisible();
	await expect(zin(page)).toHaveText(
		/^Samengevoegd op \d{1,2} [a-z]+\. Na de volgende publicatie staat de wijziging op de site\.\s*$/
	);
	await expect(page.getByRole('link', { name: /^Site bekijken/ })).toHaveAttribute(
		'href',
		'https://digihandboek.rijks.app/'
	);
	await expect(page.getByRole('textbox', { name: 'Je reactie' })).toHaveCount(0);
});

test('asks the writer for an adjustment, and gets it sent in again', async ({ page }) => {
	// Derde Collega writes on MOZa, which asks for an approval on GitHub. The test user, in the same
	// redactie and without a GitHub account, decides. Only this test edits this page.
	await als(page, 'derde');
	await page.goto('/sites/moza-site/bewerken/handboek/over-moza/geschiedenis.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nSinds 2024 heet het programma MOZa.');
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await page.getByRole('link', { name: 'Voorstel bekijken', exact: true }).click();
	await knop(page, 'Stuur in').click();
	await expect(zin(page)).toHaveText(
		'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.'
	);
	const voorstel = page.url();

	await alsTestgebruiker(page);
	await page.goto(voorstel);
	await expect(zin(page)).toHaveText(
		'Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed; daarna kun je hier samenvoegen. Moet er iets anders, vraag dan om een aanpassing.'
	);
	await expect(knop(page, 'Goedkeuren op GitHub')).toHaveCount(0);
	await expect(knop(page, 'Aanpassing vragen')).toHaveAttribute('appearance', 'primary');

	// Aanpassing vragen turns the reaction form into the request; a link in its help text leads back.
	await knop(page, 'Aanpassing vragen').click();
	const veld = page.getByRole('textbox', { name: 'Je reactie' });
	const formulier = page.locator('form#reactie');
	await expect(veld).toBeFocused();
	await expect(page.locator('p[role="status"]')).toHaveText(
		'Je reactie wordt een vraag om aanpassing. Schrijf wat er anders moet.'
	);
	await expect(formulier.getByRole('button', { name: 'Annuleer' })).toHaveCount(0);
	await formulier.getByRole('link', { name: 'Maak er een gewone reactie van' }).click();
	await expect(veld).toBeFocused();
	await expect(page.locator('p[role="status"]')).toHaveText(
		'Je reactie is weer een gewone reactie.'
	);
	await expect(formulier.getByRole('button', { name: 'Plaats reactie' })).toBeVisible();
	await knop(page, 'Aanpassing vragen').click();
	await formulier.getByRole('button', { name: 'Vraag om aanpassing' }).click();
	await expect(veld).toBeFocused();
	await expect(formulier.locator('nldd-form-field-help-text').first()).toHaveText(
		'Schrijf eerst wat er anders moet'
	);
	await expect(
		formulier.getByRole('link', { name: 'Maak er een gewone reactie van' })
	).toBeVisible();
	await veld.fill('Noem ook het jaar waarin het programma begon.');
	await formulier.getByRole('button', { name: 'Vraag om aanpassing' }).click();
	await expect(page.getByText('Je vraag om aanpassing is geplaatst').first()).toBeVisible();
	await expect(zin(page)).toHaveText(
		'De schrijver past dit voorstel aan. Daarna beoordeelt de redactie het opnieuw.'
	);
	await expect(zin(page)).toBeFocused();
	await expect(knop(page, 'Stuur opnieuw in')).toHaveCount(0);
	const vraag = gesprek(page).filter({ hasText: 'Noem ook het jaar waarin het programma begon.' });
	await expect(vraag).toContainText('Vraagt om een aanpassing');
	// instellingen.spec.ts switches the shared test user to Op naam for a moment.
	await expect(vraag.locator('nldd-identity')).toHaveAttribute(
		'text',
		/^(Anoniem, codenaam [0-9a-f]{12}|Test Gebruiker)$/
	);
	await expect(vraag).toContainText('Redactie ·');

	// The writer reads the request and sends the proposal in again.
	await als(page, 'derde');
	await page.goto(voorstel);
	await expect(zin(page)).toHaveText(
		'De redactie vraagt je iets aan te passen. Lees het gesprek hieronder. Klaar? Kies "Stuur opnieuw in", dan beoordeelt de redactie het op GitHub opnieuw.'
	);
	await expect(knop(page, 'Verder bewerken')).toHaveAttribute('appearance', 'primary');
	await knop(page, 'Stuur opnieuw in').click();
	await expect(page.getByText('Het voorstel is opnieuw ingestuurd').first()).toBeVisible();
	await expect(zin(page)).toHaveText(
		'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.'
	);
	await expect(zin(page)).toBeFocused();
	await expect(gesprek(page).last()).toContainText('Klaar voor beoordeling');

	await alsTestgebruiker(page);
	await page.goto(voorstel);
	await expect(zin(page)).toHaveText(/^Deze site vraagt eerst een goedkeuring op GitHub\./);
});

test('shows the image that a proposal adds, with the word on the block like a text block', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek/voorstellen?filter=alle');
	await page
		.locator('nldd-list[accessible-label="Alle voorstellen"]')
		.getByRole('link', { name: /^Kennis: het team stelt zich voor/ })
		.first()
		.click();
	await expect(page.locator('.diff-woord').first()).toBeVisible();

	const afbeelding = page.locator('[data-diff="toegevoegd"] img');
	await expect(afbeelding).toHaveAttribute('alt', 'Het team bij de kick-off');
	await expect
		.poll(() => afbeelding.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
		.toBe(160);
	const src = new URL((await afbeelding.getAttribute('src'))!, page.url());
	expect(src.pathname).toBe('/api/sites/digi-handboek/bestand');
	expect(src.searchParams.get('pad')).toBe('docs/afbeeldingen/kennis/team.png');
	expect(src.searchParams.get('voorstel'), 'read at the head of the proposal').toMatch(
		/^[1-9]\d*$/
	);
	expect(src.searchParams.get('ref'), 'never a commit id from the page').toBeNull();

	// The word sits in the block, as in a text block, not on a line of its own above it.
	const blok = page.locator('[data-diff="toegevoegd"]').filter({ has: page.locator('img') });
	const woord = blok.locator('.diff-woord');
	await expect(woord).toHaveText('Nieuw');
	const tekst = page
		.locator('[data-diff="toegevoegd"]')
		.filter({ hasText: 'Hier vind je wie wat weet.' });
	const kaders = {
		afbeelding: [(await blok.boundingBox())!, (await woord.boundingBox())!],
		tekst: [(await tekst.boundingBox())!, (await tekst.locator('.diff-woord').boundingBox())!]
	};
	for (const [naam, [kader, label]] of Object.entries(kaders)) {
		expect(label.y, `${naam}: the word is in the block`).toBeGreaterThanOrEqual(kader.y);
		expect(label.y + label.height, `${naam}: the word is in the block`).toBeLessThanOrEqual(
			kader.y + kader.height
		);
	}
	expect(
		kaders.afbeelding[1].x - kaders.afbeelding[0].x,
		'the word starts where the word of a text block starts'
	).toBeCloseTo(kaders.tekst[1].x - kaders.tekst[0].x, 0);
});

test('shows the old image of a block that a proposal takes away, read from where the proposal began', async ({
	page
}) => {
	// Only this test edits over/toegankelijkheid.md; schema.png stays on two other pages, so nothing asks about the file.
	const SCHEMA = '![Schema van onze werkwijze](../afbeeldingen/werkwijze/schema.png)';
	await page.addInitScript(() =>
		localStorage.setItem('schrijver:digi-handboek:openbaar-uitgelegd', '1')
	);
	await page.goto('/sites/digi-handboek/bewerken/over/toegankelijkheid.md');
	await expect(page.locator('nldd-text-editor .cm-content')).toContainText('Toegankelijkheid');
	await page.evaluate((fragment) => {
		const element = document.querySelector('nldd-text-editor') as unknown as {
			value: string;
			replaceRange(from: number, to: number, text: string): void;
		};
		const at = element.value.indexOf(fragment);
		if (at === -1) throw new Error(`Niet in de tekst: ${fragment}`);
		element.replaceRange(at, at + fragment.length, '');
	}, SCHEMA);
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();
	await page.goto(`/sites/digi-handboek/voorstellen/${new URL(page.url()).searchParams.get('pr')}`);

	const oud = page.locator('[data-diff="verwijderd"] img');
	await expect(oud).toHaveAttribute('alt', 'Schema van onze werkwijze');
	await expect
		.poll(() => oud.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
		.toBe(160);
	const src = new URL((await oud.getAttribute('src'))!, page.url());
	expect(src.pathname).toBe('/api/sites/digi-handboek/bestand');
	expect(src.searchParams.get('pad')).toBe('docs/afbeeldingen/werkwijze/schema.png');
	expect(src.searchParams.get('kant'), 'the side before, found by the server').toBe('voor');
	expect(src.searchParams.get('voorstel')).toMatch(/^[1-9]\d*$/);
	expect(src.searchParams.get('ref'), 'never a commit id or a branch from the page').toBeNull();
});

test('shows a reaction as text, with links that open a new tab and nothing that runs', async ({
	page
}) => {
	// Only this test edits rituelen.md.
	await page.goto('/sites/moza-site/bewerken/handboek/werkwijze/rituelen.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nEen reactie met opmaak');
	await page.getByRole('button', { name: 'Bewaar', exact: true }).click();
	await page.getByRole('link', { name: 'Voorstel bekijken', exact: true }).click();
	const veld = page.getByRole('textbox', { name: 'Je reactie' });
	await veld.fill(
		'# Een kop in een reactie\n\nZie [de licentie](https://example.org/licentie) en **dit**.\n\n<img src=x onerror="window.geraakt=1">\n\n<script>window.geraakt=2</script>'
	);
	await page.getByRole('button', { name: 'Plaats reactie' }).click();
	const item = gesprek(page).filter({ hasText: 'de licentie' });
	await expect(item.locator('strong')).toHaveText('dit');
	// Below Gesprek, an h2, in the outline; it looks like the first heading of a text.
	await expect(item.locator('h1')).toHaveText('Een kop in een reactie');
	await expect
		.poll(() => outline(page))
		.toEqual(expect.arrayContaining([['Een kop in een reactie', 3]]));
	const link = item.getByRole('link', { name: 'de licentie (opent in nieuw tabblad)' });
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	await expect(item.locator('img, script')).toHaveCount(0);
	expect(await page.evaluate(() => (window as unknown as { geraakt?: number }).geraakt)).toBe(
		undefined
	);
});

test.describe('on the MOZa site, where the test user is in the redactie and four eyes hold', () => {
	test('leaves an own proposal to another editor, and asks for the approval on GitHub first', async ({
		page
	}) => {
		await page.goto('/sites/moza-site/voorstellen?filter=alle');
		await page
			.locator('nldd-list[accessible-label="Alle voorstellen"]')
			.getByRole('link', { name: /^Toegankelijkheid: wie je kunt mailen/ })
			.click();
		await expect(zin(page)).toHaveText(
			'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.'
		);
		await expect(page.getByRole('link', { name: 'Verder bewerken' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Je reactie' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Voeg samen' })).toHaveCount(0);

		await page.goto('/sites/moza-site/voorstellen?filter=alle');
		await page
			.locator('nldd-list[accessible-label="Alle voorstellen"]')
			.getByRole('link', { name: /^Weekly 23 september: de demo/ })
			.click();
		await expect(zin(page)).toHaveText(
			'Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed; daarna kun je hier samenvoegen. Moet er iets anders, vraag dan om een aanpassing.'
		);
		await expect(page.locator('#paginatitel')).toHaveAttribute(
			'supporting-text',
			/^Voor de pagina MOZa Weekly 23 september 2026 · van een anonieme collega · /
		);
		await expect(gesprek(page)).toHaveCount(2);
		await expect(gesprek(page).first()).toContainText('jansen');
		await expect(gesprek(page).first()).toContainText('Op GitHub ·');
		await expect(gesprek(page).last()).toContainText('Ziet er goed uit.');
		await expect(page.getByRole('textbox', { name: 'Je reactie' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Voeg samen' })).toHaveCount(0);
	});

	test('says plainly when the page changed on the site since, without a merge or a banner', async ({
		page
	}) => {
		await openSeeded(page, 'moza-site', 'Weekly 10 september: de agenda');
		await expect(zin(page)).toHaveText(
			'De pagina is intussen op de site veranderd. Daardoor kan dit voorstel niet worden samengevoegd. Vraag de schrijver om de wijziging opnieuw te maken, of laat het op GitHub oplossen.'
		);
		await expect(knop(page, 'Aanpassing vragen')).toHaveAttribute('appearance', 'primary');
		await expect(knop(page, 'Voeg samen')).toHaveCount(0);
		await expect(page.locator('nldd-banner')).toHaveCount(0);
		await expect(page.getByText(/hoofdbranch/)).toHaveCount(0);

		await openSeeded(page, 'moza-site', 'Weekly 3 september: de terugblik');
		await expect(zin(page)).toHaveText(
			'De pagina is intussen op de site veranderd. Daardoor kan je voorstel niet worden samengevoegd, en Schrijver kan het niet bijwerken. Open de pagina opnieuw en maak je wijziging nog een keer, of vraag in het gesprek of iemand het op GitHub oplost.'
		);
		await expect(knop(page, 'Stuur in')).toHaveCount(0);
		await expect(knop(page, 'Verder bewerken')).toHaveCount(0);
	});

	test('shows only its own change when the page changed on the site since', async ({ page }) => {
		for (const [titel, eigen] of [
			['Weekly 10 september: de agenda', 'De agenda staat voortaan bovenaan.'],
			['Weekly 3 september: de terugblik', 'Een terugblik op de zomer.']
		]) {
			await openSeeded(page, 'moza-site', titel);
			await expect(
				page.locator('[data-diff="toegevoegd"]').filter({ hasText: eigen }),
				titel
			).toBeVisible();
			// What the site added to the page since is not the proposal's to take away.
			await expect(page.locator('[data-diff="verwijderd"]'), titel).toHaveCount(0);
			await expect(page.getByText('Aangevuld op de site.'), titel).toHaveCount(0);
		}
	});

	test('answers a request for changes made on GitHub with Stuur opnieuw in', async ({ page }) => {
		await openSeeded(page, 'moza-site', 'Facilitaire diensten: wie je belt');
		await expect(zin(page)).toHaveText(
			'De redactie vraagt je iets aan te passen. Lees het gesprek hieronder. Klaar? Kies "Stuur opnieuw in", dan beoordeelt de redactie het op GitHub opnieuw.'
		);
		await expect(gesprek(page).first()).toContainText('Vraagt op GitHub om een aanpassing');
		await knop(page, 'Stuur opnieuw in').click();
		await expect(page.getByText('Het voorstel is opnieuw ingestuurd').first()).toBeVisible();
		await expect(zin(page)).toHaveText(
			'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.'
		);
		await expect(gesprek(page).last()).toContainText('Klaar voor beoordeling');

		// Back in Te beoordelen for the rest of the redactie.
		await als(page, 'derde');
		await page.goto('/sites/moza-site/voorstellen?filter=beoordelen');
		await expect(
			page
				.locator('nldd-list[accessible-label="Te beoordelen"]')
				.getByRole('link', { name: /^Facilitaire diensten: wie je belt/ })
		).toBeVisible();
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`the seeded proposals, ${colorScheme} mode`, () => {
		test.use({ colorScheme });

		test('have no axe violations, nor do their words on the changes', async ({ page }) => {
			for (const [site, titel] of [
				['digi-handboek', 'Kennis: het team stelt zich voor'],
				['digi-handboek', 'Over het handboek: wie de redactie is'],
				['moza-site', 'Weekly 23 september: de demo'],
				['moza-site', 'Weekly 10 september: de agenda'],
				['moza-site', 'Weekly 3 september: de terugblik'],
				['moza-site', 'Facilitaire diensten: wie je belt']
			]) {
				await page.goto(`/sites/${site}/voorstellen?filter=alle`);
				await page
					.locator('nldd-list[accessible-label="Alle voorstellen"]')
					.getByRole('link', { name: new RegExp(`^${titel}`) })
					.first()
					.click();
				await expect(zin(page)).toBeVisible();
				await expect(page.locator('.diff-woord').first()).toBeVisible();
				await page.waitForLoadState('networkidle');
				const height = await page.evaluate(() => document.documentElement.scrollHeight);
				await page.setViewportSize({ width: 1280, height });
				const result = await new AxeBuilder({ page })
					.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
					.analyze();
				expect(
					result.violations,
					`${titel}: ${JSON.stringify(result.violations, null, 1)}`
				).toEqual([]);
			}
		});
	});
}
