import { expect, test, type Page } from '@playwright/test';

type Stop = { key: string; ring: boolean; obscured: boolean };

/**
 * Describes the focused element (piercing shadow roots) and checks, in the page:
 * - ring: some element in the focused chain, or in the focused element's own shadow tree, gains an
 *   outline or box-shadow (also on ::before/::after) compared with the same element when unfocused
 *   (WCAG 2.4.7);
 * - obscured: the element's centre is covered by something outside its own composed subtree/ancestry (WCAG 2.4.11).
 */
async function focusStop(page: Page): Promise<Stop> {
	return page.evaluate(() => {
		// Composed parent: a slotted element belongs to its slot, a shadow root to its host.
		const parentOf = (node: Node): Node | null =>
			(node as Element).assignedSlot ??
			(node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode);

		let leaf = document.activeElement as Element;
		const path: string[] = [];
		for (;;) {
			path.push(
				`${leaf.tagName.toLowerCase()}#${leaf.id}.${leaf.getAttribute('aria-label') ?? leaf.getAttribute('accessible-label') ?? leaf.getAttribute('text') ?? ''}${leaf.getAttribute('href') ? `@${leaf.getAttribute('href')}` : ''}`
			);
			const inner = leaf.shadowRoot?.activeElement;
			if (!inner) break;
			leaf = inner;
		}

		const chain: Element[] = [];
		for (let n: Node | null = leaf; n; n = parentOf(n)) {
			if (n instanceof Element && n.matches(':focus-within')) chain.push(n);
		}
		// A focused host can draw its ring on its own shadow content (a radio in nldd-segmented-control).
		chain.push(...(leaf.shadowRoot?.querySelectorAll('*') ?? []));
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
	// The coach mark of a first visit takes the focus on arrival; editor.spec.ts walks that path.
	await page.addInitScript(() =>
		localStorage.setItem('schrijver:digi-handboek:openbaar-uitgelegd', '1')
	);
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
		'Schrijven',
		'Eigenschappen',
		'Schrijfhulp'
	];
	const positions = toolbar.map((label) => keys.findIndex((k) => k.includes(`.${label}`)));
	for (const [i, label] of toolbar.entries()) {
		expect(positions[i], `toolbar stop "${label}" reached by Tab`).toBeGreaterThan(-1);
	}
	expect(positions, 'toolbar stops in visual order').toEqual([...positions].sort((a, b) => a - b));
	expect(keys.length - 1, 'the editor comes right after the toolbar').toBe(positions.at(-1)! + 1);
	const bewaren = keys.findIndex((k) => k.includes('.Concept bewaren'));
	expect(bewaren, 'the save button in the title bar comes before the toolbar').toBeGreaterThan(-1);
	expect(bewaren).toBeLessThan(positions[0]);

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
	await expect(page.getByRole('button', { name: 'Schrijfhulp' })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
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
	await knop.click();
	await expect(knop).toHaveAttribute('aria-expanded', 'false');
});

test('Schrijfhulp button is collapsed on first render after a client-side navigation', async ({
	page
}) => {
	await page.goto('/sites/digi-handboek');
	await page.evaluate(() => customElements.whenDefined('nldd-button'));
	const before = await page.evaluate(() => performance.getEntriesByType('navigation').length);
	await page.locator('nldd-list[accessible-label="Pagina\'s"]').getByRole('link').first().click();
	await expect(page).toHaveURL(/\/bewerken\//);
	const knop = page.getByRole('button', { name: 'Schrijfhulp' });
	await expect(knop).toHaveAttribute('aria-expanded', 'false');
	expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(before);
});

test('a save conflict takes focus, and choosing a version returns it to the editor', async ({
	page
}) => {
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
	// The conflict choices are the only primary actions: saving again would meet the same conflict.
	await expect(page.getByRole('button', { name: 'Concept bewaren' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Hun versie overnemen' }).click();
	await expect(editor).toBeFocused();
	await expect(editor).toContainText('Hun');
	await expect(page.getByRole('button', { name: 'Concept bewaren' })).toBeVisible();
});

test('field errors from a save mark the field and take focus', async ({ page }) => {
	await page.route('**/opslaan', (route) =>
		route.fulfill({
			status: 400,
			json: {
				ok: false,
				error: {
					message: 'Vul de gemarkeerde velden in bij Eigenschappen',
					fields: { description: 'Samenvatting is verplicht' }
				}
			}
		})
	);
	await page.goto('/sites/digi-handboek/bewerken/index.md');
	await expect(page.locator('nldd-text-editor .cm-content')).toBeVisible();
	await page.getByRole('button', { name: 'Concept bewaren' }).click();
	const melding = page
		.getByRole('alert')
		.filter({ hasText: 'Vul de gemarkeerde velden in bij Eigenschappen' });
	await expect(page.locator('.foutmelding')).toBeFocused();
	await expect(melding).toHaveAttribute('variant', 'critical');
	await expect(melding).toContainText('Samenvatting is verplicht');
	await expect(page.locator('nldd-text-field[invalid]')).toHaveCount(1);
});

test.describe('focus after an overlay from the toolbar menu at 320 px (WCAG 2.4.3)', () => {
	test.use({ viewport: { width: 320, height: 800 } });

	const fromMenu = async (page: Page, item: string) => {
		await page.goto('/sites/digi-handboek/bewerken/index.md');
		await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
		await page.getByRole('button', { name: 'Meer' }).click();
		await page.getByRole('menuitem', { name: item }).click();
	};

	test('closing the properties sheet returns focus to the editor', async ({ page }) => {
		await fromMenu(page, 'Eigenschappen');
		const sheet = page.getByRole('dialog', { name: 'Eigenschappen' });
		await expect(sheet).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		await expect(page.locator('nldd-text-editor .cm-content')).toBeFocused();

		// Closed from a field, focus is still in the sheet when it reports its close.
		await page.getByRole('button', { name: 'Meer' }).click();
		await page.getByRole('menuitem', { name: 'Eigenschappen' }).click();
		await page.locator('nldd-sheet').getByRole('textbox', { name: 'Samenvatting' }).fill('Kort');
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		await expect(page.locator('nldd-text-editor .cm-content')).toBeFocused();
	});

	test('closing the image dialog returns focus to the editor', async ({ page }) => {
		await fromMenu(page, 'Afbeelding invoegen');
		const dialog = page.getByRole('dialog', { name: 'Afbeelding invoegen' });
		await expect(dialog).toBeVisible();
		// The buttons are slotted into the dialog element, not into the dialog role inside it.
		await page.locator('nldd-modal-dialog').getByRole('button', { name: 'Annuleren' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('nldd-text-editor .cm-content')).toBeFocused();

		await page.getByRole('button', { name: 'Meer' }).click();
		await page.getByRole('menuitem', { name: 'Afbeelding invoegen' }).click();
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(page.locator('nldd-text-editor .cm-content')).toBeFocused();
	});
});

test.describe('forms have a submit control', () => {
	for (const url of [
		'/sites/digi-handboek/voorstellen/1',
		'/instellingen',
		'/onboarding',
		'/sites/digi-handboek/nieuw'
	]) {
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

test.describe('reflow at 320 px (WCAG 1.4.10)', () => {
	test.use({ viewport: { width: 320, height: 800 } });
	for (const url of [
		'/',
		'/sites/digi-handboek',
		'/sites/digi-handboek/voorstellen/1',
		'/sites/digi-handboek/bewerken/index.md',
		'/instellingen'
	]) {
		test(url, async ({ page }) => {
			await page.goto(url);
			await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
			await page.waitForLoadState('networkidle');
			const width = await page.evaluate(() => document.documentElement.scrollWidth);
			expect(width, 'no horizontal scrolling').toBeLessThanOrEqual(320);
			// Overflow can also hide inside a clipping container: no light-DOM box may stick out of the viewport.
			const sticking = await page.evaluate(() =>
				[...document.body.querySelectorAll('*')]
					.filter((el) => {
						const box = el.getBoundingClientRect();
						return box.width > 0 && box.right > innerWidth + 1;
					})
					.map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
			);
			expect(sticking, 'elements wider than the viewport').toEqual([]);
		});
	}

	test('the editor toolbar moves what does not fit into its menu', async ({ page }) => {
		await page.goto('/sites/digi-handboek/bewerken/index.md');
		await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
		await expect(page.getByRole('radio', { name: 'Schrijven' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Vet' })).toBeHidden();

		await page.getByRole('button', { name: 'Meer' }).click();
		const vet = page.getByRole('menuitemcheckbox', { name: 'Vet' });
		await expect(vet).toBeVisible();
		await expect(page.getByRole('menuitem', { name: 'Eigenschappen' })).toBeVisible();
		for (const item of [vet, page.getByRole('menuitem', { name: 'Mermaid-diagram invoegen' })]) {
			const box = (await item.boundingBox())!;
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width, 'menu fits the viewport').toBeLessThanOrEqual(320);
		}
		const width = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(width, 'no horizontal scrolling with the menu open').toBeLessThanOrEqual(320);

		await vet.click();
		await expect(page.locator('nldd-text-editor .cm-content')).toBeFocused();
		await page.keyboard.type('vet');
		await page.getByRole('button', { name: 'Meer' }).click();
		await expect(page.getByRole('menuitemcheckbox', { name: 'Vet' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	});
});

test.describe('app bar', () => {
	test('the wordmark is one image named Schrijver, and it leads home', async ({ page }) => {
		await page.goto('/help');
		await expect(page.getByRole('banner')).toHaveCount(1);
		const wordmark = page.getByRole('link', { name: 'Schrijver', exact: true });
		await expect(wordmark).toHaveAttribute('href', '/');
		await expect(wordmark).toHaveAccessibleName('Schrijver');
		await expect(page.getByRole('img', { name: 'Schrijver', exact: true })).toHaveCount(1);
	});

	test('the Tab order runs from the skip link over the wordmark to the menu', async ({ page }) => {
		await page.goto('/help');
		await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
		const first = await checkedTab(page);
		const second = await checkedTab(page, first);
		const third = await checkedTab(page, second);
		expect(first.key).toContain('nldd-skip-link');
		expect(second.key, 'the wordmark').toContain('@/');
		expect(third.key).toContain('.Menu');
	});

	test('the test environment bar is a status above the app bar', async ({ page }) => {
		await page.goto('/help');
		const bar = page.getByRole('status').filter({ hasText: 'Testomgeving' });
		await expect(bar).toHaveText(
			'Testomgeving: wat je bewaart blijft op deze computer en gaat niet naar GitHub.'
		);
		const toolbar = (await page.getByRole('toolbar', { name: 'Schrijver' }).boundingBox())!;
		const status = (await bar.boundingBox())!;
		expect(status.y + status.height).toBeLessThanOrEqual(toolbar.y);
	});

	test('the shell has no bar split view, so no divider under the app bar', async ({ page }) => {
		await page.goto('/help');
		await expect(page.locator('nldd-app-view > nldd-page')).toHaveCount(1);
		await expect(page.locator('nldd-bar-split-view')).toHaveCount(0);
	});

	test('the menu opens from the keyboard and holds the destinations and the account', async ({
		page
	}) => {
		await page.goto('/help');
		await page.evaluate(() => customElements.whenDefined('nldd-menu'));
		const knop = page.getByRole('button', { name: 'Menu' });
		await knop.focus();
		await page.keyboard.press('Enter');
		await expect(knop).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByRole('menuitem')).toHaveText([
			'Sites',
			'Help',
			'Instellingen',
			'Uitloggen'
		]);
		await expect(page.getByRole('group', { name: 'Account' })).toBeVisible();
		await expect(page.getByText('Test Gebruiker').filter({ visible: true })).toBeVisible();
		await expect(page.getByText('test@example.org').filter({ visible: true })).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('menuitem').first()).toBeHidden();
		await expect(knop).toBeFocused();
	});

	test('Space follows a menu item instead of scrolling the page behind the menu', async ({
		page
	}) => {
		await page.goto('/help');
		await page.evaluate(() => customElements.whenDefined('nldd-menu'));
		const navigations = () =>
			page.evaluate(() => performance.getEntriesByType('navigation').length);
		const before = await navigations();
		const knop = page.getByRole('button', { name: 'Menu' });

		await knop.click();
		await page.getByRole('menuitem', { name: 'Help' }).focus();
		await page.keyboard.press('Space');
		await expect(page.getByRole('menuitem').first()).toBeHidden();
		expect(await page.evaluate(() => scrollY), 'the page did not scroll').toBe(0);

		await knop.click();
		await page.getByRole('menuitem', { name: 'Instellingen' }).focus();
		await page.keyboard.press('Space');
		await expect(page).toHaveURL(/\/instellingen$/);
		expect(await navigations(), 'a navigation inside the app, not a page load').toBe(before);
	});

	test.describe('at 320 px and 200% text', () => {
		test.use({ viewport: { width: 320, height: 800 } });

		test('the menu moves into the overflow menu, with the account', async ({ page }) => {
			await page.goto('/');
			await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
			await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
			await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				320
			);

			await page.getByRole('button', { name: 'Meer' }).click();
			await expect(page.getByRole('menuitem')).toHaveText([
				'Sites',
				'Help',
				'Instellingen',
				'Uitloggen'
			]);
			await expect(page.getByText('test@example.org').filter({ visible: true })).toBeVisible();
		});
	});
});

test.describe('scroll padding (WCAG 2.4.11)', () => {
	const header = 'nldd-page > [slot="header"]';
	/** The document's scroll padding equals the sticky header's height plus 8px, extra bars included. */
	const clears = (page: Page, extra = 0) =>
		page.evaluate(
			([selector, more]) => {
				const bar = document.querySelector(selector as string)!;
				const height = Math.ceil(bar.getBoundingClientRect().height) + (more as number) + 8;
				return document.documentElement.style.scrollPaddingTop === `${height}px`;
			},
			[header, extra]
		);

	test('follows the sticky header, title bar included', async ({ page }) => {
		await page.goto('/sites/digi-handboek');
		await page.evaluate(() => customElements.whenDefined('nldd-top-title-bar'));
		await expect(page.locator('nldd-top-title-bar')).toBeVisible();
		await expect.poll(() => clears(page)).toBe(true);
		const padding = await page.evaluate(() => document.documentElement.style.scrollPaddingTop);
		expect(parseInt(padding), 'more than the app bar alone').toBeGreaterThan(110);

		await page.evaluate(() => scrollTo(0, 800));
		await expect.poll(() => clears(page), 'the title bar collapsed').toBe(true);
	});

	test('is set again by the page that a navigation leads to', async ({ page }) => {
		await page.goto('/');
		await expect.poll(() => clears(page)).toBe(true);
		const start = await page.evaluate(() => document.documentElement.style.scrollPaddingTop);

		await page.getByRole('link', { name: 'Digi Handboek' }).click();
		await expect(page).toHaveURL(/\/sites\/digi-handboek$/);
		await expect(page.locator('nldd-top-title-bar')).toBeVisible();
		await expect.poll(() => clears(page)).toBe(true);
		const site = await page.evaluate(() => document.documentElement.style.scrollPaddingTop);
		expect(parseInt(site)).toBeGreaterThan(parseInt(start));
	});

	test('adds the bars that mark themselves with data-plakt, and follows their size', async ({
		page
	}) => {
		await page.goto('/help');
		await expect.poll(() => clears(page)).toBe(true);
		await page.evaluate(() => {
			const bar = document.createElement('div');
			bar.id = 'plakt';
			bar.dataset.plakt = '';
			bar.style.height = '40px';
			document.getElementById('inhoud')!.prepend(bar);
		});
		await expect.poll(() => clears(page, 40)).toBe(true);

		await page.evaluate(() => (document.getElementById('plakt')!.style.height = '64px'));
		await expect.poll(() => clears(page, 64)).toBe(true);

		await page.evaluate(() => delete document.getElementById('plakt')!.dataset.plakt);
		await expect.poll(() => clears(page)).toBe(true);
	});

	test('keeps what scrolls into view below the sticky bars', async ({ page }) => {
		await page.goto('/help');
		await expect.poll(() => clears(page)).toBe(true);
		const clearance = await page.evaluate(() => {
			const heading = [...document.querySelectorAll('nldd-rich-text h2')].at(-1)!;
			heading.scrollIntoView({ block: 'start' });
			const bar = document.querySelector('nldd-page > [slot="header"]')!.getBoundingClientRect();
			return heading.getBoundingClientRect().top - bar.bottom;
		});
		expect(clearance).toBeGreaterThanOrEqual(7);
	});

	test('goes on a short viewport, where nothing sticks, and comes back with the height', async ({
		page
	}) => {
		await page.setViewportSize({ width: 320, height: 256 });
		await page.goto('/sites/digi-handboek/bewerken/index.md');
		await expect(page.locator('nldd-toolbar[label="Opmaak"]')).toBeVisible();
		await expect
			.poll(() => page.evaluate(() => document.documentElement.style.scrollPaddingTop))
			.toBe('');

		await page.setViewportSize({ width: 320, height: 568 });
		await expect
			.poll(
				() =>
					page.evaluate(() => {
						const height = (selector: string) =>
							document.querySelector(selector)!.getBoundingClientRect().height;
						const bars = height('nldd-page > [slot="header"]') + height('[data-plakt]');
						return document.documentElement.style.scrollPaddingTop === `${Math.ceil(bars) + 8}px`;
					}),
				'the header and the toolbar count again'
			)
			.toBe(true);
	});
});
