import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIconPack } from '../../src/lib/content/mermaid-icons';
import { nlddIconPack } from '../../src/lib/server/nldd-icons';

const svg = (box: string, inner: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">\n\t${inner}\n</svg>`;

describe('buildIconPack', () => {
	const pack = buildIconPack(
		new Map([
			['bell', svg('0 0 24 24', '<path fill="currentColor" d="M1 1h2"/>')],
			['clock-light', svg('0 0 32 32', '<path d="M2 2h4"/>')],
			['kapot', '<path d="M0 0"/>']
		]),
		{ notification: 'bell', alarm: 'weg', bell: 'clock-light' }
	);

	it('keeps the inside of each svg under the nldd prefix on a 24 grid', () => {
		expect(pack.prefix).toBe('nldd');
		expect([pack.width, pack.height]).toEqual([24, 24]);
		expect(pack.icons.bell).toEqual({ body: '<path fill="currentColor" d="M1 1h2"/>' });
	});

	it('gives an icon on another grid its own size', () => {
		expect(pack.icons['clock-light']).toEqual({
			body: '<path d="M2 2h4"/>',
			width: 32,
			height: 32
		});
	});

	it('skips markup that is not an svg', () => {
		expect(pack.icons.kapot).toBeUndefined();
	});

	it('links an alias to its icon, unless the icon is missing or the alias is an icon itself', () => {
		expect(pack.aliases).toEqual({ notification: { parent: 'bell' } });
	});
});

describe('the NLDD icon pack', () => {
	function markdownFiles(dir: string): string[] {
		return readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) return markdownFiles(path);
			return name.endsWith('.md') ? [path] : [];
		});
	}

	it('is read from the design system', () => {
		const pack = nlddIconPack();
		expect(Object.keys(pack.icons).length).toBeGreaterThan(300);
		expect(pack.icons.bell.body).toMatch(/^<path /);
		expect(pack.aliases.outdent).toEqual({ parent: 'indent-decrease' });
	});

	it('holds every nldd: icon the MOZa diagrams use', () => {
		const pack = nlddIconPack();
		const used = new Set(
			markdownFiles('tests/corpus/moza-site').flatMap((file) =>
				[...readFileSync(file, 'utf8').matchAll(/icon:\s*"nldd:([\w-]+)"/g)].map((m) => m[1])
			)
		);
		expect(used.size).toBeGreaterThan(10);
		const missing = [...used].filter((name) => !pack.icons[name] && !pack.aliases[name]);
		expect(missing).toEqual([]);
	});
});
