import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/lib/content/slug';

describe('slugify', () => {
	it('strips diacritics and punctuation', () => {
		expect(slugify('Nieuwe pagina: Éen test')).toBe('nieuwe-pagina-een-test');
	});
	it('trims separators', () => {
		expect(slugify('  --Hallo!  ')).toBe('hallo');
	});
});
