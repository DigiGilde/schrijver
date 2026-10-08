import { describe, expect, it } from 'vitest';
import { repoKey, sameRepo } from '$lib/forge/repo';

describe('repository names', () => {
	it('compares owner/name without regard to case', () => {
		expect(sameRepo('DigiGilde/handboek', 'digigilde/Handboek')).toBe(true);
		expect(sameRepo('DigiGilde/handboek', 'DigiGilde/handboek-fork')).toBe(false);
		expect(repoKey('MinBZK/MOZa-site')).toBe('minbzk/moza-site');
	});
});
