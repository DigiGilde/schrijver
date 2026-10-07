import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePage, serializePage } from '../../src/lib/content/frontmatter';

const corpusDir = join(__dirname, '..', 'corpus');
const files = readdirSync(corpusDir, { recursive: true, encoding: 'utf8' })
	.filter((f) => f.endsWith('.md') && f !== 'NORMALISATIES.md')
	.sort();
const expectedInvalid: string[] = JSON.parse(
	readFileSync(join(corpusDir, 'verwacht-ongeldig.json'), 'utf8')
);

describe('corpus round-trip', () => {
	it('has corpus files from both sites', () => {
		expect(files.filter((f) => f.startsWith('digi-handboek/')).length).toBeGreaterThan(0);
		expect(files.filter((f) => f.startsWith('moza-site/')).length).toBeGreaterThan(0);
	});

	it('serializes every valid file byte for byte and flags exactly the expected invalid files', () => {
		const invalid: string[] = [];
		for (const file of files) {
			const buffer = readFileSync(join(corpusDir, file));
			const text = buffer.toString('utf8');
			const page = parsePage(text);
			if (!page.ok) {
				invalid.push(file);
				continue;
			}
			const out = serializePage(page, []);
			expect(out, file).toBe(text);
			expect(Buffer.byteLength(out, 'utf8'), file).toBe(buffer.length);
		}
		expect(invalid.sort()).toEqual([...expectedInvalid].sort());
	});

	it('opens-read-only-on-parse-error', () => {
		const page = parsePage('+++\ntitle = "x"\n+++\nbody');
		expect(page.ok).toBe(false);
		if (!page.ok) expect(page.reason).toBe('toml');
	});
});
