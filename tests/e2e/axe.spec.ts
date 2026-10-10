import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
	'/',
	'/sites/digi-handboek',
	'/sites/digi-handboek/bewerken/index.md',
	'/sites/digi-handboek/voorstellen/1',
	'/sites/digi-handboek/over',
	'/sites/werkplaats/over',
	'/sites/bestaat-niet',
	'/help',
	'/instellingen',
	'/onboarding',
	'/sites/digi-handboek/nieuw',
	'/sites/moza-site/nieuw'
];

/**
 * Allowed color-contrast "incomplete" results. CodeMirror lines that cross the edge of the editor's own scroll
 * container cannot be resolved by axe (elmPartiallyObscuring); the lines that can be resolved pass. The back
 * button of nldd-top-title-bar draws a pseudo-element behind its text, which axe does not resolve (pseudoContent).
 * The same goes for the editor's save button in that bar: the sticky page header around it draws its fade as a
 * pseudo-element. With the properties sheet on the page there are two title bars, and axe names the page's own bar
 * by its class. So does the current row of the folder list: its fill is a pseudo-element (measured by hand: 15.5:1
 * in light mode, 9.8:1 in dark mode). The step bar of a proposal draws its track as a pseudo-element across the
 * steps (measured by hand, in both modes: at least 4.5:1 for the numbers, 6.2:1 for the labels).
 * The coach mark on the save button draws its card as a blurred pseudo-element as well (measured by hand:
 * 11.3:1 in light mode, 11.4:1 in dark mode; 9.5:1 and 8.8:1 where page text shows through).
 * The app bar sits in that same sticky header, so its text is unresolved for the same reason: the test environment bar,
 * the wordmark and the Menu button (measured by hand, light / dark mode: 6.2:1 / 6.2:1, 11.3:1 / 11.4:1 and
 * 15.4:1 / 11.4:1). Axe names the same node by what else is on the page, so the sole-button case is matched loosely.
 */
const allowedContrast = [
	/^nldd-text-editor,\.cm-line:nth-child\(\d+\)$/,
	/^(nldd-top-title-bar|\.optisch),nldd-button(\[start-icon="chevron-left"\])?,\.button__text$/,
	/^nldd-button\[text="Bewaar"\],\.button__text$/,
	/^nldd-just-in-time-education,\.just-in-time-education__(text|supporting-text)$/,
	/^nldd-text-cell\[text="Hoogste niveau"\],\.text-cell__text$/,
	/^nldd-step-bar-item\[(status="current"|text="[^"]+")\],\.step-bar__item-(number|title)$/,
	/^nldd-status-bar,\.status-bar__text$/,
	/^\.woord$/,
	/^(nldd-button|\.menuknop),\.button__text$/
];

const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`axe, ${colorScheme} mode`, () => {
		test.use({ colorScheme });

		for (const url of pages) {
			test(url, async ({ page }) => {
				await page.goto(url);
				await page.evaluate(() => customElements.whenDefined('nldd-toolbar'));
				await page.waitForLoadState('networkidle');
				// A viewport as tall as the page: axe cannot resolve the background of text that crosses the viewport edge.
				const height = await page.evaluate(() => document.documentElement.scrollHeight);
				await page.setViewportSize({ width: 1280, height });

				const result = await new AxeBuilder({ page }).withTags(tags).analyze();
				expect(result.violations, JSON.stringify(result.violations, null, 1)).toEqual([]);

				const contrast = result.incomplete
					.filter((rule) => rule.id === 'color-contrast')
					.flatMap((rule) => rule.nodes.map((node) => node.target.join(',')))
					.filter((target) => !allowedContrast.some((allowed) => allowed.test(target)));
				expect(contrast, 'unreviewed color-contrast results').toEqual([]);
			});
		}
	});
}
