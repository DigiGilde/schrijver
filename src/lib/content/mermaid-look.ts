import type { MermaidConfig } from 'mermaid';
import type { SiteConfig } from '$lib/config/types';

export type ColourScheme = 'light' | 'dark';

/** Per-site colours for `var(--token)` in a diagram: `mermaid.tokens` in `.schrijver/site.yaml`. */
export type DiagramTokens = NonNullable<SiteConfig['mermaid']>['tokens'];

/** Stands in for a token the site does not define; it reads against both diagram backgrounds. */
export const UNKNOWN_TOKEN_COLOUR = '#808080';

/** The theme MOZa's build resolves from its NLDD tokens (scripts/render-mermaid.js in moza-site). */
const THEME_VARIABLES = {
	light: {
		darkMode: false,
		primaryColor: '#d6e7fc',
		primaryTextColor: '#091629',
		primaryBorderColor: '#184576',
		lineColor: '#184576',
		secondaryColor: '#f5f6f9',
		tertiaryColor: '#f0f7ff',
		edgeLabelBackground: '#f5f6f9'
	},
	dark: {
		darkMode: true,
		primaryColor: '#163b64',
		primaryTextColor: '#ebeef2',
		primaryBorderColor: '#85b5ee',
		lineColor: '#85b5ee',
		secondaryColor: '#172538',
		tertiaryColor: '#172538',
		edgeLabelBackground: '#172538'
	}
} satisfies Record<ColourScheme, Record<string, string | boolean>>;

export function mermaidConfig(scheme: ColourScheme): MermaidConfig {
	return {
		startOnLoad: false,
		securityLevel: 'strict',
		// A failed render would otherwise leave Mermaid's error drawing behind in the page.
		suppressErrorRendering: true,
		theme: 'base',
		// The site renders with Mermaid 11; these are its defaults where 12 changed them.
		layout: 'dagre',
		look: 'classic',
		flowchart: { wrappingWidth: 200, minNodeWidth: 0 },
		themeCSS: '.flowchartTitleText { font-weight: bold; font-size: 1.4em; }',
		themeVariables: {
			...THEME_VARIABLES[scheme],
			fontFamily: '"RijksSans", Calibri, sans-serif'
		}
	};
}

/** The surface the site draws behind a diagram. */
export function diagramBackground(scheme: ColourScheme): string {
	return THEME_VARIABLES[scheme].secondaryColor;
}

const TOKEN = /var\((--[\w-]+)\)/g;

/**
 * Puts the site's colour in place of each `var(--token)`, as the site's build does before it
 * renders: Mermaid cannot parse a `classDef` with `var()` in it. A token the site does not know
 * becomes a neutral colour, so the diagram still renders; `unknown` names those tokens.
 */
export function resolveTokens(
	source: string,
	tokens: DiagramTokens,
	scheme: ColourScheme
): { source: string; unknown: string[] } {
	const unknown = new Set<string>();
	const resolved = source.replace(TOKEN, (_, name: string) => {
		if (!Object.hasOwn(tokens, name)) {
			unknown.add(name);
			return UNKNOWN_TOKEN_COLOUR;
		}
		return scheme === 'dark' ? tokens[name].donker : tokens[name].licht;
	});
	return { source: resolved, unknown: [...unknown] };
}
