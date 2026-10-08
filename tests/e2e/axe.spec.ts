import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
	'/',
	'/sites/digi-handboek',
	'/sites/digi-handboek/bewerken/index.md',
	'/sites/digi-handboek/voorstellen/1',
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
 * in light mode, 9.8:1 in dark mode).
 */
const allowedContrast = [
	/^nldd-text-editor,\.cm-line:nth-child\(\d+\)$/,
	/^(nldd-top-title-bar|\.optisch),nldd-button(\[start-icon="chevron-left"\])?,\.button__text$/,
	/^nldd-button\[text="(Concept bewaren|Opslaan)"\],\.button__text$/,
	/^nldd-text-cell\[text="Hoogste niveau"\],\.text-cell__text$/
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
