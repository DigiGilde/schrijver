import type { PageSchema } from '$lib/config/types';
import { newPagePath } from '$lib/content/schema-form';
import { slugify } from '$lib/content/slug';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** The local date as newPagePath reads it, so the browser can show the server's day. */
export function isoDate(now: Date): string {
	return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

function dateOf(iso: string): Date {
	const [year, month, day] = iso.split('-').map(Number);
	return new Date(year, month - 1, day);
}

/**
 * The file a new page will get, named by the same function the server uses. Null while the name
 * still waits for a title; throws for a kind and folder the schema does not allow.
 */
export function filePreview(
	schema: PageSchema,
	soort: string | null,
	folder: string,
	title: string,
	today: string
): string | null {
	const now = dateOf(today);
	if (slugify(title)) return newPagePath(schema, soort, folder, title, now);
	const one = newPagePath(schema, soort, folder, 'a', now);
	return one === newPagePath(schema, soort, folder, 'b', now) ? one : null;
}

/** The template the editor starts a new page with; keep in step with the editor's loader. */
export function templateFor(schema: PageSchema, soort: string | null): string {
	const config = schema['nieuwe-pagina'];
	const own =
		'soorten' in config ? config.soorten.find((s) => s.naam === soort)?.sjabloon : config.sjabloon;
	return own ?? (schema.titel === 'uit-h1' ? '# {titel}\n\n' : '');
}

/** The starting text of a new page: its template with the title, then the outline. */
export function startText(template: string, title: string, outline: string): string {
	const head = template.replaceAll('{titel}', title).trimEnd();
	const body = outline.trim();
	return head ? `${head}\n\n${body}\n` : `${body}\n`;
}

/** The properties a new page starts with, as the editor fills them in. */
export function startFrontmatter(schema: PageSchema, title: string): Record<string, unknown> {
	return schema.titel.startsWith('veld:') ? { [schema.titel.slice('veld:'.length)]: title } : {};
}

/** Where the editor keeps the unsaved draft of a page that is not on a proposal branch yet. */
export function draftKey(siteId: string, path: string): string {
	return `schrijver:${siteId}:new:${path}`;
}
