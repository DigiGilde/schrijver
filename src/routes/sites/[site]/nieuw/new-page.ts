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
