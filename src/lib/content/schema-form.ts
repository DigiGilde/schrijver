import picomatch from 'picomatch';
import type { FieldDef, PageSchema } from '../config/types';
import { slugify } from './slug';

export type FormField = { key: string; def: FieldDef; value: unknown; error: string | null };

type Frontmatter = Record<string, unknown>;

const DEFAULT_LABELS: Record<string, string> = {
	title: 'Titel',
	description: 'Beschrijving',
	summary: 'Samenvatting',
	date: 'Datum',
	weight: 'Volgorde',
	tags: 'Tags',
	categories: 'Categorieën',
	draft: 'Niet publiceren',
	aliases: 'Andere adressen',
	slug: 'Adres',
	image: 'Afbeelding',
	author: 'Auteur'
};

/** The label a writer sees for a field: the schema's own, a Dutch default, or the key itself. */
export function fieldLabel(field: Pick<FormField, 'key' | 'def'>): string {
	const { key, def } = field;
	if (def.label) return def.label;
	if (Object.hasOwn(DEFAULT_LABELS, key)) return DEFAULT_LABELS[key];
	return key.charAt(0).toUpperCase() + key.slice(1);
}

function matchesPath(globs: string[], path: string): boolean {
	const parts = path.split('/');
	const candidates = parts.map((_, i) => parts.slice(i).join('/'));
	return globs.some((glob) => {
		const isMatch = picomatch(glob, { dot: true });
		return candidates.some((candidate) => isMatch(candidate));
	});
}

function initialValue(def: FieldDef, raw: unknown): unknown {
	if (def.type === 'ja-nee') return typeof raw === 'boolean' ? raw : null;
	if (def.type === 'paginaverwijzing' && def.meervoud) return Array.isArray(raw) ? raw : [];
	if (raw === undefined || raw === null) return '';
	return raw;
}

export function buildForm(schema: PageSchema, frontmatter: Frontmatter, path: string): FormField[] {
	const fields: FormField[] = [];
	for (const [key, def] of Object.entries(schema.velden)) {
		if (def.verborgen) continue;
		if (def['alleen-in'] && !matchesPath(def['alleen-in'], path)) continue;
		fields.push({ key, def, value: initialValue(def, frontmatter[key]), error: null });
	}
	return fields;
}

function isEmpty(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

/* A message names its field: the list of a failed save shows it without the form around it. */
function fieldError(field: FormField): string | null {
	const { def, value } = field;
	const label = fieldLabel(field);
	if (isEmpty(value)) return def.verplicht ? `${label} is verplicht` : null;
	if (def.type === 'getal') {
		const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
		if (!Number.isFinite(n)) return `${label} moet een getal zijn`;
	}
	if (def.type === 'datum') {
		const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
		const valid = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === s;
		if (!valid) return `${label} moet de vorm JJJJ-MM-DD hebben`;
	}
	if (def.type === 'paginaverwijzing' && def.meervoud && def.max !== undefined) {
		if (Array.isArray(value) && value.length > def.max)
			return `${label} mag maximaal ${def.max} verwijzingen bevatten`;
	}
	return null;
}

export function validateForm(fields: FormField[]): { ok: boolean; fields: FormField[] } {
	const result = fields.map((field) => ({ ...field, error: fieldError(field) }));
	return { ok: result.every((f) => f.error === null), fields: result };
}

/** How many required fields are still empty. */
export function emptyRequired(fields: FormField[]): number {
	return fields.filter((field) => field.def.verplicht && isEmpty(field.value)).length;
}

function outputValue(field: FormField): unknown {
	const { def, value } = field;
	if (isEmpty(value)) return undefined;
	if (def.type === 'getal')
		return typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
	if (def.type === 'ja-nee') return value === true || value === 'true';
	if (def.type === 'datum' && value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === 'string') return value.trim();
	return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
	}
	return a === b;
}

export function applyForm(
	fields: FormField[],
	frontmatter: Frontmatter
): { frontmatter: Frontmatter; changedKeys: string[] } {
	const next: Frontmatter = { ...frontmatter };
	const changedKeys: string[] = [];
	for (const field of fields) {
		const value = outputValue(field);
		if (value === undefined) {
			if (field.key in next) delete next[field.key];
		} else {
			next[field.key] = value;
		}
		if (!deepEqual(frontmatter[field.key], value)) changedKeys.push(field.key);
	}
	return { frontmatter: next, changedKeys };
}

export function titleOf(
	schema: Pick<PageSchema, 'titel'>,
	frontmatter: Frontmatter,
	body: string
): string {
	if (schema.titel === 'uit-h1') {
		const match = /^#\s+(.+)$/m.exec(body);
		return match ? match[1].trim() : '';
	}
	const key = schema.titel.slice('veld:'.length);
	return String(frontmatter[key] ?? '');
}

/** The title to show for a page: its own title, or its file name when it has none. */
export function pageTitle(
	schema: Pick<PageSchema, 'titel'>,
	frontmatter: Frontmatter,
	body: string,
	path: string
): string {
	return titleOf(schema, frontmatter, body).trim() || path.slice(path.lastIndexOf('/') + 1);
}

function pad(n: number, width: number): string {
	return String(n).padStart(width, '0');
}

export function newPagePath(
	schema: PageSchema,
	soort: string | null,
	folder: string,
	title: string,
	now: Date
): string {
	const year = pad(now.getFullYear(), 4);
	const datum = `${year}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
	const config = schema['nieuwe-pagina'];

	let dir: string;
	let template: string | undefined;
	if ('soorten' in config) {
		const found = config.soorten.find((s) => s.naam === soort);
		if (!found) throw new Error(`Unknown soort: ${soort}`);
		template = found.bestandsnaam;
		if (found.map !== undefined) {
			dir = found.map.replaceAll('{jaar}', year);
		} else {
			dir = checkFolder(found.mappen ?? [], folder);
		}
	} else {
		template = config.bestandsnaam;
		dir = checkFolder(config.mappen, folder);
	}

	const slug = slugify(title);
	const name =
		!template || template === 'uit-titel'
			? slug
			: template
					.replaceAll('{datum}', datum)
					.replaceAll('{titel}', slug)
					.replaceAll('{jaar}', year);
	return `${dir}/${name}.md`;
}

function checkFolder(allowed: string[], folder: string): string {
	if (
		/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(folder) ||
		!allowed.some((glob) => picomatch(glob, { dot: true })(folder))
	) {
		throw new Error(`Folder not allowed: ${folder}`);
	}
	return folder;
}

/** The text field a "Samenvatting" suggestion is written into, or null when the page has none. */
export function summaryField(fields: FormField[]): string | null {
	return fields.find((f) => f.key === 'description' && f.def.type === 'tekst')?.key ?? null;
}

export function withValue(fields: FormField[], key: string, value: unknown): FormField[] {
	return fields.map((f) => (f.key === key ? { ...f, value, error: null } : f));
}
