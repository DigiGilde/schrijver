import type { Forge, RepoInfo } from '$lib/forge/types';
import {
	parseSchemaFile,
	parseSiteFile,
	type PageSchema,
	type Parsed,
	type SiteStructure
} from './types';

export const SITE_FILE = '.schrijver/site.yaml';
export const SCHEMA_FILE = '.schrijver/schema.yaml';
export const GUIDE_FILE = '.schrijver/schrijfwijzer.md';

/** The most Schrijver reads of each file; a larger one is refused without being downloaded. */
export const MAX_BYTES: Record<string, number> = {
	[SITE_FILE]: 64_000,
	[SCHEMA_FILE]: 64_000,
	[GUIDE_FILE]: 32_000
};

/** A file with many problems names the first ones. */
const MAX_ERRORS_PER_FILE = 10;

/** How a site is built: from the three files in `.schrijver/` of its repository. */
export interface Structure {
	site: SiteStructure;
	schema: PageSchema;
	/** The writing guide; empty when the site has none. */
	schrijfwijzer: string;
}

type Text = { ok: true; text: string | null } | { ok: false; errors: string[] };

async function readText(forge: Forge, repo: string, ref: string, path: string): Promise<Text> {
	const max = MAX_BYTES[path];
	const file = await forge.readFile(repo, ref, path, { maxBytes: max, uncached: true });
	if (!file) return { ok: true, text: null };
	if (file.tooLarge) return { ok: false, errors: [`${path}: is groter dan ${max / 1000} kB`] };
	try {
		return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(file.content) };
	} catch {
		return { ok: false, errors: [`${path}: is geen tekst in UTF-8`] };
	}
}

function named<T>(path: string, parsed: Parsed<T>): Parsed<T> {
	if (parsed.ok) return parsed;
	const shown = parsed.errors.slice(0, MAX_ERRORS_PER_FILE);
	const more = parsed.errors.length - shown.length;
	return {
		ok: false,
		errors: [
			...shown.map((error) => `${path}: ${error}`),
			...(more > 0 ? [`${path}: en nog ${more} ${more === 1 ? 'melding' : 'meldingen'}`] : [])
		]
	};
}

function required<T>(path: string, text: Text, parse: (text: string) => Parsed<T>): Parsed<T> {
	if (!text.ok) return text;
	if (text.text === null) return { ok: false, errors: [`${path}: ontbreekt`] };
	return named(path, parse(text.text));
}

/**
 * Reads and checks `.schrijver/` on a branch: every problem of every file, each naming its file and
 * field. Throws when the forge does.
 */
export async function readStructure(
	forge: Forge,
	repo: string,
	ref: string
): Promise<Parsed<Structure>> {
	const [siteText, schemaText, guideText] = await Promise.all(
		[SITE_FILE, SCHEMA_FILE, GUIDE_FILE].map((path) => readText(forge, repo, ref, path))
	);
	const site = required(SITE_FILE, siteText, parseSiteFile);
	const schema = required(SCHEMA_FILE, schemaText, parseSchemaFile);
	const errors = [site, schema, guideText].flatMap((part) => (part.ok ? [] : part.errors));
	if (!site.ok || !schema.ok || !guideText.ok) return { ok: false, errors };
	return {
		ok: true,
		value: { site: site.value, schema: schema.value, schrijfwijzer: guideText.text ?? '' }
	};
}

export type RepositoryCheck =
	| { ok: true; repo: RepoInfo; structure: Structure }
	/** The App is not installed on it, or GitHub knows no repository by that name. */
	| { ok: false; reason: 'not-installed' }
	/** The name leads to a repository with another id than the site's. */
	| { ok: false; reason: 'other-repository'; repo: RepoInfo }
	| { ok: false; reason: 'unreachable'; error: unknown }
	| { ok: false; reason: 'invalid'; repo: RepoInfo; errors: string[] };

/**
 * Looks a repository up as the App sees it and reads its structure from its default branch. With
 * `repoId`, a repository by that name with another id is refused: the site is bound to its id.
 */
export async function checkRepository(
	forge: Forge,
	name: string,
	repoId?: number
): Promise<RepositoryCheck> {
	let repo: RepoInfo | null;
	try {
		repo = await forge.repository(name);
	} catch (error) {
		return { ok: false, reason: 'unreachable', error };
	}
	if (!repo) return { ok: false, reason: 'not-installed' };
	if (repoId !== undefined && repo.id !== repoId) {
		return { ok: false, reason: 'other-repository', repo };
	}
	let structure: Parsed<Structure>;
	try {
		structure = await readStructure(forge, repo.fullName, repo.defaultBranch);
	} catch (error) {
		return { ok: false, reason: 'unreachable', error };
	}
	return structure.ok
		? { ok: true, repo, structure: structure.value }
		: { ok: false, reason: 'invalid', repo, errors: structure.errors };
}
