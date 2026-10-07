import { expect, test, type Page } from '@playwright/test';

type Stop = { key: string; focusStyle: boolean };

/** Identity and focus-ring check of the focused element, piercing shadow roots. */
async function focusStop(page: Page): Promise<Stop> {
	return page.evaluate(() => {
		let el: Element | null = document.activeElement;
		const path: string[] = [];
		while (el) {
			path.push(
				`${el.tagName.toLowerCase()}#${el.id}.${el.getAttribute('aria-label') ?? el.getAttribute('accessible-label') ?? el.getAttribute('text') ?? ''}`
			);
			const inner: Element | null = el.shadowRoot?.activeElement ?? null;
			if (!inner) break;
			el = inner;
		}
		const visible = (target: Element | null) =>
			!!target &&
			[undefined, '::before', '::after'].some((pseudo) => {
				const s = getComputedStyle(target, pseudo);
				return (
					(s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
				);
			});
		let ancestor: Node | null = el;
		let ringed = false;
		while (ancestor && !ringed) {
			if (ancestor instanceof Element && ancestor.matches(':focus-within'))
				ringed = visible(ancestor);
			ancestor =
				ancestor.parentNode instanceof ShadowRoot ? ancestor.parentNode.host : ancestor.parentNode;
		}
		return { key: path.join(' > '), focusStyle: ringed };
	});
}

async function tabTo(page: Page, matches: (stop: Stop) => boolean, max = 60) {
	const seen: Stop[] = [];
	for (let i = 0; i < max; i++) {
		await page.keyboard.press('Tab');
		const stop = await focusStop(page);
		const previous = seen.at(-1);
		expect(stop.key, 'focus must move on every Tab (no focus trap)').not.toBe(previous?.key);
		expect(stop.focusStyle, `no visible focus style on ${stop.key}`).toBe(true);
		seen.push(stop);
		if (matches(stop)) return seen;
	}
	throw new Error(`target not reached; stops: ${seen.map((s) => s.key).join(' | ')}`);
}

test('keyboard-only walkthrough from site page to editor, save and Schrijfhulp', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek');
	await page.evaluate(() => customElements.whenDefined('nldd-skip-link'));
	await expect(page.getByText('Het Digi Handboek').first()).toBeVisible();

	await tabTo(page, (s) => /bewerken/i.test(s.key));
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/bewerken\//);
	const editor = page.locator('nldd-text-editor .cm-content');
	await expect(editor).toBeVisible();

	const stops = await tabTo(page, (s) => /text-editor|cm-content/.test(s.key), 80);
	const keys = stops.map((s) => s.key).join(' | ');
	expect(keys).toContain('Vet');
	expect(keys).toContain('Afbeelding invoegen');

	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\n\nToetsenbordregel uit e2e');
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByText(/Concept bewaard als voorstel #\d+/)).toBeVisible();

	await page.keyboard.down('Shift');
	let hulp: Stop | undefined;
	for (let i = 0; i < 80 && !hulp; i++) {
		await page.keyboard.press('Tab');
		const stop = await focusStop(page);
		expect(stop.focusStyle, `no visible focus style on ${stop.key}`).toBe(true);
		if (/Schrijfhulp/.test(stop.key) && stop.key.startsWith('nldd-button')) hulp = stop;
	}
	await page.keyboard.up('Shift');
	expect(hulp, 'Schrijfhulp button reachable backwards from the editor').toBeTruthy();

	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Schrijfhulp', expanded: true })).toBeVisible();
});
