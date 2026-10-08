import { crc32 } from 'node:zlib';

/**
 * Photo metadata out of an image without decoding it: the container is taken apart and put back
 * together without EXIF (location, time, camera, names), XMP, IPTC, comments and text chunks, so
 * the image data and its quality stay exactly as they were. An SVG is left to sanitizeSvg.
 */

type Walk = (bytes: Uint8Array) => Uint8Array[] | null;

const ascii = (bytes: Uint8Array, from: number, to: number) =>
	String.fromCharCode(...bytes.subarray(from, to));

const startsWith = (bytes: Uint8Array, text: string, at = 0) =>
	ascii(bytes, at, at + text.length) === text;

const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Not slice(): on a Node Buffer that is a view, and writing to it would change the caller's file. */
const copy = (bytes: Uint8Array) => new Uint8Array(bytes);

/** The orientation as browsers read it: the first SHORT with count 1 under tag 0x0112 in IFD0. */
function exifOrientation(exif: Uint8Array): number | null {
	const tiff = startsWith(exif, 'Exif\0') ? exif.subarray(6) : exif;
	const little = startsWith(tiff, 'II*\0');
	if (tiff.length < 8 || (!little && !startsWith(tiff, 'MM\0*'))) return null;
	const data = view(tiff);
	const ifd = data.getUint32(4, little);
	if (ifd + 2 > tiff.length) return null;
	const count = data.getUint16(ifd, little);
	for (let i = 0, entry = ifd + 2; i < count && entry + 12 <= tiff.length; i++, entry += 12) {
		if (
			data.getUint16(entry, little) === 0x0112 &&
			data.getUint16(entry + 2, little) === 3 &&
			data.getUint32(entry + 4, little) === 1
		) {
			return data.getUint16(entry + 8, little);
		}
	}
	return null;
}

const turned = (orientation: number | null): orientation is number =>
	orientation !== null && orientation > 1 && orientation <= 8;

/** EXIF that holds the orientation and nothing else, so a turned photo does not lie on its side. */
const orientationTiff = (orientation: number) =>
	Uint8Array.from([
		...latin1('MM\0*'),
		...[0, 0, 0, 8, 0, 1],
		...[0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0],
		...[0, 0, 0, 0]
	]);

const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const APP15 = 0xef;
const COM = 0xfe;
const SOS = 0xda;
const EOI = 0xd9;

const isAppOrComment = (marker: number) => (marker >= APP0 && marker <= APP15) || marker === COM;

/** libjpeg stops at JPG, DHP, EXP, JPGn and the reserved markers, so they are refused as well. */
const hasLength = (marker: number) =>
	(marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8) ||
	(marker >= 0xda && marker <= 0xdd) ||
	isAppOrComment(marker);

const isRestartOrTem = (marker: number) => (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;

/** The end of the entropy-coded data after SOS: the first 0xFF that is no stuffing or restart. */
function entropyEnd(bytes: Uint8Array, from: number): number {
	let at = bytes.indexOf(0xff, from);
	while (at !== -1 && (bytes[at + 1] === 0x00 || isRestartOrTem(bytes[at + 1]))) {
		at = bytes.indexOf(0xff, at + 2);
	}
	return at;
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
	const segment = new Uint8Array(4 + payload.length);
	segment.set([0xff, marker]);
	view(segment).setUint16(2, payload.length + 2);
	segment.set(payload, 4);
	return segment;
}

/** JFIF without its thumbnail, which can show what a crop left out. */
const jfif = (payload: Uint8Array) =>
	jpegSegment(APP0, Uint8Array.from([...payload.subarray(0, 12), 0, 0]));

const jpegExif = (orientation: number) =>
	jpegSegment(APP1, Uint8Array.from([...latin1('Exif\0\0'), ...orientationTiff(orientation)]));

function jpeg(bytes: Uint8Array): Uint8Array[] | null {
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	const kept = [bytes.subarray(0, 2)];
	let orientationRead = false;
	let at = 2;
	for (;;) {
		if (bytes[at] !== 0xff) return null;
		while (bytes[at] === 0xff) at++;
		const marker = bytes[at++];
		const start = at - 2;
		if (marker === EOI) {
			kept.push(bytes.subarray(start, at));
			return kept;
		}
		if (isRestartOrTem(marker)) {
			kept.push(bytes.subarray(start, at));
			continue;
		}
		if (!hasLength(marker) || at + 2 > bytes.length) return null;
		const end = at + ((bytes[at] << 8) | bytes[at + 1]);
		if (end < at + 2 || end > bytes.length) return null;
		const payload = bytes.subarray(at + 2, end);
		at = end;

		if (!isAppOrComment(marker)) kept.push(bytes.subarray(start, end));
		else if (marker === APP0 && startsWith(payload, 'JFIF\0') && payload.length >= 14) {
			kept.push(jfif(payload));
		} else if (
			(marker === APP2 && startsWith(payload, 'ICC_PROFILE\0')) ||
			(marker === APP14 && startsWith(payload, 'Adobe'))
		) {
			kept.push(bytes.subarray(start, end));
		} else if (marker === APP1 && !orientationRead && startsWith(payload, 'Exif\0')) {
			const orientation = exifOrientation(payload);
			orientationRead = orientation !== null;
			if (turned(orientation)) kept.push(jpegExif(orientation));
		}

		if (marker === SOS) {
			const scanEnd = entropyEnd(bytes, at);
			if (scanEnd === -1) return null;
			kept.push(bytes.subarray(at, scanEnd));
			at = scanEnd;
		}
	}
}

/** The critical chunks and the ancillary ones that change how the image is drawn or animated. */
const PNG_DRAWN = new Set([
	...'IHDR PLTE IDAT IEND'.split(' '),
	...'tRNS cHRM gAMA iCCP sBIT sRGB cICP mDCv cLLi bKGD pHYs acTL fcTL fdAT'.split(' ')
]);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const chunk = new Uint8Array(12 + data.length);
	chunk.set(latin1(type), 4);
	chunk.set(data, 8);
	view(chunk).setUint32(0, data.length);
	view(chunk).setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
	return chunk;
}

function png(bytes: Uint8Array): Uint8Array[] | null {
	if (!startsWith(bytes, '\x89PNG\r\n\x1a\n')) return null;
	const data = view(bytes);
	const kept = [bytes.subarray(0, 8)];
	let exifRead = false;
	for (let at = 8; at + 12 <= bytes.length;) {
		const type = ascii(bytes, at + 4, at + 8);
		const end = at + 12 + data.getUint32(at);
		if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return null;
		if (at === 8 ? type !== 'IHDR' : type === 'IHDR') return null;
		if (PNG_DRAWN.has(type)) kept.push(bytes.subarray(at, end));
		else if (type === 'eXIf' && !exifRead) {
			exifRead = true;
			const orientation = exifOrientation(bytes.subarray(at + 8, end - 4));
			if (turned(orientation)) kept.push(pngChunk('eXIf', orientationTiff(orientation)));
		} else if (/^[A-Z]/.test(type)) return null;
		if (type === 'IEND') return kept;
		at = end;
	}
	return null;
}

/** The bitstreams, alpha, animation and the colour profile. */
const WEBP_DRAWN = new Set(['VP8 ', 'VP8L', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function riffChunk(fourcc: string, data: Uint8Array): Uint8Array {
	const chunk = new Uint8Array(8 + data.length + (data.length % 2));
	chunk.set(latin1(fourcc));
	view(chunk).setUint32(4, data.length, true);
	chunk.set(data, 8);
	return chunk;
}

function webp(bytes: Uint8Array): Uint8Array[] | null {
	if (!startsWith(bytes, 'RIFF') || !startsWith(bytes, 'WEBP', 8)) return null;
	const data = view(bytes);
	const riffEnd = 8 + data.getUint32(4, true);
	if (riffEnd < 12 || riffEnd > bytes.length) return null;
	const kept: Uint8Array[] = [];
	let vp8x: Uint8Array | null = null;
	let exifRead = false;
	let exifKept = false;
	for (let at = 12; at < riffEnd;) {
		if (at + 8 > riffEnd) return null;
		const fourcc = ascii(bytes, at, at + 4);
		const size = data.getUint32(at + 4, true);
		const end = at + 8 + size + (size % 2);
		if (end > riffEnd) return null;
		if (fourcc === 'VP8X') {
			if (size < 10) return null;
			vp8x = copy(bytes.subarray(at, end));
			kept.push(vp8x);
		} else if (fourcc === 'EXIF' && !exifRead) {
			exifRead = true;
			const orientation = exifOrientation(bytes.subarray(at + 8, at + 8 + size));
			if (turned(orientation)) {
				kept.push(riffChunk('EXIF', orientationTiff(orientation)));
				exifKept = true;
			}
		} else if (WEBP_DRAWN.has(fourcc)) kept.push(bytes.subarray(at, end));
		at = end;
	}
	if (vp8x) vp8x[8] &= ~(VP8X_XMP | (exifKept ? 0 : VP8X_EXIF));
	const header = copy(bytes.subarray(0, 12));
	view(header).setUint32(4, 4 + kept.reduce((sum, chunk) => sum + chunk.length, 0), true);
	return [header, ...kept];
}

const WALKS = new Map<string, Walk>([
	['image/jpeg', jpeg],
	['image/png', png],
	['image/webp', webp]
]);

/** Whether stripMetadata can take this file apart; what it cannot, validateImage refuses. */
export function canStripMetadata(bytes: Uint8Array, mime: string): boolean {
	return mime === 'image/svg+xml' || !!WALKS.get(mime)?.(bytes);
}

/**
 * The same image, as a new array, without its metadata. A JPEG keeps APP0 (JFIF), its ICC profile
 * and APP14 (Adobe); a PNG keeps the chunks that are drawn; a WebP keeps its bitstreams and ICC
 * profile. Of the EXIF only an orientation other than 1 survives, in a new EXIF of its own.
 * Nothing after the end of the image survives either.
 */
export function stripMetadata(bytes: Uint8Array, mime: string): Uint8Array<ArrayBuffer> {
	if (mime === 'image/svg+xml') return copy(bytes);
	const pieces = WALKS.get(mime)?.(bytes);
	if (!pieces) throw new Error(`Cannot take the metadata out of this ${mime}`);
	const out = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
	let at = 0;
	for (const piece of pieces) {
		out.set(piece, at);
		at += piece.length;
	}
	return out;
}
