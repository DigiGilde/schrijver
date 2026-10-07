import path from 'node:path';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import type { SiteConfig } from '$lib/config/types';

export class ImageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImageError';
	}
}

export const ALLOWED_IMAGE_TYPES = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/svg+xml': 'svg'
} as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSIONS = new Set<string>([...Object.values(ALLOWED_IMAGE_TYPES), 'jpeg']);

function sanitizeFileName(fileName: string): string {
	const clean = fileName
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-.]+/, '');
	const dot = clean.lastIndexOf('.');
	const ext = dot === -1 ? '' : clean.slice(dot + 1);
	const stem = dot === -1 ? clean : clean.slice(0, dot);
	if (!stem.replace(/^-+|-+$/g, '') || !EXTENSIONS.has(ext)) {
		throw new ImageError('Ongeldige bestandsnaam voor afbeelding');
	}
	return clean;
}

export function imagePath(
	site: SiteConfig,
	pagePath: string,
	fileName: string
): { repoPath: string; markdownRef: string } {
	const conv = site.content.afbeeldingen;
	if (!conv) throw new ImageError('Deze site accepteert geen afbeeldingen');
	const name = sanitizeFileName(fileName);
	const dir = path.posix.dirname(pagePath);
	const base = path.posix.basename(pagePath, '.md');
	const slug = base === 'index' || base === '_index' ? path.posix.basename(dir) : base;
	const folder = conv.pad.replaceAll('{paginaslug}', slug).replaceAll('{paginamap}', dir);
	const repoPath = path.posix.normalize(path.posix.join(folder, name));
	return { repoPath, markdownRef: path.posix.relative(dir, repoPath) };
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
	sig.every((v, i) => b[offset + i] === v);

function sniff(bytes: Uint8Array): string | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
		return 'image/webp';
	return null;
}

export function validateImage(
	bytes: Uint8Array,
	mime: string
): { ok: true; mime: string } | { ok: false; status: 413 | 415; message: string } {
	if (bytes.length > MAX_IMAGE_BYTES) {
		return { ok: false, status: 413, message: 'Afbeelding is groter dan 5 MB' };
	}
	const unsupported = {
		ok: false as const,
		status: 415 as const,
		message: 'Dit bestandstype wordt niet ondersteund (png, jpg, webp, svg)'
	};
	if (!(mime in ALLOWED_IMAGE_TYPES)) return unsupported;
	if (mime === 'image/svg+xml') {
		return new TextDecoder().decode(bytes).includes('<svg') ? { ok: true, mime } : unsupported;
	}
	return sniff(bytes) === mime ? { ok: true, mime } : unsupported;
}

export function sanitizeSvg(text: string): string {
	const purify = createDOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis);
	purify.addHook('afterSanitizeAttributes', (node) => {
		for (const attr of Array.from(node.attributes ?? [])) {
			if (attr.name.toLowerCase().startsWith('on')) node.removeAttribute(attr.name);
		}
	});
	return purify.sanitize(text, {
		USE_PROFILES: { svg: true, svgFilters: true },
		FORBID_TAGS: ['script', 'foreignObject']
	});
}
