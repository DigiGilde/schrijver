import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeDraft, type Draft } from '../../src/lib/client/draft';

const image = { path: 'a.png', base64: 'AAAA' } as NonNullable<Draft['images']>[number];
const draft = (images: Draft['images']): Draft => ({
	path: 'p.md',
	body: 'x',
	frontmatter: {},
	at: 1,
	images
});

afterEach(() => vi.unstubAllGlobals());

describe('writeDraft', () => {
	it('falls back to text only and reports incomplete when the first setItem throws and images are present', () => {
		const setItem = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error('quota');
			})
			.mockImplementation(() => undefined);
		vi.stubGlobal('localStorage', { setItem, removeItem: vi.fn() });
		expect(writeDraft('k', draft([image]))).toBe(false);
		expect(setItem).toHaveBeenCalledTimes(2);
		expect(JSON.parse(setItem.mock.calls[1][1]).images).toEqual([]);
	});

	it('stays complete when the fallback is needed but there are no images', () => {
		const setItem = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error('quota');
			})
			.mockImplementation(() => undefined);
		vi.stubGlobal('localStorage', { setItem, removeItem: vi.fn() });
		expect(writeDraft('k', draft([]))).toBe(true);
	});

	it('reports incomplete when storage is unusable and images are present', () => {
		vi.stubGlobal('localStorage', {
			setItem: () => {
				throw new Error('denied');
			},
			removeItem: vi.fn()
		});
		expect(writeDraft('k', draft([image]))).toBe(false);
		expect(writeDraft('k', draft([]))).toBe(true);
	});
});
