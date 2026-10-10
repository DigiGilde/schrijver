import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/lib/content/slug';

describe('slugify', () => {
	it('strips diacritics and punctuation', () => {
		expect(slugify('Nieuwe pagina: Éen test')).toBe('nieuwe-pagina-een-test');
	});
	it('trims separators', () => {
		expect(slugify('  --Hallo!  ')).toBe('hallo');
	});

	describe('with a length limit', () => {
		it('leaves a slug that fits alone', () => {
			expect(slugify('Een korte titel', 80)).toBe('een-korte-titel');
			expect(slugify('x'.repeat(80), 80)).toBe('x'.repeat(80));
		});
		it('cuts a longer slug at the last hyphen that fits', () => {
			expect(slugify('aaa bbb ccc ddd', 10)).toBe('aaa-bbb');
			expect(slugify('aaa bbb ccc ddd', 14)).toBe('aaa-bbb-ccc');
		});
		it('keeps every word when the cut falls right after one', () => {
			expect(slugify('aaa bbb ccc ddd', 11)).toBe('aaa-bbb-ccc');
		});
		it('cuts a single long word where it must', () => {
			expect(slugify('x'.repeat(100), 80)).toBe('x'.repeat(80));
			expect(slugify(`${'x'.repeat(100)} kort`, 80)).toBe('x'.repeat(80));
		});
		it('leaves whole words within the limit, whatever the limit', () => {
			const title = 'Één twee, drie! (vier) vijf & zes - zeven / acht: negen? tien';
			const full = slugify(title);
			for (let max = 3; max < full.length; max++) {
				const slug = slugify(title, max);
				expect(slug.length, `limit ${max}`).toBeLessThanOrEqual(max);
				expect(full.startsWith(`${slug}-`), `limit ${max}`).toBe(true);
			}
		});
	});
});
