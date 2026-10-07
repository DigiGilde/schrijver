import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	MERMAID_DESCR_MESSAGE,
	findMermaidBlocks,
	missingDescriptions,
	mermaidScaffold
} from '../../src/lib/content/mermaid';

const corpusRoot = fileURLToPath(new URL('../corpus/moza-site', import.meta.url));

function markdownFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return markdownFiles(path);
		return name.endsWith('.md') ? [path] : [];
	});
}

describe('mermaid corpus', () => {
	it('finds every MOZa mermaid block and each carries accDescr', () => {
		let total = 0;
		for (const file of markdownFiles(corpusRoot)) {
			const blocks = findMermaidBlocks(readFileSync(file, 'utf8'));
			total += blocks.length;
			for (const block of blocks) {
				expect(block.hasAccDescr, file).toBe(true);
			}
		}
		expect(total).toBe(12);
	});
});

describe('mermaidScaffold', () => {
	it('contains accTitle and accDescr lines', () => {
		const scaffold = mermaidScaffold();
		expect(scaffold).toContain('accTitle:');
		expect(scaffold).toContain('accDescr:');
		expect(scaffold.startsWith('```mermaid\n')).toBe(true);
		expect(scaffold.endsWith('```\n')).toBe(true);
	});

	it('is a block that is itself described', () => {
		const [block] = findMermaidBlocks(mermaidScaffold());
		expect(block.hasAccDescr).toBe(true);
		expect(block.hasAccTitle).toBe(true);
		expect(missingDescriptions(mermaidScaffold())).toEqual([]);
	});
});

describe('missingDescriptions', () => {
	it('returns the line of the opening fence of an undescribed block', () => {
		const body = [
			'# Titel',
			'',
			'```mermaid',
			'flowchart LR',
			'  accDescr: Een beschrijving',
			'  A --> B',
			'```',
			'',
			'Tekst',
			'',
			'```mermaid',
			'flowchart LR',
			'  A --> B',
			'```',
			''
		].join('\n');
		expect(missingDescriptions(body)).toEqual([11]);
		expect(MERMAID_DESCR_MESSAGE).toBe('Elk Mermaid-diagram heeft een beschrijving (accDescr) nodig');
	});

	it('accepts the multi-line accDescr form', () => {
		const body = '```mermaid\nflowchart LR\n  accDescr {\n    Een lange\n    beschrijving\n  }\n  A --> B\n```\n';
		expect(findMermaidBlocks(body)[0].hasAccDescr).toBe(true);
		expect(missingDescriptions(body)).toEqual([]);
	});

	it('ignores mermaid text inside a non-mermaid fence', () => {
		const body = '````md\n```mermaid\nflowchart LR\n  A --> B\n```\n````\n';
		expect(findMermaidBlocks(body)).toEqual([]);
		expect(missingDescriptions(body)).toEqual([]);
	});
});

describe('findMermaidBlocks', () => {
	it('handles a four-backtick fence with an inner three-backtick line', () => {
		const body = '````mermaid\nflowchart LR\n  accTitle: Titel\n```\n  A --> B\n````\nTekst';
		const [block] = findMermaidBlocks(body);
		expect(block.start).toBe(0);
		expect(body.slice(block.start, block.end)).toBe(
			'````mermaid\nflowchart LR\n  accTitle: Titel\n```\n  A --> B\n````'
		);
		expect(block.hasAccTitle).toBe(true);
		expect(block.hasAccDescr).toBe(false);
	});

	it('detects an unterminated fence without throwing', () => {
		const body = 'Inleiding\n\n```mermaid\nflowchart LR\n  A --> B\n';
		const blocks = findMermaidBlocks(body);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].start).toBe(body.indexOf('```mermaid'));
		expect(blocks[0].end).toBe(body.length);
		expect(blocks[0].hasAccDescr).toBe(false);
		expect(missingDescriptions(body)).toEqual([3]);
	});
});

describe('tilde fences and line endings', () => {
	it('reports a ~~~mermaid block without accDescr', () => {
		const body = 'Tekst\n\n~~~mermaid\nflowchart LR\n  A --> B\n~~~\n';
		const blocks = findMermaidBlocks(body);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].hasAccDescr).toBe(false);
		expect(missingDescriptions(body)).toEqual([3]);
	});

	it('does not report mermaid text inside a ~~~ fence', () => {
		const body = '~~~\n```mermaid\nflowchart LR\n  A --> B\n```\n~~~\n';
		expect(findMermaidBlocks(body)).toEqual([]);
		expect(missingDescriptions(body)).toEqual([]);
	});

	it('does not close a ~~~mermaid block on a backtick line', () => {
		const body = '~~~mermaid\nflowchart LR\n  A --> B\n```\n';
		const blocks = findMermaidBlocks(body);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].end).toBe(body.length);
	});

	it('handles a CRLF body', () => {
		const body =
			'# T\r\n\r\n```mermaid\r\nflowchart LR\r\n  accDescr: Een beschrijving\r\n  A --> B\r\n```\r\n\r\n```mermaid\r\nflowchart LR\r\n  A --> B\r\n```\r\n';
		const blocks = findMermaidBlocks(body);
		expect(blocks).toHaveLength(2);
		expect(blocks[0].start).toBe(body.indexOf('```mermaid'));
		expect(blocks[0].end).toBe(body.indexOf('```\r\n') + 3);
		expect(blocks[0].hasAccDescr).toBe(true);
		expect(blocks[1].hasAccDescr).toBe(false);
		expect(missingDescriptions(body)).toEqual([9]);
	});

	it('does not count a %% accDescr comment as a description', () => {
		const body = '```mermaid\nflowchart LR\n  %% accDescr: niet echt\n  A --> B\n```\n';
		expect(findMermaidBlocks(body)[0].hasAccDescr).toBe(false);
		expect(missingDescriptions(body)).toEqual([1]);
	});
});
