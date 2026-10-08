import type { SiteConfig } from '$lib/config/types';

const IMAGE = /\.(?:png|jpe?g|gif|webp|avif|svg)$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

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
 * Every string in a text that may refer to an image file: Markdown, HTML, shortcodes, frontmatter, links.
 * Generous on purpose, since a use that is missed would offer to delete a file a page still shows.
 */
function imageRefs(text: string): string[] {
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

/** Repository paths of the images a text on `page` refers to. */
export function referencedImages(text: string, page: string): Set<string> {
	const paths = new Set<string>();
	for (const ref of imageRefs(text)) {
		const path = resolveImageRef(page, ref);
		if (path) paths.add(path);
	}
	return paths;
}

/** The images `before` refers to and `after` no longer does, both texts on `page`. */
export function removedImages(before: string, after: string, page: string): string[] {
	const still = referencedImages(after, page);
	return [...referencedImages(before, page)].filter((path) => !still.has(path));
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether `path` is an image directly in an image folder that the site's convention gives some page. */
export function inImageFolder(site: SiteConfig, path: string): boolean {
	const convention = site.content.afbeeldingen?.pad.replace(/\/+$/, '');
	if (
		!convention ||
		!IMAGE.test(path) ||
		path.length > 500 ||
		CONTROL.test(path) ||
		path.includes('\\') ||
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
