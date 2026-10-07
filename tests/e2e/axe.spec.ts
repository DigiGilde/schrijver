import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
	'/',
	'/sites/digi-handboek',
	'/sites/digi-handboek/bewerken/index.md',
	'/sites/digi-handboek/voorstellen/1',
	'/help',
	'/instellingen'
];

/**
 * Allowed color-contrast "incomplete" results. CodeMirror lines that cross the edge of the editor's own scroll
 * container cannot be resolved by axe (elmPartiallyObscuring); the lines that can be resolved pass.
 */
const allowedContrast = [/^nldd-text-editor,\.cm-line:nth-child\(\d+\)$/];

const tags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`axe, ${colorScheme} mode`, () => {
		test.use({ colorScheme });

		for (const url of pages) {
			test(url, async ({ page }) => {
				await page.goto(url);
				await page.evaluate(() => customElements.whenDefined('nldd-top-navigation-bar'));
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
