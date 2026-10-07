import { describe, expect, it } from 'vitest';
import { addImage, withoutSent } from '../../src/lib/client/pending-images';

describe('pending images', () => {
	it('adds images and replaces one with the same path', () => {
		let list = addImage([], { path: 'a.png', base64: 'x' });
		list = addImage(list, { path: 'b.png', base64: 'y' });
		list = addImage(list, { path: 'a.png', base64: 'z' });
		expect(list).toEqual([
			{ path: 'b.png', base64: 'y' },
			{ path: 'a.png', base64: 'z' }
		]);
	});

	it('clears only what was sent', () => {
		const a = { path: 'a.png', base64: 'x' };
		const b = { path: 'b.png', base64: 'y' };
		expect(withoutSent([a, b], [a])).toEqual([b]);
		expect(withoutSent([a], [a])).toEqual([]);
		expect(withoutSent([{ path: 'a.png', base64: 'new' }], [a])).toHaveLength(1);
	});
});
