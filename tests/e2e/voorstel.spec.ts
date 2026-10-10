import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const stap = (page: Page) =>
	page.locator('nldd-step-bar[accessible-label="Voortgang van dit voorstel"]');
const huidigeStap = (page: Page, naam: string) =>
	stap(page).locator(`nldd-step-bar-item[status="current"][text="${naam}"]`);
const zin = (page: Page) => page.locator('nldd-text.zin');
const gesprek = (page: Page) => page.locator('ol.gesprek > li');

// The merge changes main of the forge that all specs share. On a page no other spec edits, their
// saves meet no newer version, whatever order the spec files run in.
test('sends in, asks for an adjustment, sends in again, reacts and merges', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/onboarding/hybride-werken.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page
		.locator('nldd-text-editor .cm-line')
		.filter({ hasText: 'Een goede thuiswerkplek is belangrijk' })
		.click({ position: { x: 2, y: 2 } });
	await page.keyboard.press('Shift+ControlOrMeta+End');
	await page.keyboard.type('Voorstel door e2e');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await page.getByRole('link', { name: 'Bekijk voorstel' }).click();

	// What now, for the writer of a concept, in one block under the title.
	await expect(huidigeStap(page, 'Concept')).toBeVisible();
	expect(
		await stap(page)
			.locator('nldd-step-bar-item')
			.evaluateAll((items) => items.map((item) => item.getAttribute('text')))
	).toEqual(['Concept', 'Ingestuurd', 'Samengevoegd']);
	await expect(zin(page)).toHaveText(
		'Je voorstel is nog een concept. Klaar? Stuur het in, dan beoordeelt de redactie het.'
	);
	await expect(page.locator('#paginatitel')).toHaveAttribute(
		'supporting-text',
		/^Voor de pagina Hybride werken · van jou · bijgewerkt \d{1,2} [a-z]+$/
	);
	await expect(page.getByRole('link', { name: 'Hoe werkt dit?' })).toHaveAttribute(
		'href',
		'/help#voorstellen'
	);
	for (const weg of ['Geen controles', 'Beoordelen op GitHub', 'Convert to draft']) {
		await expect(page.getByText(weg)).toHaveCount(0);
	}
	await expect(page.locator('nldd-badge[text="Concept"]')).toHaveCount(0);
	await expect(page.getByRole('link', { name: /^Dit voorstel op GitHub/ })).toBeVisible();

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
	await expect(page.getByRole('heading', { name: 'Locaties' })).toBeVisible();

	// Sent in: on this site without four eyes, the writer who is an editor decides.
	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(huidigeStap(page, 'Ingestuurd')).toBeVisible();
	await expect(zin(page)).toHaveText(/^Jij beslist\. Klopt de wijziging/);
	await expect(zin(page)).toBeFocused();

	// Vraag om aanpassing turns the reaction form into the request.
	await page.getByRole('button', { name: 'Vraag om aanpassing' }).click();
	const veld = page.getByRole('textbox', { name: 'Je reactie' });
	await expect(veld).toBeFocused();
	await expect(page.locator('p[role="status"]')).toHaveText(
		'Je reactie wordt een vraag om aanpassing. Schrijf wat er anders moet.'
	);
	await expect(page.locator('nldd-form-field-help-text')).toContainText(
		'Schrijf wat er anders moet.'
	);
	await page.getByRole('button', { name: 'Annuleer' }).click();
	await expect(veld).toBeFocused();
	await expect(page.locator('form').getByRole('button', { name: 'Plaats reactie' })).toBeVisible();
	await page.getByRole('button', { name: 'Vraag om aanpassing' }).click();
	await page.locator('form').getByRole('button', { name: 'Vraag om aanpassing' }).click();
	await expect(page.locator('nldd-form-field-help-text')).toHaveText(
		'Schrijf eerst wat er anders moet'
	);
	await veld.fill('Kun je de werkplekken als lijst zetten?');
	await page.locator('form').getByRole('button', { name: 'Vraag om aanpassing' }).click();
	await expect(page.getByText('Je vraag om aanpassing is geplaatst').first()).toBeVisible();
	await expect(zin(page)).toHaveText(
		'De redactie vraagt je iets aan te passen. Lees het gesprek hieronder.'
	);
	await expect(zin(page)).toBeFocused();
	const vraag = gesprek(page).filter({ hasText: 'Kun je de werkplekken als lijst zetten?' });
	await expect(vraag).toContainText('Vraagt om een aanpassing');
	// instellingen.spec.ts switches the shared test user to Op naam for a moment.
	await expect(vraag.locator('nldd-identity')).toHaveAttribute(
		'text',
		/^(Anoniem, codenaam [0-9a-f]{12}|Test Gebruiker)$/
	);
	await expect(vraag).toContainText('Redactie ·');
	await expect(page.locator('form').getByRole('button', { name: 'Plaats reactie' })).toBeVisible();

	await page.getByRole('button', { name: 'Opnieuw insturen' }).click();
	await expect(page.getByText('Het voorstel is opnieuw ingestuurd').first()).toBeVisible();
	await expect(zin(page)).toHaveText(/^Jij beslist\./);

	await veld.fill('Aangepast, de werkplekken staan nu in een lijst.');
	await page.getByRole('button', { name: 'Plaats reactie' }).click();
	await expect(page.getByText('Je reactie is geplaatst').first()).toBeVisible();
	const reactie = gesprek(page).filter({ hasText: 'Aangepast, de werkplekken' });
	await expect(reactie).toContainText('Schrijver van dit voorstel ·');

	await page.getByRole('button', { name: 'Samenvoegen' }).click();
	await expect(huidigeStap(page, 'Samengevoegd')).toBeVisible();
	await expect(zin(page)).toHaveText(
		/^Samengevoegd op \d{1,2} [a-z]+\. Na de volgende publicatie staat de wijziging op de site\.\s*$/
	);
	await expect(page.getByRole('link', { name: /^Bekijk de site/ })).toHaveAttribute(
		'href',
		'https://digihandboek.rijks.app/'
	);
	await expect(page.getByRole('textbox', { name: 'Je reactie' })).toHaveCount(0);
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

test('shows a reaction as text, with links that open a new tab and nothing that runs', async ({
	page
}) => {
	// Only this test edits rituelen.md.
	await page.goto('/sites/moza-site/bewerken/handboek/werkwijze/rituelen.md');
	await page.locator('nldd-text-editor .cm-content').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nEen reactie met opmaak');
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await page.getByRole('link', { name: 'Bekijk voorstel' }).click();
	const veld = page.getByRole('textbox', { name: 'Je reactie' });
	await veld.fill(
		'Zie [de licentie](https://example.org/licentie) en **dit**.\n\n<img src=x onerror="window.geraakt=1">\n\n<script>window.geraakt=2</script>'
	);
	await page.getByRole('button', { name: 'Plaats reactie' }).click();
	const item = gesprek(page).filter({ hasText: 'de licentie' });
	await expect(item.locator('strong')).toHaveText('dit');
	const link = item.getByRole('link', { name: 'de licentie (opent in nieuw tabblad)' });
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	await expect(item.locator('img, script')).toHaveCount(0);
	expect(await page.evaluate(() => (window as unknown as { geraakt?: number }).geraakt)).toBe(
		undefined
	);
});

test.describe('on the MOZa site, where the test user is not in the redactie', () => {
	test('tells the writer there is nothing to do, and anyone else that the editors decide', async ({
		page
	}) => {
		await page.goto('/sites/moza-site/voorstellen?filter=alle');
		await page
			.locator('nldd-list[accessible-label="Alle voorstellen"]')
			.getByRole('link', { name: /^Toegankelijkheid: wie je kunt mailen/ })
			.click();
		await expect(zin(page)).toHaveText(
			'De redactie beoordeelt je voorstel. Je hoeft nu niets te doen.'
		);
		await expect(page.getByRole('link', { name: 'Verder bewerken' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Je reactie' })).toBeVisible();

		await page.goto('/sites/moza-site/voorstellen?filter=alle');
		await page
			.locator('nldd-list[accessible-label="Alle voorstellen"]')
			.getByRole('link', { name: /^Weekly 23 september: de demo/ })
			.click();
		await expect(zin(page)).toHaveText('De redactie beoordeelt dit voorstel.');
		await expect(page.locator('#paginatitel')).toHaveAttribute(
			'supporting-text',
			/^Voor de pagina MOZa Weekly 23 september 2026 · van een anonieme collega · /
		);
		await expect(gesprek(page)).toHaveCount(2);
		await expect(gesprek(page).first()).toContainText('jansen');
		await expect(gesprek(page).first()).toContainText('Op GitHub ·');
		await expect(gesprek(page).last()).toContainText('Ziet er goed uit.');
		await expect(page.getByRole('textbox', { name: 'Je reactie' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Samenvoegen' })).toHaveCount(0);
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`the seeded proposals, ${colorScheme} mode`, () => {
		test.use({ colorScheme });

		test('have no axe violations, nor do their words on the changes', async ({ page }) => {
			for (const [site, titel] of [
				['digi-handboek', 'Kennis: het team stelt zich voor'],
				['digi-handboek', 'Over het handboek: wie de redactie is'],
				['moza-site', 'Weekly 23 september: de demo']
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
