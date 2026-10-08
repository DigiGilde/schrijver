import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseSchemaYaml, parseSitesYaml } from '../../src/lib/config/types';
import { stripMetadata } from '../../src/lib/content/fotogegevens';
import { MAX_IMAGE_BYTES, sanitizeSvg, validateImage } from '../../src/lib/content/images';
import { FakeForge } from '../../src/lib/forge/fake';
import { save } from '../../src/lib/forge/save';
import type { Identity } from '../../src/lib/forge/trailers';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { POST } from '../../src/routes/api/sites/[site]/afbeelding/+server';

/** Every function the module exports takes an image apart, so each call is a parse. */
const parses = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../src/lib/content/fotogegevens', async (original) => {
	const exports = await original<Record<string, unknown>>();
	return Object.fromEntries(
		Object.entries(exports).map(([name, value]) => [
			name,
			typeof value !== 'function'
				? value
				: (...args: unknown[]) => {
						parses.count++;
						return value(...args);
					}
		])
	);
});

const UNSUPPORTED = 'Dit bestandstype wordt niet ondersteund (png, jpg, webp, svg)';

const latin1 = (text: string) => Buffer.from(text, 'latin1');
const be16 = (n: number) => Buffer.from([n >> 8, n & 0xff]);
const be32 = (n: number) => {
	const bytes = Buffer.alloc(4);
	bytes.writeUInt32BE(n);
	return bytes;
};
const le32 = (n: number) => {
	const bytes = Buffer.alloc(4);
	bytes.writeUInt32LE(n);
	return bytes;
};
const strip = (bytes: Buffer, mime: string) => {
	const stripped = stripMetadata(bytes, mime);
	if (!stripped) throw new Error(`cannot take the metadata out of this ${mime}`);
	return Buffer.from(stripped);
};

/** What validateImage hands on for use: the same bytes stripMetadata gives. */
const accepted = (bytes: Buffer, mime: string) => {
	const checked = validateImage(bytes, mime);
	if (!checked.ok) throw new Error(`refused: ${checked.message}`);
	return Buffer.from(checked.bytes);
};

/* EXIF: a big-endian TIFF block, as cameras write it. */

type Field = { tag: number; type: 2 | 3 | 4 | 5; value: Buffer };
const UNIT = { 2: 1, 3: 2, 4: 4, 5: 8 };
const text = (tag: number, value: string): Field => ({ tag, type: 2, value: latin1(`${value}\0`) });
const short = (tag: number, value: number): Field => ({ tag, type: 3, value: be16(value) });
const long = (tag: number, value: number): Field => ({ tag, type: 4, value: be32(value) });
const rationals = (tag: number, ...values: [number, number][]): Field => ({
	tag,
	type: 5,
	value: Buffer.concat(values.flatMap(([n, d]) => [be32(n), be32(d)]))
});

/** An IFD at `offset`, with the values that do not fit in their entry right after it. */
function ifd(offset: number, fields: Field[]): Buffer {
	let outside = offset + 2 + fields.length * 12 + 4;
	const entries: Buffer[] = [];
	const values: Buffer[] = [];
	for (const { tag, type, value } of fields) {
		entries.push(be16(tag), be16(type), be32(value.length / UNIT[type]));
		if (value.length <= 4) {
			entries.push(value, Buffer.alloc(4 - value.length));
		} else {
			entries.push(be32(outside));
			values.push(value, Buffer.alloc(value.length % 2));
			outside += value.length + (value.length % 2);
		}
	}
	return Buffer.concat([be16(fields.length), ...entries, be32(0), ...values]);
}

const LATITUDE = rationals(0x0002, [52, 1], [5, 1], [2829, 100]);
const LONGITUDE = rationals(0x0004, [5, 1], [7, 1], [4500, 100]);

/** A phone's EXIF: camera, time, owner, orientation and a GPS location. */
function cameraExif(orientation: number): Buffer {
	const ifd0 = (gps: number) =>
		ifd(8, [
			text(0x010f, 'Fotofabriek'),
			text(0x0110, 'Kiekje 3000'),
			short(0x0112, orientation),
			text(0x0132, '2026:10:08 12:34:56'),
			text(0x013b, 'Jan Jansen'),
			long(0x8825, gps)
		]);
	const gps = 8 + ifd0(0).length;
	return Buffer.concat([
		latin1('MM\0*'),
		be32(8),
		ifd0(gps),
		ifd(gps, [text(0x0001, 'N'), LATITUDE, text(0x0003, 'E'), LONGITUDE])
	]);
}

/** What may stay of the EXIF: the orientation alone. */
const orientationOnly = (orientation: number) =>
	Buffer.concat([latin1('MM\0*'), be32(8), ifd(8, [short(0x0112, orientation)])]);

const XMP =
	'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description exif:GPSLatitude="52,5.4715N"' +
	' exif:GPSLongitude="5,7.75E"><dc:creator>Jan Jansen</dc:creator></rdf:Description></rdf:RDF>' +
	'</x:xmpmeta>';

const PERSONAL = ['Jan Jansen', 'Fotofabriek', 'Kiekje', '2026:10:08', 'GPS', 'Utrecht', 'xmpmeta'];

function expectNoMetadata(bytes: Buffer) {
	for (const word of PERSONAL) expect(bytes.includes(latin1(word)), word).toBe(false);
	expect(bytes.includes(LATITUDE.value)).toBe(false);
	expect(bytes.includes(LONGITUDE.value)).toBe(false);
}

function expectRefused(bytes: Buffer, mime: string) {
	expect(stripMetadata(bytes, mime)).toBeNull();
	expect(validateImage(bytes, mime)).toEqual({ ok: false, status: 415, message: UNSUPPORTED });
}

/* JPEG */

const segment = (marker: number, payload: Buffer) =>
	Buffer.concat([Buffer.from([0xff, marker]), be16(payload.length + 2), payload]);
const exifSegment = (tiff: Buffer) => segment(0xe1, Buffer.concat([latin1('Exif\0\0'), tiff]));
const oneCode = (table: number, symbol: number) =>
	segment(0xc4, Buffer.from([table, 1, ...new Array<number>(15).fill(0), symbol]));

const SOI = Buffer.from([0xff, 0xd8]);
const JFIF = segment(0xe0, Buffer.from([...latin1('JFIF\0'), 1, 2, 1, 0, 72, 0, 72, 0, 0]));
const ICC = segment(
	0xe2,
	Buffer.concat([latin1('ICC_PROFILE\0'), Buffer.from([1, 1]), latin1('sRGB')])
);
const ADOBE = segment(0xee, Buffer.from([...latin1('Adobe'), 0, 100, 0, 0, 0, 0, 0]));
const IPTC = segment(
	0xed,
	Buffer.concat([
		latin1('Photoshop 3.0\0'),
		latin1('8BIM'),
		Buffer.from([4, 4, 0, 0]),
		be32(15),
		Buffer.from([0x1c, 2, 80, 0, 10]),
		latin1('Jan Jansen'),
		Buffer.alloc(1)
	])
);

/** An 8 x 8 grey image: one block whose DC difference 0 and end of block are one-bit codes. */
const DQT = segment(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)]));
const SOF = segment(0xc0, Buffer.from([8, 0, 8, 0, 8, 1, 1, 0x11, 0]));
const DHT = Buffer.concat([oneCode(0x00, 0), oneCode(0x10, 0)]);
const SOS = segment(0xda, Buffer.from([1, 1, 0x00, 0, 63, 0]));
const DATA = Buffer.from([0x3f]);
const EOI = Buffer.from([0xff, 0xd9]);
const RESTART = Buffer.from([0xff, 0xd0]);
const GREY = Buffer.concat([DQT, SOF, DHT, SOS, DATA, EOI]);

/** A phone photo: EXIF, XMP, IPTC and a comment, and a preview with its own EXIF behind the end. */
function phonePhoto(orientation = 6): Buffer {
	return Buffer.concat([
		SOI,
		JFIF,
		exifSegment(cameraExif(orientation)),
		segment(0xe1, latin1(`http://ns.adobe.com/xap/1.0/\0${XMP}`)),
		ICC,
		IPTC,
		ADOBE,
		DQT,
		SOF,
		segment(0xfe, latin1('Gemaakt in Utrecht')),
		DHT,
		SOS,
		DATA,
		EOI,
		SOI,
		exifSegment(cameraExif(1)),
		GREY
	]);
}

describe('stripMetadata for a JPEG', () => {
	const stripped = strip(phonePhoto(), 'image/jpeg');

	it('takes out EXIF, XMP, IPTC, comments and what follows the image', () => {
		expectNoMetadata(stripped);
	});

	it('keeps orientation 6, and only that, in a new EXIF', () => {
		const exif = exifSegment(orientationOnly(6));
		const at = SOI.length + JFIF.length;
		expect(stripped.subarray(at, at + exif.length)).toEqual(exif);
	});

	it('keeps JFIF, the colour profile, the Adobe segment and the image data byte for byte', () => {
		expect(stripped).toEqual(
			Buffer.concat([SOI, JFIF, exifSegment(orientationOnly(6)), ICC, ADOBE, GREY])
		);
	});

	it('still passes validateImage and has nothing left to strip', () => {
		expect(validateImage(stripped, 'image/jpeg')).toMatchObject({ ok: true, mime: 'image/jpeg' });
		expect(strip(stripped, 'image/jpeg')).toEqual(stripped);
	});

	it('leaves the EXIF out when the photo was not turned', () => {
		expect(strip(phonePhoto(1), 'image/jpeg')).toEqual(
			Buffer.concat([SOI, JFIF, ICC, ADOBE, GREY])
		);
	});

	it('reads a little-endian orientation', () => {
		const tiff = Buffer.from(
			'49492a00' + '08000000' + '0100' + '120103000100000008000000' + '00000000',
			'hex'
		);
		expect(strip(Buffer.concat([SOI, exifSegment(tiff), GREY]), 'image/jpeg')).toEqual(
			Buffer.concat([SOI, exifSegment(orientationOnly(8)), GREY])
		);
	});

	it('passes a JPEG without metadata through unchanged', () => {
		const plain = Buffer.concat([SOI, JFIF, GREY]);
		expect(strip(plain, 'image/jpeg')).toEqual(plain);
	});

	it('drops the thumbnail from JFIF', () => {
		const withThumbnail = segment(
			0xe0,
			Buffer.from([...JFIF.subarray(4, 16), 2, 1, ...new Array<number>(6).fill(9)])
		);
		expect(strip(Buffer.concat([SOI, withThumbnail, GREY]), 'image/jpeg')).toEqual(
			Buffer.concat([SOI, JFIF, GREY])
		);
	});

	it('keeps stuffed bytes and restart markers in the scan, and drops a comment after it', () => {
		const scan = Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]);
		const head = Buffer.concat([SOI, DQT, SOF, DHT, SOS, scan]);
		const photo = Buffer.concat([head, segment(0xfe, latin1('Utrecht')), EOI]);
		expect(strip(photo, 'image/jpeg')).toEqual(Buffer.concat([head, EOI]));
	});

	it.each([
		['ends inside the image data', Buffer.concat([SOI, DQT, SOF, DHT, SOS, DATA])],
		[
			'has a segment longer than the file',
			Buffer.concat([SOI, segment(0xe1, latin1('Exif'))]).subarray(0, 8)
		],
		['has bytes between segments', Buffer.concat([SOI, Buffer.from([0]), GREY])],
		['uses a reserved marker', Buffer.concat([SOI, segment(0xf0, Buffer.alloc(4)), GREY])],
		['has a restart marker between segments', Buffer.concat([SOI, RESTART, GREY])],
		['has a TEM marker between segments', Buffer.concat([SOI, Buffer.from([0xff, 0x01]), GREY])]
	])('refuses a JPEG that %s', (_, bytes) => expectRefused(bytes, 'image/jpeg'));
});

/* PNG */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const chunk = (type: string, data: Buffer) => {
	const body = Buffer.concat([latin1(type), data]);
	return Buffer.concat([be32(data.length), body, be32(crc32(body))]);
};

const IHDR = chunk('IHDR', Buffer.concat([be32(2), be32(1), Buffer.from([8, 2, 0, 0, 0])]));
const PIXELS = deflateSync(Buffer.from([0, 0xd0, 0x10, 0x20, 0x10, 0x40, 0xd0]));
const IDAT = Buffer.concat([
	chunk('IDAT', PIXELS.subarray(0, 6)),
	chunk('IDAT', PIXELS.subarray(6))
]);
const IEND = chunk('IEND', Buffer.alloc(0));
const COLOUR = Buffer.concat([
	chunk('sRGB', Buffer.from([0])),
	chunk('gAMA', be32(45455)),
	chunk('cHRM', Buffer.concat([31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000].map(be32))),
	chunk('pHYs', Buffer.concat([be32(2835), be32(2835), Buffer.from([1])]))
]);

/** A 2 x 1 PNG with text, time, XMP and EXIF chunks, and a note behind the end. */
function annotatedPng(orientation = 6): Buffer {
	return Buffer.concat([
		SIGNATURE,
		IHDR,
		COLOUR,
		chunk('eXIf', cameraExif(orientation)),
		chunk('tEXt', latin1('Author\0Jan Jansen')),
		chunk(
			'zTXt',
			Buffer.concat([latin1('Comment\0\0'), deflateSync(latin1('Gemaakt in Utrecht'))])
		),
		chunk('iTXt', latin1(`XML:com.adobe.xmp\0\0\0\0\0${XMP}`)),
		IDAT,
		chunk('tIME', Buffer.from([0x07, 0xea, 10, 8, 12, 34, 56])),
		IEND,
		latin1('GPS 52.0907 N, 5.1214 E')
	]);
}

function chunksOf(png: Buffer) {
	const chunks: { type: string; crcValid: boolean }[] = [];
	for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
		const body = png.subarray(at + 4, at + 8 + png.readUInt32BE(at));
		chunks.push({
			type: body.subarray(0, 4).toString('latin1'),
			crcValid: crc32(body) === png.readUInt32BE(at + 8 + png.readUInt32BE(at))
		});
	}
	return chunks;
}

describe('stripMetadata for a PNG', () => {
	const stripped = strip(annotatedPng(), 'image/png');

	it('takes out the text, time and EXIF chunks and what follows the image', () => {
		expectNoMetadata(stripped);
		expect(chunksOf(stripped).map((c) => c.type)).toEqual([
			'IHDR',
			'sRGB',
			'gAMA',
			'cHRM',
			'pHYs',
			'eXIf',
			'IDAT',
			'IDAT',
			'IEND'
		]);
	});

	it('keeps the drawn chunks byte for byte and orientation 6 in an eXIf of its own', () => {
		expect(stripped).toEqual(
			Buffer.concat([SIGNATURE, IHDR, COLOUR, chunk('eXIf', orientationOnly(6)), IDAT, IEND])
		);
	});

	it('leaves the eXIf out when the image was not turned', () => {
		expect(strip(annotatedPng(1), 'image/png')).toEqual(
			Buffer.concat([SIGNATURE, IHDR, COLOUR, IDAT, IEND])
		);
	});

	it('has valid CRCs, passes validateImage and has nothing left to strip', () => {
		expect(chunksOf(stripped).every((c) => c.crcValid)).toBe(true);
		expect(validateImage(stripped, 'image/png')).toMatchObject({ ok: true, mime: 'image/png' });
		expect(strip(stripped, 'image/png')).toEqual(stripped);
	});

	it('keeps the colour profile, transparency and animation, and drops private chunks', () => {
		const drawn = Buffer.concat([
			chunk('iCCP', Buffer.concat([latin1('sRGB\0\0'), deflateSync(latin1('profile'))])),
			chunk('tRNS', Buffer.alloc(6)),
			chunk('bKGD', Buffer.alloc(6)),
			chunk('acTL', Buffer.concat([be32(1), be32(0)]))
		]);
		const png = Buffer.concat([
			SIGNATURE,
			IHDR,
			drawn,
			chunk('prVW', latin1('voorbeeld')),
			IDAT,
			IEND
		]);
		expect(strip(png, 'image/png')).toEqual(Buffer.concat([SIGNATURE, IHDR, drawn, IDAT, IEND]));
	});

	it.each([
		['ends before IEND', Buffer.concat([SIGNATURE, IHDR, IDAT])],
		[
			'has a chunk longer than the file',
			Buffer.concat([SIGNATURE, IHDR, be32(1000), latin1('IDAT'), Buffer.alloc(8)])
		],
		['does not start with IHDR', Buffer.concat([SIGNATURE, COLOUR, IHDR, IDAT, IEND])],
		[
			'has an unknown critical chunk',
			Buffer.concat([SIGNATURE, IHDR, chunk('CgBI', be32(0)), IDAT, IEND])
		]
	])('refuses a PNG that %s', (_, bytes) => expectRefused(bytes, 'image/png'));
});

/* WebP */

const riffChunk = (fourcc: string, data: Buffer) =>
	Buffer.concat([latin1(fourcc), le32(data.length), data, Buffer.alloc(data.length % 2)]);
const riff = (...chunks: Buffer[]) => {
	const body = Buffer.concat([latin1('WEBP'), ...chunks]);
	return Buffer.concat([latin1('RIFF'), le32(body.length), body]);
};

/** A 1 x 1 lossy frame. */
const FRAME = riffChunk('VP8 ', Buffer.from('3001009d012a010001000ec0fe25a400037000000000', 'hex'));
const ICCP = riffChunk('ICCP', latin1('a colour profile'));
const [ICC_FLAG, EXIF_FLAG, XMP_FLAG] = [0x20, 0x08, 0x04];
const vp8x = (flags: number) => riffChunk('VP8X', Buffer.from([flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

/** A WebP with EXIF, XMP and a private chunk, and a note behind the end. */
const annotatedWebp = (orientation = 6) =>
	Buffer.concat([
		riff(
			vp8x(ICC_FLAG | EXIF_FLAG | XMP_FLAG),
			ICCP,
			FRAME,
			riffChunk('EXIF', cameraExif(orientation)),
			riffChunk('XMP ', latin1(XMP)),
			riffChunk('PRIV', latin1('Jan Jansen'))
		),
		latin1('GPS')
	]);

describe('stripMetadata for a WebP', () => {
	const stripped = strip(annotatedWebp(), 'image/webp');

	it('takes out the EXIF, XMP and private chunks and what follows the image', () => {
		expectNoMetadata(stripped);
	});

	it('keeps the frame and the colour profile byte for byte, and orientation 6 with its flag', () => {
		expect(stripped).toEqual(
			riff(vp8x(ICC_FLAG | EXIF_FLAG), ICCP, FRAME, riffChunk('EXIF', orientationOnly(6)))
		);
	});

	it('clears the EXIF and XMP flags when the image was not turned', () => {
		expect(strip(annotatedWebp(1), 'image/webp')).toEqual(riff(vp8x(ICC_FLAG), ICCP, FRAME));
	});

	it('has a valid RIFF size, passes validateImage and has nothing left to strip', () => {
		expect(stripped.readUInt32LE(4)).toBe(stripped.length - 8);
		expect(validateImage(stripped, 'image/webp')).toMatchObject({ ok: true, mime: 'image/webp' });
		expect(strip(stripped, 'image/webp')).toEqual(stripped);
	});

	it('passes a lossless WebP with a padded chunk through unchanged', () => {
		const lossless = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
		expect(strip(lossless, 'image/webp')).toEqual(lossless);
	});

	it.each([
		['is shorter than its RIFF size', riff(vp8x(0), FRAME).subarray(0, 30)],
		['has a chunk beyond the RIFF size', riff(latin1('VP8 '), le32(4000), Buffer.alloc(10))],
		['has a VP8X chunk that is too short', riff(riffChunk('VP8X', Buffer.alloc(4)), FRAME)]
	])('refuses a WebP that %s', (_, bytes) => expectRefused(bytes, 'image/webp'));
});

describe('stripMetadata on a Node Buffer', () => {
	it.each([
		['image/jpeg', phonePhoto()],
		['image/png', annotatedPng()],
		['image/webp', annotatedWebp()]
	])('leaves the %s it was given untouched', (mime, bytes) => {
		const before = Buffer.from(bytes);
		stripMetadata(bytes, mime);
		expect(bytes).toEqual(before);
	});
});

describe('validateImage', () => {
	it.each([
		['image/jpeg', phonePhoto()],
		['image/png', annotatedPng()],
		['image/webp', annotatedWebp()]
	])('hands on the %s without its metadata', (mime, bytes) => {
		expect(accepted(bytes, mime)).toEqual(strip(bytes, mime));
	});
});

describe('the smallest EXIF that holds an orientation', () => {
	const smallest = Buffer.from(
		'4d4d002a' + '00000008' + '0001' + '0112' + '0003' + '00000001' + '00060000',
		'hex'
	);

	it.each([
		[
			'JPEG',
			'image/jpeg',
			Buffer.concat([SOI, exifSegment(smallest), GREY]),
			Buffer.concat([SOI, exifSegment(orientationOnly(6)), GREY])
		],
		[
			'PNG',
			'image/png',
			Buffer.concat([SIGNATURE, IHDR, chunk('eXIf', smallest), IDAT, IEND]),
			Buffer.concat([SIGNATURE, IHDR, chunk('eXIf', orientationOnly(6)), IDAT, IEND])
		],
		[
			'WebP',
			'image/webp',
			riff(FRAME, riffChunk('EXIF', smallest)),
			riff(FRAME, riffChunk('EXIF', orientationOnly(6)))
		]
	])('is rebuilt in a %s, a few bytes larger than it was', (_, mime, bytes, rebuilt) => {
		const stripped = strip(bytes, mime);
		expect(stripped).toEqual(rebuilt);
		expect(stripped.length).toBeGreaterThan(bytes.length);
		expect(stripped.length).toBeLessThanOrEqual(bytes.length + 64);
	});
});

/* Files made to cost more than they are: the same few bytes, over and over */

const many = (unit: Buffer) =>
	Buffer.alloc(Math.floor((MAX_IMAGE_BYTES - 64) / unit.length) * unit.length).fill(unit);
const repeat = (part: Buffer, count: number) => Array<Buffer>(count).fill(part);

describe('a file of countless tiny parts', () => {
	const EMPTY_DQT = segment(0xdb, Buffer.alloc(0));
	const EMPTY_ALPH = riffChunk('ALPH', Buffer.alloc(0));
	const EMPTY_IDAT = chunk('IDAT', Buffer.alloc(0));

	it.each([
		['restart markers', 'image/jpeg', Buffer.concat([SOI, many(RESTART), EOI])],
		['empty DQT segments', 'image/jpeg', Buffer.concat([SOI, many(EMPTY_DQT), EOI])],
		['empty ALPH chunks', 'image/webp', riff(many(EMPTY_ALPH))],
		['empty IDAT chunks', 'image/png', Buffer.concat([SIGNATURE, IHDR, many(EMPTY_IDAT), IEND])]
	])('is refused when it is 5 MB of %s', (_, mime, bytes) => expectRefused(bytes, mime));

	const COMMENT = segment(0xfe, Buffer.alloc(0));
	const TEXT = chunk('tEXt', Buffer.alloc(0));
	const PRIVATE = riffChunk('PRIV', Buffer.alloc(0));
	const GREY_SEGMENTS = 6; // DQT, SOF, two DHT, SOS and EOI
	const PNG_CHUNKS = 4; // IHDR, two IDAT and IEND
	const WEBP_CHUNKS = 1; // the frame

	it.each([
		[
			'segments in a JPEG',
			'image/jpeg',
			(parts: number) => Buffer.concat([SOI, ...repeat(COMMENT, parts - GREY_SEGMENTS), GREY]),
			Buffer.concat([SOI, GREY])
		],
		[
			'chunks in a PNG',
			'image/png',
			(parts: number) =>
				Buffer.concat([SIGNATURE, IHDR, ...repeat(TEXT, parts - PNG_CHUNKS), IDAT, IEND]),
			Buffer.concat([SIGNATURE, IHDR, IDAT, IEND])
		],
		[
			'chunks in a WebP',
			'image/webp',
			(parts: number) => riff(FRAME, ...repeat(PRIVATE, parts - WEBP_CHUNKS)),
			riff(FRAME)
		]
	])('takes 10,000 %s and refuses one more', (_, mime, build, clean) => {
		expect(strip(build(10_000), mime)).toEqual(clean);
		expectRefused(build(10_001), mime);
	});
});

/* SVG */

describe('SVG metadata', () => {
	const svg =
		'<svg xmlns="http://www.w3.org/2000/svg"><metadata><rdf:RDF><dc:creator>Jan Jansen' +
		'</dc:creator></rdf:RDF></metadata><title>Kaart</title><circle r="1"/></svg>';

	it('passes through unchanged, for sanitizeSvg to handle', () => {
		expect(strip(latin1(svg), 'image/svg+xml')).toEqual(latin1(svg));
	});

	it('goes in sanitizeSvg, with everything the metadata element holds', () => {
		const clean = sanitizeSvg(svg);
		expect(clean).not.toMatch(/metadata|Jan Jansen/);
		expect(clean).toContain('<title>Kaart</title>');
		expect(clean).toContain('<circle r="1"></circle>');
	});
});

/* Where images come in: the upload, and the save that commits them */

const sites = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const digi = sites.find((s) => s.id === 'digi-handboek')!;

describe('POST /api/sites/[site]/afbeelding', () => {
	beforeAll(() => {
		setConfigStore({ site: (id: string) => sites.find((s) => s.id === id) } as never);
		const forge = new FakeForge();
		forge.seedRepo(digi.repo, 'main', { 'docs/kennis/foo.md': '# Foo\n' });
		setForge(forge);
	});

	function upload(name: string, type: string, bytes: Buffer) {
		const form = new FormData();
		form.set('bestand', new File([new Uint8Array(bytes)], name, { type }));
		form.set('pagina', 'docs/kennis/foo.md');
		form.set('alt', 'Een foto');
		const request = new Request('http://localhost/api/sites/digi-handboek/afbeelding', {
			method: 'POST',
			body: form,
			headers: { 'X-Requested-With': 'Schrijver' }
		});
		return POST({
			request,
			params: { site: 'digi-handboek' },
			locals: { user: { id: 'u' } }
		} as never);
	}

	it('returns the photo without its metadata', async () => {
		const res = await upload('foto.jpg', 'image/jpeg', phonePhoto());
		expect(res.status).toBe(200);
		const { base64 } = await res.json();
		expect(Buffer.from(base64, 'base64')).toEqual(strip(phonePhoto(), 'image/jpeg'));
	});

	it('refuses a file it cannot take apart', async () => {
		const res = await upload('kapot.png', 'image/png', Buffer.concat([SIGNATURE, IHDR, IDAT]));
		expect(res.status).toBe(415);
		expect(await res.json()).toEqual({ message: UNSUPPORTED });
	});

	it('refuses 5 MB of restart markers', async () => {
		const res = await upload('vol.jpg', 'image/jpeg', Buffer.concat([SOI, many(RESTART), EOI]));
		expect(res.status).toBe(415);
		expect(await res.json()).toEqual({ message: UNSUPPORTED });
	});

	it('takes the photo apart once', async () => {
		parses.count = 0;
		await upload('foto.jpg', 'image/jpeg', phonePhoto());
		expect(parses.count).toBe(1);
	});
});

describe('save', () => {
	const schema = parseSchemaYaml(
		readFileSync('tests/fixtures/config/schemas/digi-handboek.yaml', 'utf8')
	);
	const identity: Identity = { kind: 'anoniem', pseudoniem: 'abc123def456' };
	const foto = 'docs/afbeeldingen/docs/foto.jpg';

	async function saveWith(bytes: Buffer) {
		const forge = new FakeForge();
		forge.seedRepo(digi.repo, 'main', {
			'docs/index.md': '---\ndescription: Oud\n---\n\n# Home\n'
		});
		const baseSha = (await forge.readFile(digi.repo, 'main', 'docs/index.md'))!.sha;
		const result = await save(forge, digi, schema, identity, {
			path: 'docs/index.md',
			body: '\n# Home\n\n![Een foto](afbeeldingen/docs/foto.jpg)\n',
			frontmatter: { description: 'Oud' },
			changedKeys: [],
			baseSha,
			branch: null,
			prNumber: null,
			images: [{ path: foto, base64: bytes.toString('base64') }]
		});
		return { forge, result };
	}

	it('commits a photo without its metadata, also when the request skipped the upload', async () => {
		const { forge, result } = await saveWith(phonePhoto());
		if (!result.ok) throw new Error(JSON.stringify(result));
		const stored = await forge.readFile(digi.repo, result.branch, foto);
		expect(Buffer.from(stored!.content)).toEqual(strip(phonePhoto(), 'image/jpeg'));
	});

	it('refuses a photo it cannot take apart', async () => {
		const { forge, result } = await saveWith(Buffer.concat([SOI, DQT, SOF, DHT, SOS, DATA]));
		expect(result).toMatchObject({ ok: false, status: 415, error: { message: UNSUPPORTED } });
		expect(forge.branches(digi.repo)).toEqual(['main']);
	});

	it('refuses 5 MB of restart markers', async () => {
		const { forge, result } = await saveWith(Buffer.concat([SOI, many(RESTART), EOI]));
		expect(result).toMatchObject({ ok: false, status: 415, error: { message: UNSUPPORTED } });
		expect(forge.branches(digi.repo)).toEqual(['main']);
	});

	it('takes the photo apart once', async () => {
		parses.count = 0;
		await saveWith(phonePhoto());
		expect(parses.count).toBe(1);
	});
});
