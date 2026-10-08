import type { PageSchema, SiteConfig } from '../config/types';
import { parsePage } from '../content/frontmatter';
import { imageNameTails, imageRefs, mentionsName, resolveImageRefs } from '../content/image-refs';
import { titleOf } from '../content/schema-form';
import type { Forge } from './types';

/** Bounds on one scan: how many files are read, and how large a file may be to be read at all. */
export const MAX_SCAN_PAGES = 300;
export const MAX_PAGE_BYTES = 500_000;
const PARALLEL = 8;
/** Text files under the content folder that can show an image: pages, data beside them, style sheets. */
const TEXT_FILE = /\.(?:md|markdown|mdx|html?|ya?ml|json|toml|css)$/i;
const PAGE_FILE = /\.(?:md|markdown|mdx|html?)$/i;
/** More distinct mentions than this in one file and it counts as using every image. */
const MAX_MENTIONS = 5_000;

const decoder = new TextDecoder();

export interface ImageUse {
	/** Repository path of the image file. */
	path: string;
	/** The other files that still refer to it. */
	usedOn: { path: string; title: string }[];
}

export interface UsageScan {
	/** False when a file went unread or the listing was cut off: then no image may count as unused. */
	complete: boolean;
	/** The images that exist on the ref, each with the other files that use it. */
	images: ImageUse[];
}

/** What one file says about images, apart from where it sits. */
interface Mentions {
	/** Image references as written: they resolve against the path of the file. */
	refs: string[];
	tails: string[];
	all: boolean;
	title: string;
}

function mentionsOf(text: string, schema: Pick<PageSchema, 'titel'>): Mentions {
	const refs = [...new Set(imageRefs(text))];
	const tails = imageNameTails(text);
	const parsed = parsePage(text);
	const title = parsed.ok ? titleOf(schema, parsed.frontmatter, parsed.body).trim() : '';
	if (refs.length > MAX_MENTIONS || tails.length > MAX_MENTIONS)
		return { refs: [], tails: [], all: true, title };
	return { refs, tails, all: false, title };
}

async function each<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
}

/**
 * Which files of the site, other than `page`, refer to each of `images` on `ref`. Reads every text file
 * under the content folder, also the ones Schrijver does not edit: they are part of the site too. A file
 * uses an image when it refers to its path, from the file's folder or from the site root, or names the
 * image's file anywhere: keeping a file by mistake is harmless, deleting one a page shows is not.
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
	const tree = await forge.readTree(site.repo, ref, '');
	const files = new Set(tree.map((entry) => entry.path));
	const existing = [...new Set(images)].filter((path) => files.has(path));
	if (existing.length === 0) return { complete: !tree.truncated, images: [] };

	const prefix = site.content.pad === '' ? '' : `${site.content.pad}/`;
	const texts = [...files]
		.filter((path) => path.startsWith(prefix) && TEXT_FILE.test(path) && path !== page)
		.sort();
	let complete = !tree.truncated && texts.length <= limits.pages;
	const usedOn = new Map(existing.map((path) => [path, [] as ImageUse['usedOn']]));
	await each(texts.slice(0, limits.pages), async (path) => {
		const file = await forge.readFile(site.repo, ref, path, { maxBytes: limits.bytes });
		if (!file) return;
		if (file.tooLarge) {
			complete = false;
			return;
		}
		const mentions = mentionsOf(decoder.decode(file.content), schema);
		const refs = resolveImageRefs(mentions.refs, path, site.content.pad);
		const hits = existing.filter(
			(image) => mentions.all || refs.has(image) || mentionsName(mentions.tails, image)
		);
		if (hits.length === 0) return;
		const title = (PAGE_FILE.test(path) && mentions.title) || path.slice(prefix.length);
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
