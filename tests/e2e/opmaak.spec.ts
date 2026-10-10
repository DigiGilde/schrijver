import { expect, test, type Page } from '@playwright/test';

const url = '/sites/digi-handboek/bewerken/index.md';

/** The whole text: the editor only renders the lines near the viewport. */
const editorValue = (page: Page) =>
	page.evaluate(
		() => (document.querySelector('nldd-text-editor') as unknown as { value: string }).value
	);

async function replaceText(page: Page, text: string) {
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toBeVisible();
	await editor.click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.insertText(text);
	await expect.poll(() => editorValue(page)).toBe(text);
}

async function voorbeeld(page: Page) {
	await page.getByRole('radio', { name: 'Voorbeeld' }).click();
	return page.getByRole('region', { name: 'Voorbeeld' });
}

test('Genummerde lijst numbers plain text and a bullet line, and switches back', async ({
	page
}) => {
	await page.goto(url);
	const genummerd = page.getByRole('button', { name: 'Genummerde lijst' });

	await replaceText(page, 'Gewone tekst');
	await genummerd.click();
	await expect.poll(() => editorValue(page)).toBe('1. Gewone tekst');
	await expect(genummerd).toHaveAttribute('aria-pressed', 'true');

	await replaceText(page, '- Een punt');
	await genummerd.click();
	await expect.poll(() => editorValue(page)).toBe('1. Een punt');

	await page.getByRole('button', { name: 'Lijst met opsommingstekens' }).click();
	await expect.poll(() => editorValue(page)).toBe('- Een punt');
	await expect(genummerd).not.toHaveAttribute('aria-pressed', 'true');
});

test('Inspringen nests a list item and Uitspringen takes it back', async ({ page }) => {
	await page.goto(url);
	const inspringen = page.getByRole('button', { name: 'Inspringen' });
	await replaceText(page, 'Alinea');
	await expect(inspringen).toBeDisabled();

	await replaceText(page, '- Een\n- Twee');
	await expect(inspringen).toBeEnabled();
	await inspringen.click();
	await expect.poll(() => editorValue(page)).toBe('- Een\n  - Twee');
	await page.getByRole('button', { name: 'Uitspringen' }).click();
	await expect.poll(() => editorValue(page)).toBe('- Een\n- Twee');
});

test('Codeblok fences the line and leaves the caret inside the block', async ({ page }) => {
	await page.goto(url);
	await replaceText(page, 'Inleiding\n\n');
	await page.getByRole('button', { name: 'Codeblok' }).click();
	await expect.poll(() => editorValue(page)).toBe('Inleiding\n\n```\n\n```');
	await page.keyboard.type('npm test');
	await expect.poll(() => editorValue(page)).toBe('Inleiding\n\n```\nnpm test\n```');
});

test('Tabel and Horizontale lijn insert their Markdown on lines of their own', async ({ page }) => {
	await page.goto(url);
	const tabel = '| Kolom 1 | Kolom 2 |\n| ------- | ------- |\n| Tekst   | Tekst   |';

	await replaceText(page, 'Inleiding');
	await page.getByRole('button', { name: 'Tabel invoegen' }).click();
	await expect.poll(() => editorValue(page)).toBe(`Inleiding\n\n${tabel}\n\n`);
	await page.keyboard.type('Slot');
	await page.getByRole('button', { name: 'Horizontale lijn invoegen' }).click();
	await expect.poll(() => editorValue(page)).toBe(`Inleiding\n\n${tabel}\n\nSlot\n\n---\n\n`);

	const region = await voorbeeld(page);
	await expect(region.getByRole('columnheader', { name: 'Kolom 1' })).toBeVisible();
	await expect(region.locator('p', { hasText: 'Slot' })).toBeVisible();
	await expect(region.locator('hr')).toHaveCount(1);
});

test.describe('Mermaid in Voorbeeld', () => {
	test('a MOZa diagram shows its nldd: icons, not unknown-icon boxes', async ({ page }) => {
		await page.goto('/sites/moza-site/bewerken/onderwerpen/berichten-fbs.md');
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		const diagrams = (await voorbeeld(page)).locator('.mermaid');
		await expect(diagrams.locator(':scope > svg')).toHaveCount(2);
		await expect(diagrams.locator('g.icon-shape svg').first()).toBeVisible();
		// Mermaid draws an icon it cannot find as a blue box with a question mark.
		await expect(diagrams.locator('rect[style*="#087ebf"]')).toHaveCount(0);
		await expect(diagrams.locator('pre')).toHaveCount(0);
	});

	test('the classDef with var(--token) of digitale-assistent renders in the site colours', async ({
		page
	}) => {
		await page.goto('/sites/moza-site/bewerken/onderwerpen/digitale-assistent.md');
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		const region = await voorbeeld(page);
		const diagrams = region.locator('.mermaid');
		await expect(diagrams.locator(':scope > svg')).toHaveCount(3);
		await expect(diagrams.locator('pre')).toHaveCount(0);
		// `stroke:var(--color-rijks-oranje)` colours the icon of the node with class inzicht.
		await expect(diagrams.first().locator('g.icon-shape g[style*="#e17000"]')).toHaveCount(1);
		await expect(region.getByText('kleur die deze site niet kent')).toHaveCount(0);
	});

	test('follows the colour scheme', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await page.goto('/sites/moza-site/bewerken/onderwerpen/digitale-assistent.md');
		await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
		const diagram = (await voorbeeld(page)).locator('.mermaid').first();
		const background = () => diagram.evaluate((node) => getComputedStyle(node).backgroundColor);
		await expect(diagram.locator('g.icon-shape g[style*="#184576"]').first()).toBeAttached();
		expect(await background()).toBe('rgb(245, 246, 249)');

		await page.emulateMedia({ colorScheme: 'dark' });
		await expect(diagram.locator('g.icon-shape g[style*="#85b5ee"]').first()).toBeAttached();
		expect(await background()).toBe('rgb(23, 37, 56)');
	});

	test('an unknown colour token shows grey and is named once', async ({ page }) => {
		await page.goto('/sites/moza-site/bewerken/contact.md');
		await replaceText(
			page,
			[
				'```mermaid',
				'flowchart LR',
				'  accDescr: Twee stappen',
				'  A --> B',
				'  classDef x fill:var(--color-onbekend),stroke:var(--color-text)',
				'  class A x',
				'```',
				'',
				'```mermaid',
				'flowchart LR',
				'  accDescr: Nog twee stappen',
				'  C --> D',
				'  style C fill:var(--color-onbekend)',
				'```'
			].join('\n')
		);
		const region = await voorbeeld(page);
		await expect(region.locator('.mermaid > svg')).toHaveCount(2);
		await expect(region.locator('[style*="#808080"]').first()).toBeAttached();
		const melding = page.getByText('Een diagram gebruikt een kleur die deze site niet kent');
		await expect(melding).toHaveCount(1);
		await expect(melding).toContainText('--color-onbekend.');
	});

	test('a diagram that does not parse shows its source with a message', async ({ page }) => {
		await page.goto(url);
		await replaceText(page, '```mermaid\nflowchart LR\n  accDescr: Kapot\n  A --> \n```');
		const region = await voorbeeld(page);
		const diagram = region.locator('.mermaid');
		await expect(diagram.getByText('Dit diagram kan niet worden getekend.')).toBeVisible();
		await expect(diagram.locator('pre')).toContainText('accDescr: Kapot');
		await expect(diagram.locator('svg')).toHaveCount(0);
	});
});
