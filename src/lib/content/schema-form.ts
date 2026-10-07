import picomatch from 'picomatch';
import type { FieldDef, PageSchema } from '../config/types';
import { slugify } from './slug';

export type FormField = { key: string; def: FieldDef; value: unknown; error: string | null };

type Frontmatter = Record<string, unknown>;

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

function fieldError(field: FormField): string | null {
	const { def, value } = field;
	if (isEmpty(value)) return def.verplicht ? 'Dit veld is verplicht' : null;
	if (def.type === 'getal') {
		const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
		if (!Number.isFinite(n)) return 'Moet een getal zijn';
	}
	if (def.type === 'datum') {
		const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
		const valid =
			m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === s;
		if (!valid) return 'Datum als JJJJ-MM-DD';
	}
	if (def.type === 'paginaverwijzing' && def.meervoud && def.max !== undefined) {
		if (Array.isArray(value) && value.length > def.max) return `Maximaal ${def.max} verwijzingen`;
	}
	return null;
}

export function validateForm(fields: FormField[]): { ok: boolean; fields: FormField[] } {
	const result = fields.map((field) => ({ ...field, error: fieldError(field) }));
	return { ok: result.every((f) => f.error === null), fields: result };
}

function outputValue(field: FormField): unknown {
	const { def, value } = field;
	if (isEmpty(value)) return undefined;
	if (def.type === 'getal') return typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
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

export function titleOf(schema: PageSchema, frontmatter: Frontmatter, body: string): string {
	if (schema.titel === 'uit-h1') {
		const match = /^#\s+(.+)$/m.exec(body);
		return match ? match[1].trim() : '';
	}
	const key = schema.titel.slice('veld:'.length);
	return String(frontmatter[key] ?? '');
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
			: template.replaceAll('{datum}', datum).replaceAll('{titel}', slug).replaceAll('{jaar}', year);
	return `${dir}/${name}.md`;
}

function checkFolder(allowed: string[], folder: string): string {
	if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(folder) || !allowed.some((glob) => picomatch(glob, { dot: true })(folder))) {
		throw new Error(`Folder not allowed: ${folder}`);
	}
	return folder;
}
