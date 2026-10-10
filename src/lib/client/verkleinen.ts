type Size = { width: number; height: number };
type Measured = Size & { bytes: number };
type Target = {
	type: 'image/webp' | 'image/jpeg' | 'image/png';
	extension: 'webp' | 'jpg' | 'png';
	quality?: number;
};
export type Shrunk = { file: File; from: Measured; to: Measured };

const SHRINKABLE = ['image/png', 'image/jpeg', 'image/webp'];
const OFFER_ABOVE_BYTES = 500 * 1024;
const MAX_SIDE = 2000;
const QUALITY = 0.82;

/** A candidate by its size alone: shrink() will have real work to do. */
export const isLarge = (file: File): boolean =>
	SHRINKABLE.includes(file.type) && file.size > OFFER_ABOVE_BYTES;

export function qualifies(bytes: number, { width, height }: Size): boolean {
	return bytes > OFFER_ABOVE_BYTES || width > MAX_SIDE || height > MAX_SIDE;
}

export function fitWithin({ width, height }: Size): Size {
	const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

export function chooseTarget(webp: boolean, transparent: boolean): Target {
	if (webp) return { type: 'image/webp', extension: 'webp', quality: QUALITY };
	return transparent
		? { type: 'image/png', extension: 'png' }
		: { type: 'image/jpeg', extension: 'jpg', quality: QUALITY };
}

export function withExtension(name: string, extension: string): string {
	const dot = name.lastIndexOf('.');
	return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

export function isSmaller(bytes: number, originalBytes: number): boolean {
	return bytes < originalBytes;
}

export function hasTransparency(rgba: Uint8ClampedArray): boolean {
	for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
	return false;
}

const ascii = (bytes: Uint8Array, from: number, to: number) =>
	String.fromCharCode(...bytes.subarray(from, to));

/** Drawn on a canvas, an animated PNG or WebP keeps only its first frame. */
export function isAnimated(head: Uint8Array): boolean {
	if (ascii(head, 1, 4) === 'PNG') {
		const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
		for (let at = 8; at + 8 <= head.length; at += 12 + view.getUint32(at)) {
			const chunk = ascii(head, at + 4, at + 8);
			if (chunk === 'acTL') return true;
			if (chunk === 'IDAT') return false;
		}
		return false;
	}
	return (
		ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 16) === 'WEBPVP8X' && (head[20] & 0x02) !== 0
	);
}

export function formatBytes(bytes: number): string {
	const kilobytes = Math.max(1, Math.round(bytes / 1024));
	return kilobytes < 1024
		? `${kilobytes} kB`
		: `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
	new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

let webpSupport: Promise<boolean> | undefined;

/** Safari answers a WebP request with a PNG, so the type that comes back is what counts. */
function canEncodeWebp(): Promise<boolean> {
	webpSupport ??= toBlob(document.createElement('canvas'), 'image/webp').then(
		(blob) => blob?.type === 'image/webp'
	);
	return webpSupport;
}

/** Any failure gives null: shrinking is an extra, so the original then goes as it is. */
export async function shrink(file: File): Promise<Shrunk | null> {
	if (!SHRINKABLE.includes(file.type)) return null;
	try {
		if (isAnimated(new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer()))) return null;
		const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		try {
			const from = { width: bitmap.width, height: bitmap.height, bytes: file.size };
			if (!qualifies(from.bytes, from)) return null;
			const size = fitWithin(from);
			const canvas = document.createElement('canvas');
			canvas.width = size.width;
			canvas.height = size.height;
			const context = canvas.getContext('2d');
			if (!context) return null;
			context.imageSmoothingQuality = 'high';
			context.drawImage(bitmap, 0, 0, size.width, size.height);

			const webp = await canEncodeWebp();
			const transparent =
				!webp &&
				file.type !== 'image/jpeg' &&
				hasTransparency(context.getImageData(0, 0, size.width, size.height).data);
			const target = chooseTarget(webp, transparent);
			const blob = await toBlob(canvas, target.type, target.quality);
			if (!blob || blob.type !== target.type || !isSmaller(blob.size, from.bytes)) return null;
			return {
				file: new File([blob], withExtension(file.name, target.extension), { type: target.type }),
				from,
				to: { ...size, bytes: blob.size }
			};
		} finally {
			bitmap.close();
		}
	} catch {
		return null;
	}
}
