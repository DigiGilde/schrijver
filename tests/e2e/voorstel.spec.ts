import { expect, test } from '@playwright/test';

// The merge changes main of the forge that all specs share. On a page no other spec edits, their
// saves meet no newer version, whatever order the spec files run in.
test('sends in, comments and merges a draft proposal', async ({ page }) => {
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
	await expect(page.locator('nldd-badge[text="Concept"]')).toBeVisible();
	const stap = page.locator('nldd-step-bar[accessible-label="Voortgang van dit voorstel"]');
	await expect(stap.locator('nldd-step-bar-item[status="current"]')).toHaveAttribute(
		'text',
		'Concept'
	);
	await expect(
		page.getByText(/^Volgende stap: stuur het voorstel in met Insturen als het klaar is/)
	).toBeVisible();
	await expect(
		page.locator('[data-diff="toegevoegd"]').filter({ hasText: 'Voorstel door e2e' })
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Locaties' })).toHaveCount(0);
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
		'docs/onboarding/hybride-werken.md'
	);
	await page.getByRole('radio', { name: 'Brontekst' }).click();
	await expect(page.locator('pre.bron ins').filter({ hasText: 'Voorstel door e2e' })).toBeVisible();
	await page.getByRole('radio', { name: 'Hele pagina' }).click();
	await expect(page.getByRole('heading', { name: 'Locaties' })).toBeVisible();

	await page.getByRole('button', { name: 'Insturen' }).click();
	await expect(page.locator('nldd-badge[text="Ingestuurd"]')).toBeVisible();
	await expect(stap.locator('nldd-step-bar-item[aria-current="step"]')).toHaveAttribute(
		'text',
		'Ingestuurd'
	);
	await expect(stap.locator('nldd-step-bar-item[text="Concept"]')).not.toHaveAttribute(
		'aria-current',
		'step'
	);
	await expect(
		page.getByText(
			'Volgende stap: de redactie beoordeelt het voorstel en keurt het goed of vraagt om aanpassingen.'
		)
	).toBeVisible();
	await expect(
		page.getByText(
			'Goedkeuren kan de redactie (naam@rijksoverheid.nl en test@example.org) of iemand met schrijfrechten op de repository op GitHub.'
		)
	).toBeVisible();
	await expect(
		page.getByRole('link', { name: 'Zo komt een wijziging op de site' })
	).toHaveAttribute('href', '/sites/digi-handboek/over');
	await expect(page.getByRole('link', { name: 'Beoordelen op GitHub' })).toBeVisible();

	await page.getByRole('textbox', { name: 'Opmerking' }).fill('Ziet er goed uit');
	await page.getByRole('button', { name: 'Opmerking plaatsen' }).click();
	await expect(page.getByText('Je opmerking is geplaatst').first()).toBeVisible();

	await page.getByRole('button', { name: 'Samenvoegen' }).click();
	await expect(page.locator('nldd-badge[text="Samengevoegd"]')).toBeVisible();
	await expect(stap.locator('nldd-step-bar-item[aria-current="step"]')).toHaveAttribute(
		'text',
		'Samengevoegd'
	);
	await expect(
		page.getByText('Klaar: de wijziging staat op de site na de volgende publicatie.')
	).toBeVisible();
	await expect(page.getByText(/^Goedkeuren kan/)).toHaveCount(0);
});
