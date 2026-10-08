import { describe, expect, it } from 'vitest';
import {
	addImage,
	base64Bytes,
	pendingBytes,
	referenced,
	uniqueImage,
	withoutSent
} from '../../src/lib/client/pending-images';

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

	it('suffixes a same-named upload instead of replacing the first', () => {
		const list = [{ path: 'docs/afb/foto.png', base64: 'x' }];
		const upload = { repoPath: 'docs/afb/foto.png', markdownRef: 'afb/foto.png', base64: 'y' };
		expect(uniqueImage(list, upload)).toEqual({
			repoPath: 'docs/afb/foto-2.png',
			markdownRef: 'afb/foto-2.png',
			base64: 'y'
		});
		const more = [...list, { path: 'docs/afb/foto-2.png', base64: 'y' }];
		expect(uniqueImage(more, upload).repoPath).toBe('docs/afb/foto-3.png');
		expect(uniqueImage([], upload)).toBe(upload);
	});

	it('counts decoded bytes', () => {
		expect(base64Bytes(Buffer.from('abcd').toString('base64'))).toBe(4);
		expect(base64Bytes(Buffer.from('abcde').toString('base64'))).toBe(5);
		expect(base64Bytes(Buffer.from('abcdef').toString('base64'))).toBe(6);
		expect(
			pendingBytes([
				{ path: 'a', base64: Buffer.from('12').toString('base64') },
				{ path: 'b', base64: Buffer.from('123').toString('base64') }
			])
		).toBe(5);
	});

	it('sends only images the text still refers to', () => {
		const a = { path: 'docs/afb/a.png', base64: 'x' };
		const b = { path: 'docs/afb/b.png', base64: 'y' };
		expect(referenced([a, b], 'Tekst ![Alt](afb/b.png)')).toEqual([b]);
	});
});
