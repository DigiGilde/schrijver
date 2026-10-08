import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import {
	UNKNOWN_TOKEN_COLOUR,
	diagramBackground,
	mermaidConfig,
	resolveTokens
} from '../../src/lib/content/mermaid-look';

const [, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const tokens = moza.mermaid!.tokens;

function markdownFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return markdownFiles(path);
		return name.endsWith('.md') ? [path] : [];
	});
}

const mozaDiagrams = markdownFiles('tests/corpus/moza-site').flatMap((file) =>
	[...readFileSync(file, 'utf8').matchAll(/^```mermaid\n([\s\S]*?)^```/gm)].map((m) => m[1])
);

describe('resolveTokens', () => {
	const classDef =
		'classDef inzicht fill:var(--color-bg-light),stroke:var(--color-rijks-oranje),color:var(--color-text);';

	it('puts the light or dark colour of each token in place', () => {
		expect(resolveTokens(classDef, tokens, 'light')).toEqual({
			source: 'classDef inzicht fill:#f0f7ff,stroke:#e17000,color:#091629;',
			unknown: []
		});
		expect(resolveTokens(classDef, tokens, 'dark').source).toBe(
			'classDef inzicht fill:#172538,stroke:#e17000,color:#ebeef2;'
		);
	});

	it('turns an unknown token into a neutral colour and names it once', () => {
		const source = 'classDef a fill:var(--color-onbekend),stroke:var(--color-onbekend);';
		expect(resolveTokens(source, tokens, 'light')).toEqual({
			source: `classDef a fill:${UNKNOWN_TOKEN_COLOUR},stroke:${UNKNOWN_TOKEN_COLOUR};`,
			unknown: ['--color-onbekend']
		});
	});

	it('knows no token without a site table', () => {
		expect(resolveTokens('style A fill:var(--color-text)', {}, 'dark')).toEqual({
			source: `style A fill:${UNKNOWN_TOKEN_COLOUR}`,
			unknown: ['--color-text']
		});
	});

	it('leaves a diagram without tokens as it is', () => {
		const source = 'flowchart LR\n  A[Start] --> B[Einde]\n';
		expect(resolveTokens(source, tokens, 'light')).toEqual({ source, unknown: [] });
	});

	it('resolves every token the MOZa diagrams use with the fixture table', () => {
		const used = mozaDiagrams.filter((d) => d.includes('var(--'));
		expect(used.length).toBeGreaterThan(0);
		for (const diagram of used) {
			for (const scheme of ['light', 'dark'] as const) {
				const resolved = resolveTokens(diagram, tokens, scheme);
				expect(resolved.unknown).toEqual([]);
				expect(resolved.source).not.toContain('var(');
			}
		}
	});
});

describe('mermaidConfig', () => {
	it('draws in the MOZa look with strict security', () => {
		const config = mermaidConfig('light');
		expect(config).toMatchObject({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'base',
			layout: 'dagre',
			look: 'classic',
			flowchart: { wrappingWidth: 200, minNodeWidth: 0 },
			themeCSS: '.flowchartTitleText { font-weight: bold; font-size: 1.4em; }'
		});
		expect(config.themeVariables).toMatchObject({
			darkMode: false,
			primaryColor: '#d6e7fc',
			lineColor: '#184576',
			fontFamily: '"RijksSans", Calibri, sans-serif'
		});
	});

	it('has a dark variant', () => {
		expect(mermaidConfig('dark').themeVariables).toMatchObject({
			darkMode: true,
			primaryColor: '#163b64',
			primaryTextColor: '#ebeef2',
			lineColor: '#85b5ee'
		});
		expect(diagramBackground('light')).toBe('#f5f6f9');
		expect(diagramBackground('dark')).toBe('#172538');
	});
});
