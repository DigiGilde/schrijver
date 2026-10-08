import type { PageSchema, SiteConfig } from '../config/types';
import { parsePage } from '../content/frontmatter';
import { referencedImages } from '../content/image-refs';
import { titleOf } from '../content/schema-form';
import type { Forge } from './types';

/** Bounds on one scan: how many pages are read, and how large a page may be to be read at all. */
export const MAX_SCAN_PAGES = 300;
export const MAX_PAGE_BYTES = 500_000;
const PARALLEL = 8;

const decoder = new TextDecoder();

export interface ImageUse {
	/** Repository path of the image file. */
	path: string;
	/** The other pages that still refer to it. */
	usedOn: { path: string; title: string }[];
}

export interface UsageScan {
	/** False when a page went unread: then no image may count as unused. */
	complete: boolean;
	/** The images that exist on the ref, each with the other pages that use it. */
	images: ImageUse[];
}

async function each<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
}

/**
 * Which pages of the site, other than `page`, refer to each of `images` on `ref`. Reads every Markdown
 * file under the content folder, also the ones Schrijver does not edit: they are part of the site too.
 */
export async function imageUsage(
	forge: Forge,
	site: SiteConfig,
	schema: Pick<PageSchema, 'titel'>,
	ref: string,
	page: string,
	images: string[],
	limits = { pages: MAX_SCAN_PAGES, bytes: MAX_PAGE_BYTES }
): Promise<UsageScan> {
	const files = new Set((await forge.readTree(site.repo, ref, '')).map((entry) => entry.path));
	const existing = [...new Set(images)].filter((path) => files.has(path));
	if (existing.length === 0) return { complete: true, images: [] };

	const prefix = site.content.pad === '' ? '' : `${site.content.pad}/`;
	const pages = [...files]
		.filter((path) => path.startsWith(prefix) && path.endsWith('.md') && path !== page)
		.sort();
	let complete = pages.length <= limits.pages;
	const usedOn = new Map(existing.map((path) => [path, [] as ImageUse['usedOn']]));
	await each(pages.slice(0, limits.pages), async (path) => {
		const file = await forge.readFile(site.repo, ref, path, { maxBytes: limits.bytes });
		if (!file) return;
		if (file.tooLarge) {
			complete = false;
			return;
		}
		const text = decoder.decode(file.content);
		const refs = referencedImages(text, path);
		const hits = existing.filter((image) => refs.has(image));
		if (hits.length === 0) return;
		const parsed = parsePage(text);
		const title =
			(parsed.ok ? titleOf(schema, parsed.frontmatter, parsed.body).trim() : '') ||
			path.slice(prefix.length);
		for (const image of hits) usedOn.get(image)!.push({ path, title });
	});
	return {
		complete,
		images: existing.map((path) => ({
			path,
			usedOn: usedOn.get(path)!.sort((a, b) => a.path.localeCompare(b.path))
		}))
	};
}
