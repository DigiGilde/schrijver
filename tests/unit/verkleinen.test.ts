import { describe, expect, it } from 'vitest';
import {
	chooseTarget,
	fitWithin,
	formatBytes,
	hasTransparency,
	isAnimated,
	isLarge,
	isSmaller,
	qualifies,
	withExtension
} from '../../src/lib/client/verkleinen';

const KB = 1024;

describe('isLarge', () => {
	const file = (type: string, size: number) => ({ type, size }) as File;

	it('counts png, jpg and webp over 500 kB', () => {
		expect(isLarge(file('image/png', 500 * KB + 1))).toBe(true);
		expect(isLarge(file('image/jpeg', 6 * KB * KB))).toBe(true);
		expect(isLarge(file('image/webp', 500 * KB + 1))).toBe(true);
	});

	it('leaves out 500 kB and less, and every other type', () => {
		expect(isLarge(file('image/png', 500 * KB))).toBe(false);
		expect(isLarge(file('image/svg+xml', 900 * KB))).toBe(false);
		expect(isLarge(file('image/gif', 900 * KB))).toBe(false);
	});
});

describe('qualifies', () => {
	const small = { width: 1000, height: 800 };

	it('wants more than 500 kB', () => {
		expect(qualifies(500 * KB, small)).toBe(false);
		expect(qualifies(500 * KB + 1, small)).toBe(true);
	});

	it('wants more than 2000 pixels in either direction', () => {
		expect(qualifies(10 * KB, { width: 2000, height: 2000 })).toBe(false);
		expect(qualifies(10 * KB, { width: 2001, height: 100 })).toBe(true);
		expect(qualifies(10 * KB, { width: 100, height: 2001 })).toBe(true);
	});
});

describe('fitWithin', () => {
	it('scales the longest side down to 2000 and keeps the ratio', () => {
		expect(fitWithin({ width: 4032, height: 3024 })).toEqual({ width: 2000, height: 1500 });
		expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1500, height: 2000 });
		expect(fitWithin({ width: 2400, height: 1600 })).toEqual({ width: 2000, height: 1333 });
	});

	it('leaves an image of 2000 pixels or less as it is', () => {
		expect(fitWithin({ width: 2000, height: 2000 })).toEqual({ width: 2000, height: 2000 });
		expect(fitWithin({ width: 1200, height: 800 })).toEqual({ width: 1200, height: 800 });
	});

	it('never goes below one pixel', () => {
		expect(fitWithin({ width: 20000, height: 1 })).toEqual({ width: 2000, height: 1 });
	});
});

describe('chooseTarget', () => {
	it('takes WebP at 0.82 when the browser can encode it, transparent or not', () => {
		const webp = { type: 'image/webp', extension: 'webp', quality: 0.82 };
		expect(chooseTarget(true, false)).toEqual(webp);
		expect(chooseTarget(true, true)).toEqual(webp);
	});

	it('falls back to JPEG for an opaque image', () => {
		expect(chooseTarget(false, false)).toEqual({
			type: 'image/jpeg',
			extension: 'jpg',
			quality: 0.82
		});
	});

	it('keeps PNG for transparency when WebP is not available', () => {
		expect(chooseTarget(false, true)).toEqual({ type: 'image/png', extension: 'png' });
	});
});

describe('withExtension', () => {
	it('keeps the stem and swaps the extension', () => {
		expect(withExtension('foto.jpg', 'webp')).toBe('foto.webp');
		expect(withExtension('image.png', 'webp')).toBe('image.webp');
		expect(withExtension('Mijn Foto.PNG', 'jpg')).toBe('Mijn Foto.jpg');
	});

	it('keeps dots inside the stem', () => {
		expect(withExtension('team.2026.final.png', 'webp')).toBe('team.2026.final.webp');
	});

	it('adds an extension to a name without one', () => {
		expect(withExtension('foto', 'webp')).toBe('foto.webp');
	});
});

describe('isSmaller', () => {
	it('wants strictly fewer bytes', () => {
		expect(isSmaller(379 * KB, 380 * KB)).toBe(true);
		expect(isSmaller(380 * KB, 380 * KB)).toBe(false);
		expect(isSmaller(381 * KB, 380 * KB)).toBe(false);
	});
});

describe('hasTransparency', () => {
	it('is false when every pixel is fully opaque', () => {
		expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
		expect(hasTransparency(new Uint8ClampedArray())).toBe(false);
	});

	it('is true for any pixel below full alpha', () => {
		expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]))).toBe(true);
		expect(hasTransparency(new Uint8ClampedArray([255, 255, 255, 0]))).toBe(true);
	});

	it('reads only the alpha bytes', () => {
		expect(hasTransparency(new Uint8ClampedArray([0, 0, 0, 255]))).toBe(false);
	});
});

describe('isAnimated', () => {
	const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
	const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
	const pngChunk = (type: string, data: number[]) => [
		...u32(data.length),
		...text(type),
		...data,
		0,
		0,
		0,
		0
	];
	const png = (...chunks: number[][]) =>
		new Uint8Array([0x89, ...text('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat()]);
	const ihdr = pngChunk('IHDR', new Array(13).fill(0));
	const webp = (chunk: string, flags: number) =>
		new Uint8Array([
			...text('RIFF'),
			...u32(22),
			...text('WEBP'),
			...text(chunk),
			...u32(10),
			flags,
			...new Array(9).fill(0)
		]);

	it('finds the animation control chunk of an APNG', () => {
		expect(
			isAnimated(png(ihdr, pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]), pngChunk('IDAT', [1])))
		).toBe(true);
	});

	it('walks past other chunks to find it', () => {
		const profile = pngChunk('iCCP', new Array(300).fill(7));
		expect(isAnimated(png(ihdr, profile, pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0])))).toBe(true);
	});

	it('is false for a still PNG, and stops looking at the image data', () => {
		expect(isAnimated(png(ihdr, pngChunk('IDAT', [1, 2, 3])))).toBe(false);
		expect(
			isAnimated(png(ihdr, pngChunk('IDAT', [1]), pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0])))
		).toBe(false);
	});

	it('is false for a PNG that is cut off', () => {
		expect(isAnimated(png(ihdr).subarray(0, 20))).toBe(false);
		expect(isAnimated(png(ihdr, pngChunk('iCCP', new Array(5000).fill(0))).subarray(0, 100))).toBe(
			false
		);
	});

	it('reads the animation flag of an extended WebP', () => {
		expect(isAnimated(webp('VP8X', 0x02))).toBe(true);
		expect(isAnimated(webp('VP8X', 0x02 | 0x10 | 0x20))).toBe(true);
		expect(isAnimated(webp('VP8X', 0x10))).toBe(false);
	});

	it('is false for a plain WebP, a JPEG and anything too short', () => {
		expect(isAnimated(webp('VP8 ', 0x02))).toBe(false);
		expect(isAnimated(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBe(false);
		expect(isAnimated(new Uint8Array())).toBe(false);
		expect(isAnimated(new Uint8Array([0x89, 0x50]))).toBe(false);
	});
});

describe('formatBytes', () => {
	it('gives whole kB below a megabyte, at least 1', () => {
		expect(formatBytes(1)).toBe('1 kB');
		expect(formatBytes(380 * KB)).toBe('380 kB');
		expect(formatBytes(1023 * KB)).toBe('1023 kB');
	});

	it('gives MB with a decimal comma from a megabyte up', () => {
		expect(formatBytes(KB * KB)).toBe('1,0 MB');
		expect(formatBytes(6.2 * KB * KB)).toBe('6,2 MB');
		expect(formatBytes(5 * KB * KB)).toBe('5,0 MB');
	});

	it('never writes 1024 kB', () => {
		expect(formatBytes(1023.6 * KB)).toBe('1,0 MB');
	});
});
