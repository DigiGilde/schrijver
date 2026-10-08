import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	publicDraftExplained,
	rememberPublicDraftExplained
} from '../../src/lib/client/public-draft-notice';
import { clearAllDrafts } from '../../src/lib/client/draft';

function memoryStorage() {
	const items = new Map<string, string>();
	return {
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key),
		key: (index: number) => [...items.keys()][index] ?? null,
		get length() {
			return items.size;
		}
	};
}

afterEach(() => vi.unstubAllGlobals());

describe('public draft notice', () => {
	it('is remembered per site', () => {
		vi.stubGlobal('localStorage', memoryStorage());
		expect(publicDraftExplained('moza-site')).toBe(false);
		rememberPublicDraftExplained('moza-site');
		expect(publicDraftExplained('moza-site')).toBe(true);
		expect(publicDraftExplained('digi-handboek')).toBe(false);
	});

	it('is forgotten with the drafts on logout', () => {
		vi.stubGlobal('localStorage', memoryStorage());
		rememberPublicDraftExplained('moza-site');
		clearAllDrafts();
		expect(publicDraftExplained('moza-site')).toBe(false);
	});

	it('shows again when the storage is out of reach', () => {
		const blocked = () => {
			throw new Error('SecurityError');
		};
		vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
		expect(() => rememberPublicDraftExplained('moza-site')).not.toThrow();
		expect(publicDraftExplained('moza-site')).toBe(false);
	});
});
