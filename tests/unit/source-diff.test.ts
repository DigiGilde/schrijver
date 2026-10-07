import { describe, expect, it } from 'vitest';
import { sourceDiff } from '../../src/lib/content/source-diff';

describe('sourceDiff', () => {
	it('shows raw HTML and link targets that the rendered view hides', () => {
		const parts = sourceDiff(
			'[Formulier](https://example.org/a)\n',
			'[Formulier](https://evil.example/a)\n<script>x</script>\n'
		);
		const added = parts.filter((p) => p.kind === 'added').map((p) => ('text' in p ? p.text : ''));
		expect(added.join('')).toContain('https://evil.example/a');
		expect(added.join('')).toContain('<script>x</script>');
		expect(
			parts.some((p) => p.kind === 'removed' && p.text.includes('https://example.org/a'))
		).toBe(true);
	});

	it('shortens long unchanged stretches to context', () => {
		const lines = Array.from({ length: 40 }, (_, i) => `regel ${i}`);
		const after = [...lines.slice(0, 20), 'nieuw', ...lines.slice(20)];
		const parts = sourceDiff(lines.join('\n') + '\n', after.join('\n') + '\n');
		expect(parts.filter((p) => p.kind === 'skip').map((p) => ('lines' in p ? p.lines : 0))).toEqual(
			[17, 17]
		);
		expect(parts.find((p) => p.kind === 'added')).toEqual({ kind: 'added', text: 'nieuw\n' });
	});

	it('treats a new file as all added', () => {
		expect(sourceDiff(null, 'a\n')).toEqual([{ kind: 'added', text: 'a\n' }]);
	});
});
