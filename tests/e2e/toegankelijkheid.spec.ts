import { expect, test, type Page } from '@playwright/test';

type Stop = { key: string; ring: boolean; obscured: boolean };

/**
 * Describes the focused element (piercing shadow roots) and checks, in the page:
 * - ring: some element in the focused chain gains an outline or box-shadow (also on ::before/::after)
 *   compared with the same element when unfocused (WCAG 2.4.7);
 * - obscured: the element's centre is covered by something outside its own composed subtree/ancestry (WCAG 2.4.11).
 */
async function focusStop(page: Page): Promise<Stop> {
	return page.evaluate(() => {
		const parentOf = (node: Node): Node | null =>
			node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;

		let leaf = document.activeElement as Element;
		const path: string[] = [];
		for (;;) {
			path.push(
				`${leaf.tagName.toLowerCase()}#${leaf.id}.${leaf.getAttribute('aria-label') ?? leaf.getAttribute('accessible-label') ?? leaf.getAttribute('text') ?? ''}`
			);
			const inner = leaf.shadowRoot?.activeElement;
			if (!inner) break;
			leaf = inner;
		}

		const chain: Element[] = [];
		for (let n: Node | null = leaf; n; n = parentOf(n)) {
			if (n instanceof Element && n.matches(':focus-within')) chain.push(n);
		}
		const snapshot = () =>
			chain.map((el) =>
				[undefined, '::before', '::after'].map((pseudo) => {
					const s = getComputedStyle(el, pseudo);
					return `${s.outlineStyle}|${s.outlineWidth}|${s.outlineColor}|${s.boxShadow}`;
				})
			);
		const focused = snapshot();
		(leaf as HTMLElement).blur();
		const unfocused = snapshot();
		(leaf as HTMLElement).focus();

		const ring = focused.some((pseudos, i) =>
			pseudos.some((value, j) => {
				const [style, width, , shadow] = value.split('|');
				const painted = (style !== 'none' && parseFloat(width) > 0) || shadow !== 'none';
				return painted && value !== unfocused[i][j];
			})
		);

		const box = leaf.getBoundingClientRect();
		const x = (Math.max(box.left, 0) + Math.min(box.right, innerWidth)) / 2;
		const y = (Math.max(box.top, 0) + Math.min(box.bottom, innerHeight)) / 2;
		let top: Element | null = document.elementFromPoint(x, y);
		while (top?.shadowRoot) {
			const deeper = top.shadowRoot.elementFromPoint(x, y);
			if (!deeper || deeper === top) break;
			top = deeper;
		}
		let related = false;
		for (let n: Node | null = top; n && !related; n = parentOf(n)) related = n === leaf;
		for (let n: Node | null = leaf; n && !related; n = parentOf(n)) related = n === top;
		return { key: path.join(' > '), ring, obscured: !related };
	});
}

async function checkedTab(page: Page, previous?: Stop): Promise<Stop> {
	await page.keyboard.press('Tab');
	return checkStop(page, previous);
}

async function checkStop(page: Page, previous?: Stop): Promise<Stop> {
	const stop = await focusStop(page);
	expect(stop.key, 'focus must move on every Tab (no focus trap)').not.toBe(previous?.key);
	expect(stop.ring, `no visible focus indicator on ${stop.key}`).toBe(true);
	expect(stop.obscured, `focused element is covered: ${stop.key}`).toBe(false);
	return stop;
}

async function tabTo(page: Page, matches: (stop: Stop) => boolean, max = 80) {
	const seen: Stop[] = [];
	for (let i = 0; i < max; i++) {
		seen.push(await checkedTab(page, seen.at(-1)));
		if (matches(seen.at(-1)!)) return seen;
	}
	throw new Error(`target not reached; stops: ${seen.map((s) => s.key).join(' | ')}`);
}

test('keyboard-only walkthrough from site page to editor, save and Schrijfhulp', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek');
	await page.evaluate(() => customElements.whenDefined('nldd-skip-link'));
	await expect(page.getByText('Het Digi Handboek').first()).toBeVisible();

	const first = await checkedTab(page);
	expect(first.key, 'skip link is the first Tab stop').toContain('nldd-skip-link');
	await page.keyboard.press('Enter');
	const afterSkip = await page.evaluate(() => {
		const active = document.activeElement;
		const slot = active?.assignedSlot;
		return {
			inMain: !!slot?.closest('main'),
			active: document.activeElement?.tagName.toLowerCase()
		};
	});
	expect(afterSkip.inMain, `skip link moves focus into main (active: ${afterSkip.active})`).toBe(
		true
	);

	await tabTo(page, (s) => /bewerken/i.test(s.key));
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/bewerken\//);
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toBeVisible();

	const stops = await tabTo(page, (s) => /text-editor|cm-content/.test(s.key));
	const keys = stops.map((s) => s.key);
	const toolbar = [
		'Vet',
		'Cursief',
		'Kop 2',
		'Kop 3',
		'Kop 4',
		'Lijst met opsommingstekens',
		'Citaat',
		'Link',
		'Code in de regel',
		'Afbeelding invoegen',
		'Mermaid-diagram invoegen',
		'Schrijfhulp'
	];
	const positions = toolbar.map((label) => keys.findIndex((k) => k.includes(`.${label}`)));
	for (const [i, label] of toolbar.entries()) {
		expect(positions[i], `toolbar stop "${label}" reached by Tab`).toBeGreaterThan(-1);
	}
	expect(positions, 'toolbar stops in visual order').toEqual([...positions].sort((a, b) => a - b));
	expect(keys.length - 1, 'the editor comes right after the toolbar').toBe(positions.at(-1)! + 1);

	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nToetsenbordregel uit e2e');
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/).first()).toBeVisible();

	await page.keyboard.down('Shift');
	let stop: Stop | undefined;
	for (let i = 0; i < 80; i++) {
		await page.keyboard.press('Tab');
		stop = await checkStop(page, stop);
		if (stop.key.startsWith('nldd-button') && stop.key.includes('Schrijfhulp')) break;
	}
	await page.keyboard.up('Shift');
	expect(stop?.key, 'Schrijfhulp button reachable backwards from the editor').toContain(
		'Schrijfhulp'
	);

	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Schrijfhulp', expanded: true })).toBeVisible();
	await expect(page.locator('#schrijfhulp-paneel')).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(page.locator('#schrijfhulp-paneel')).toBeHidden();
});

test('Schrijfhulp button announces its collapsed and expanded state', async ({ page }) => {
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await page.evaluate(() => customElements.whenDefined('nldd-button'));
	await expect(page.locator('#schrijfhulp-paneel')).toBeHidden();
	const knop = page.getByRole('button', { name: 'Schrijfhulp' });
	await expect(knop).toHaveAttribute('aria-expanded', 'false');
	await knop.click();
	await expect(knop).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByRole('complementary', { name: 'Schrijfhulp' })).toBeVisible();
});

test('a save conflict takes focus, and choosing a version returns it to the editor', async ({ page }) => {
	await page.route('**/opslaan', (route) =>
		route.fulfill({
			status: 409,
			json: { ok: false, conflict: { mine: '# Mijn\n', theirs: '# Hun\n', sha: 'abc1234' } }
		})
	);
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toBeVisible();
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	await expect(page.getByRole('alert').filter({ hasText: 'intussen' })).toBeFocused();
	await page.getByRole('button', { name: 'Hun versie overnemen' }).click();
	await expect(editor).toBeFocused();
	await expect(editor).toContainText('Hun');
});

test('field errors from a save mark the field and take focus', async ({ page }) => {
	await page.route('**/opslaan', (route) =>
		route.fulfill({
			status: 400,
			json: {
				ok: false,
				error: { message: 'Controleer de gemarkeerde velden', fields: { description: 'Dit veld is verplicht' } }
			}
		})
	);
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const melding = page.getByRole('alert').filter({ hasText: 'Controleer de gemarkeerde velden' });
	await expect(melding).toBeFocused();
	await expect(melding).toContainText('Samenvatting: Dit veld is verplicht');
	await expect(page.locator('nldd-text-field[invalid]')).toHaveCount(1);
});

test.describe('forms have a submit control', () => {
	for (const url of ['/sites/digi-handboek/voorstellen/1', '/instellingen', '/onboarding', '/sites/digi-handboek/nieuw']) {
		test(url, async ({ page }) => {
			await page.goto(url);
			await page.evaluate(() => customElements.whenDefined('nldd-button'));
			const forms = await page.evaluate(() =>
				[...document.querySelectorAll('form')].map(
					(form) =>
						!!form.querySelector(
							'button[type="submit"], input[type="submit"], nldd-button[type="submit"]'
						) ||
						[...form.querySelectorAll('nldd-button')].some(
							(b) => !!b.shadowRoot?.querySelector('button[type="submit"]')
						)
				)
			);
			expect(forms.length).toBeGreaterThan(0);
			expect(forms.every(Boolean), `forms with submit: ${JSON.stringify(forms)}`).toBe(true);
		});
	}
});
