import type { SiteConfig } from '$lib/config/types';

const IMAGE = /\.(?:png|jpe?g|gif|webp|avif|svg)$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export const isImageFile = (path: string) => IMAGE.test(path);

/** Runs of text that may hold a path: split at white space, brackets, quotes and Markdown emphasis. */
const TOKEN = /[^\s"'<>()[\]{}|`=,;*]+/g;
/** Between angle brackets or quotes a path may hold spaces: `<mijn plaatje.png>`, `src="mijn plaatje.png"`. */
const DELIMITED = [/<([^<>\n]+)>/g, /"([^"\n]+)"/g, /'([^'\n]+)'/g];

function normalise(parts: string[]): string[] | null {
	const out: string[] = [];
	for (const part of parts) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (out.length === 0) return null;
			out.pop();
		} else out.push(part);
	}
	return out;
}

/**
 * The repository path an image reference on `page` points at: relative to the page's folder, without
 * query or fragment. Null for a URL, a site-root path, an anchor, or a path that leaves the repository.
 */
export function resolveImageRef(page: string, src: string): string | null {
	if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/') || src.startsWith('#')) return null;
	let relative = src.replace(/[?#].*$/, '');
	try {
		relative = decodeURIComponent(relative);
	} catch {
		return null;
	}
	const parts = normalise([...page.split('/').slice(0, -1), ...relative.split('/')]);
	return parts && parts.length > 0 ? parts.join('/') : null;
}

/**
 * The repository path a site-root reference points at, for a site that publishes its content folder at
 * the root as Hugo and MkDocs do: `/a/images/x.png` is `content/a/images/x.png`. Null for anything else.
 */
export function resolveSiteRootRef(contentFolder: string, src: string): string | null {
	if (!src.startsWith('/') || src.startsWith('//')) return null;
	return resolveImageRef(`${contentFolder}/`, src.slice(1));
}

/**
 * Every string in a text that may refer to an image file: Markdown, HTML, shortcodes, frontmatter, links.
 * Generous on purpose, since a use that is missed would offer to delete a file a page still shows.
 */
export function imageRefs(text: string): string[] {
	const found: string[] = [];
	// Index scans, not regular expressions: a pattern anchored at the end backtracks quadratically on "....".
	const take = (raw: string) => {
		let ref = raw.trim().replace(/\\([!-/:-@[-`{-~])/g, '$1');
		const query = ref.search(/[?#]/);
		if (query !== -1) ref = ref.slice(0, query);
		let end = ref.length;
		while (end > 0 && '.:!?_~'.includes(ref[end - 1])) end--;
		ref = ref.slice(0, end);
		if (IMAGE.test(ref)) found.push(ref);
	};
	for (const match of text.matchAll(TOKEN)) take(match[0]);
	for (const pattern of DELIMITED) for (const match of text.matchAll(pattern)) take(match[1]);
	return found;
}

/** Repository paths that `refs` on `page` point at; with `contentFolder`, a site-root path counts too. */
export function resolveImageRefs(
	refs: Iterable<string>,
	page: string,
	contentFolder?: string
): Set<string> {
	const paths = new Set<string>();
	for (const ref of refs) {
		const path =
			resolveImageRef(page, ref) ??
			(contentFolder === undefined ? null : resolveSiteRootRef(contentFolder, ref));
		if (path) paths.add(path);
	}
	return paths;
}

/** Repository paths of the images a text on `page` refers to; with `contentFolder`, by site root too. */
export function referencedImages(text: string, page: string, contentFolder?: string): Set<string> {
	return resolveImageRefs(imageRefs(text), page, contentFolder);
}

/** Names compare on their last characters only, which keeps what is remembered of a file small. */
const NAME_TAIL = 64;
const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|avif|svg)/gi;

/**
 * The end of every run of text up to an image extension, in lower case and percent-decoded too: enough
 * to tell whether a file name appears anywhere in the text, whatever stands around it.
 */
export function imageNameTails(text: string): string[] {
	const plain = text.replace(/\\([!-/:-@[-`{-~])/g, '$1');
	const tails = new Set<string>();
	for (const match of plain.matchAll(IMAGE_EXTENSION)) {
		const end = match.index + match[0].length;
		let start = end;
		while (start > 0 && end - start < NAME_TAIL && !'/\\\n\r'.includes(plain[start - 1])) start--;
		const tail = plain.slice(start, end).toLowerCase();
		if (tails.has(tail)) continue;
		tails.add(tail);
		if (!tail.includes('%')) continue;
		try {
			tails.add(decodeURIComponent(tail));
		} catch {
			// a tail cut through an escape
		}
	}
	return [...tails];
}

/** Whether the file name of `image` appears in a text with these tails. */
export function mentionsName(tails: string[], image: string): boolean {
	const name = image
		.slice(image.lastIndexOf('/') + 1)
		.toLowerCase()
		.slice(-NAME_TAIL);
	return tails.some((tail) => tail.endsWith(name));
}

/** The images `before` refers to and `after` no longer does, both texts on `page`. */
export function removedImages(before: string, after: string, page: string): string[] {
	const still = referencedImages(after, page);
	return [...referencedImages(before, page)].filter((path) => !still.has(path));
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The part of a site's configuration that places its images. */
export type ImageConvention = { content: Pick<SiteConfig['content'], 'pad' | 'afbeeldingen'> };

/**
 * Whether `path` is an image directly in an image folder that the site's convention gives some page.
 * Only a normalised path qualifies: no `.` or `..` parts, no percent-escapes, no leading slash.
 */
export function inImageFolder(site: ImageConvention, path: string): boolean {
	const convention = site.content.afbeeldingen?.pad.replace(/\/+$/, '');
	if (
		!convention ||
		!IMAGE.test(path) ||
		path.length > 500 ||
		CONTROL.test(path) ||
		path.includes('\\') ||
		path.includes('%') ||
		path.split('/').some((part) => part === '' || part === '.' || part === '..')
	)
		return false;
	const folder = convention
		.split(/(\{paginaslug\}|\{paginamap\})/)
		.map((part) =>
			part === '{paginaslug}'
				? '[^/]+'
				: part === '{paginamap}'
					? `${escape(site.content.pad)}(?:/[^/]+)*`
					: escape(part)
		)
		.join('');
	return new RegExp(`^${folder}/[^/]+$`).test(path);
}
