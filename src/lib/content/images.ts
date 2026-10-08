import path from 'node:path';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import type { SiteConfig } from '$lib/config/types';
import { stripMetadata } from './fotogegevens';

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
export const MAX_SVG_BYTES = 1024 * 1024;

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
	if (path.posix.isAbsolute(pagePath) || pagePath.split('/').includes('..')) {
		throw new ImageError('Ongeldig pad voor afbeelding');
	}
	const dir = path.posix.dirname(pagePath);
	const base = path.posix.basename(pagePath, '.md');
	const slug = base === 'index' || base === '_index' ? path.posix.basename(dir) : base;
	const folder = conv.pad.replaceAll('{paginaslug}', slug).replaceAll('{paginamap}', dir);
	const base_ = path.posix.normalize(folder);
	const repoPath = path.posix.normalize(path.posix.join(base_, name));
	if (base_.startsWith('..') || path.posix.isAbsolute(base_) || !repoPath.startsWith(`${base_}/`)) {
		throw new ImageError('Ongeldig pad voor afbeelding');
	}
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

/** On success `bytes` is what to use from here on: the image without its photo metadata. */
export function validateImage(
	bytes: Uint8Array,
	mime: string
):
	| { ok: true; mime: string; bytes: Uint8Array<ArrayBuffer> }
	| { ok: false; status: 413 | 415; message: string } {
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
		if (bytes.length > MAX_SVG_BYTES)
			return { ok: false, status: 413, message: 'Een SVG mag niet groter zijn dan 1 MB' };
		if (!new TextDecoder().decode(bytes).includes('<svg')) return unsupported;
	} else if (sniff(bytes) !== mime) return unsupported;
	const stripped = stripMetadata(bytes, mime);
	return stripped ? { ok: true, mime, bytes: stripped } : unsupported;
}

const purify = createDOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis);
purify.addHook('afterSanitizeAttributes', (node) => {
	for (const attr of Array.from(node.attributes ?? [])) {
		const name = attr.name.toLowerCase();
		if (name.startsWith('on')) node.removeAttribute(attr.name);
		// Only references inside the SVG itself: no trackers or outbound links.
		else if ((name === 'href' || name === 'xlink:href') && !attr.value.trim().startsWith('#')) {
			node.removeAttribute(attr.name);
		}
	}
});

const TEXT_ELEMENTS = new Set(['text', 'tspan', 'textpath', 'title', 'desc']);
const TEXT_NODE = 3;

// Only text inside a text element, or inside an element in one such as a link, is ever shown.
purify.addHook('afterSanitizeElements', (node) => {
	if (node.nodeType !== TEXT_NODE) return;
	for (let parent = node.parentElement; parent; parent = parent.parentElement) {
		if (TEXT_ELEMENTS.has(parent.localName.toLowerCase())) return;
	}
	node.parentNode?.removeChild(node);
});

export function isSvgDocument(text: string): boolean {
	return /^\s*(<\?xml[^>]*\?>\s*)?<svg[\s>]/.test(text);
}

export function sanitizeSvg(text: string): string {
	return purify.sanitize(text, {
		USE_PROFILES: { svg: true, svgFilters: true },
		FORBID_TAGS: ['script', 'foreignObject', 'style', 'use', 'metadata'],
		ALLOW_DATA_ATTR: false,
		// Nothing in a removed element stays. That takes all text along, so #text is allowed again.
		KEEP_CONTENT: false,
		ADD_TAGS: ['#text']
	});
}
