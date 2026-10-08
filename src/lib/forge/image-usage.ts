import { posix } from 'node:path';
import picomatch from 'picomatch';
import type { PageSchema, SiteConfig } from '../config/types';
import { parsePage } from '../content/frontmatter';
import {
	imageNameTails,
	imageRefs,
	isImageFile,
	mentionsName,
	resolveImageRefs
} from '../content/image-refs';
import { titleOf } from '../content/schema-form';
import type { FileEntry, FileTree, Forge, PrFile, PrSummary } from './types';

/** Bounds on one scan: how many files are read per branch, and how large a file may be to be read at all. */
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
	/** In the image folder of a page under `content.uitsluiten`, or under it itself: never deleted. */
	excluded: boolean;
}

export interface UsageScan {
	/** False when a file went unread or a listing was cut off: then no image may count as unused. */
	complete: boolean;
	/** The images that exist on the branch, each with the other files that use it. */
	images: ImageUse[];
}

type Limits = { pages: number; bytes: number };
const LIMITS: Limits = { pages: MAX_SCAN_PAGES, bytes: MAX_PAGE_BYTES };

/** What one file says about images, apart from where it sits. */
interface Mentions {
	/** Image references as written: they resolve against the path of the file. */
	refs: string[];
	tails: string[];
	all: boolean;
	title: string;
}

function mentionsOf(text: string, schema: Pick<PageSchema, 'titel'> | null): Mentions {
	const refs = [...new Set(imageRefs(text))];
	const tails = imageNameTails(text);
	const parsed = parsePage(text);
	const title = schema && parsed.ok ? titleOf(schema, parsed.frontmatter, parsed.body).trim() : '';
	if (refs.length > MAX_MENTIONS || tails.length > MAX_MENTIONS)
		return { refs: [], tails: [], all: true, title };
	return { refs, tails, all: false, title };
}

/** The image folder that the site's convention gives a page, as `imagePath` places it. */
function imageFolderOf(convention: string, page: string): string {
	const dir = posix.dirname(page);
	const name = posix.basename(page).replace(/\.[^.]+$/, '');
	const slug = name === 'index' || name === '_index' ? posix.basename(dir) : name;
	return posix.normalize(
		convention.replaceAll('{paginaslug}', slug).replaceAll('{paginamap}', dir)
	);
}

/** Whether an image lies under `content.uitsluiten` or in the image folder of a page there. */
function excludedImages(site: SiteConfig, prefix: string, files: FileEntry[]) {
	const patterns = site.content.uitsluiten ?? [];
	if (patterns.length === 0) return () => false;
	const excluded = picomatch(patterns);
	const convention = site.content.afbeeldingen?.pad.replace(/\/+$/, '');
	const folders = new Set(
		convention
			? files
					.map((file) => file.path)
					.filter((path) => path.startsWith(prefix) && PAGE_FILE.test(path))
					.filter((path) => excluded(path.slice(prefix.length)))
					.map((path) => imageFolderOf(convention, path))
			: []
	);
	return (image: string) =>
		excluded(image.slice(prefix.length)) || folders.has(posix.dirname(image));
}

async function each<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await fn(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
}

interface Scan {
	forge: Forge;
	site: SiteConfig;
	schema: Pick<PageSchema, 'titel'> | null;
	limits: Limits;
	prefix: string;
	images: string[];
	/** Per image, the files that use it, each with its title. */
	uses: Map<string, Map<string, string>>;
	complete: boolean;
}

function startScan(
	forge: Forge,
	site: SiteConfig,
	schema: Pick<PageSchema, 'titel'> | null,
	limits: Limits,
	images: string[]
): Scan {
	const prefix = site.content.pad === '' ? '' : `${site.content.pad}/`;
	const uses = new Map(images.map((image) => [image, new Map<string, string>()]));
	return { forge, site, schema, limits, prefix, images, uses, complete: true };
}

/** The text files under the content folder of a listing, in path order. */
function textFiles(scan: Scan, tree: FileTree): FileEntry[] {
	if (tree.truncated) scan.complete = false;
	return tree
		.filter((file) => file.path.startsWith(scan.prefix) && TEXT_FILE.test(file.path))
		.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Reads `files` on `ref` and notes which images each uses: by its path, from the file's folder or from
 * the site root, and when `generous` also by its file name anywhere in the file.
 */
async function readFiles(scan: Scan, ref: string, files: FileEntry[], generous: boolean) {
	const { forge, site, limits, prefix } = scan;
	if (files.length > limits.pages) scan.complete = false;
	await each(files.slice(0, limits.pages), async ({ path }) => {
		const file = await forge.readFile(site.repo, ref, path, { maxBytes: limits.bytes });
		if (!file) return;
		if (file.tooLarge) {
			scan.complete = false;
			return;
		}
		const mentions = mentionsOf(decoder.decode(file.content), scan.schema);
		const refs = resolveImageRefs(mentions.refs, path, site.content.pad);
		const title = (PAGE_FILE.test(path) && mentions.title) || path.slice(prefix.length);
		for (const image of scan.images) {
			const users = scan.uses.get(image)!;
			if (users.has(path)) continue;
			if (mentions.all || refs.has(image) || (generous && mentionsName(mentions.tails, image)))
				users.set(path, title);
		}
	});
}

function finish(scan: Scan, excluded: (image: string) => boolean): UsageScan {
	return {
		complete: scan.complete,
		images: scan.images.map((path) => ({
			path,
			usedOn: [...scan.uses.get(path)!]
				.map(([file, title]) => ({ path: file, title }))
				.sort((a, b) => a.path.localeCompare(b.path)),
			excluded: excluded(path)
		}))
	};
}

/**
 * Which files of the site, other than `page`, refer to each of `images` that exist on `ref`. Reads every
 * text file under the content folder, also the ones Schrijver does not edit: they are part of the site
 * too. It reads them on `ref` and on the default branch, which a proposal is merged into, so a use that
 * reached either keeps the file. A file uses an image when it refers to its path, from the file's folder
 * or from the site root, or names the image's file anywhere: keeping a file by mistake is harmless,
 * deleting one a page shows is not.
 */
export async function imageUsage(
	forge: Forge,
	site: SiteConfig,
	schema: Pick<PageSchema, 'titel'>,
	ref: string,
	page: string,
	images: string[],
	limits = LIMITS
): Promise<UsageScan> {
	const refs = [...new Set([ref, site.standaardbranch])];
	const trees = await Promise.all(refs.map((r) => forge.readTree(site.repo, r, '')));
	const onRef = new Set(trees[0].map((entry) => entry.path));
	const existing = [...new Set(images)].filter((path) => onRef.has(path));
	if (existing.length === 0) return { complete: !trees[0].truncated, images: [] };

	const scan = startScan(forge, site, schema, limits, existing);
	for (const [i, tree] of trees.entries()) {
		const files = textFiles(scan, tree).filter((file) => file.path !== page);
		await readFiles(scan, refs[i], files, true);
	}
	return finish(scan, excludedImages(site, scan.prefix, trees.flat()));
}

/**
 * For a pull request about to be merged: which files would still use each image it removes. Reads the
 * base branch, except the files the pull request changes: those it reads as the pull request leaves them,
 * by path only, as the page being saved is checked.
 */
export async function usageAfterMerge(
	forge: Forge,
	site: SiteConfig,
	pr: Pick<PrSummary, 'baseRef' | 'headRef'>,
	files: PrFile[],
	limits = LIMITS
): Promise<UsageScan> {
	const gone = files.flatMap((f) => [
		...(f.status === 'removed' ? [f.path] : []),
		...(f.previous ? [f.previous] : [])
	]);
	const removed = gone.filter(isImageFile);
	if (removed.length === 0) return { complete: true, images: [] };
	const base = await forge.readTree(site.repo, pr.baseRef, '');
	const onBase = new Set(base.map((entry) => entry.path));
	const images = removed.filter((path) => onBase.has(path));
	if (images.length === 0) return { complete: !base.truncated, images: [] };

	const scan = startScan(forge, site, null, limits, images);
	const changed = new Set([...files.map((f) => f.path), ...gone]);
	const unchanged = textFiles(scan, base).filter((file) => !changed.has(file.path));
	await readFiles(scan, pr.baseRef, unchanged, true);
	const kept = files.filter(
		(f) => f.status !== 'removed' && f.path.startsWith(scan.prefix) && TEXT_FILE.test(f.path)
	);
	if (kept.length > 0) {
		const head = await forge.readTree(site.repo, pr.headRef, '');
		const own = textFiles(scan, head).filter((file) => changed.has(file.path));
		await readFiles(scan, pr.headRef, own, false);
	}
	return finish(scan, () => false);
}
