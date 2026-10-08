import { randomBytes } from 'node:crypto';
import path from 'node:path';
import picomatch from 'picomatch';
import type { PageSchema, SiteConfig } from '../config/types';
import { parsePage, serializePage } from '../content/frontmatter';
import {
	ALLOWED_IMAGE_TYPES,
	ImageError,
	MAX_IMAGE_BYTES,
	imagePath,
	isSvgDocument,
	sanitizeSvg,
	validateImage
} from '../content/images';
import { MERMAID_DESCR_MESSAGE, missingDescriptions } from '../content/mermaid';
import { slugify } from '../content/slug';
import { buildForm, newPagePath, titleOf, validateForm } from '../content/schema-form';
import { sameRepo } from './repo';
import { ForgeError, type FileChange, type Forge } from './types';
import {
	commitMessage,
	identityFromPrBody,
	identityTrailer,
	isOwnTrailer,
	type Identity
} from './trailers';

export interface NewPage {
	soort: string | null;
	folder: string;
	title: string;
}

export interface SaveRequest {
	path: string;
	body: string;
	frontmatter: Record<string, unknown>;
	changedKeys: string[];
	baseSha: string | null;
	branch: string | null;
	prNumber: number | null;
	images: { path: string; base64: string }[];
	newPage?: NewPage;
	/** Replace an image that already exists on the target branch. */
	overwrite?: boolean;
}

export type SaveResult =
	| { ok: true; branch: string; prNumber: number; sha: string; url: string; path: string }
	| { ok: false; conflict: { mine: string; theirs: string; sha: string } }
	| {
			ok: false;
			error: { message: string; detail?: string; fields?: Record<string, string> };
			status?: number;
	  };

const dec = new TextDecoder();
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

const fail = (
	status: number,
	message: string,
	extra: { detail?: string; fields?: Record<string, string> } = {}
): SaveResult => ({ ok: false, error: { message, ...extra }, status });

function randomSuffix(): string {
	return Array.from(randomBytes(4), (b) => BASE32[b % 32]).join('');
}

// C0 and C1 controls plus the Unicode line and paragraph separators.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const CONTROL_ALL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

export const hasControlCharacters = (text: string) => CONTROL.test(text);

/** A single plain line, safe to place in a commit summary or a pull request title. */
export function singleLine(text: string): string {
	return text
		.replace(CONTROL_ALL, ' ')
		.replace(/`/g, "'")
		.replaceAll('$(', '(')
		.replace(/\s+/g, ' ')
		.trim();
}

function inContentRules(site: SiteConfig, p: string): boolean {
	const relative = p.slice(site.content.pad.length + 1);
	if (!picomatch(site.content.patroon)(relative)) return false;
	const excluded = site.content.uitsluiten ?? [];
	return excluded.length === 0 || !picomatch(excluded)(relative);
}

function validPagePath(site: SiteConfig, p: string): boolean {
	return !(
		typeof p !== 'string' ||
		hasControlCharacters(p) ||
		p.startsWith('/') ||
		p.includes('\\') ||
		p.split('/').some((part) => part === '..' || part === '') ||
		!p.startsWith(`${site.content.pad}/`) ||
		!p.endsWith('.md') ||
		path.posix.basename(p) === '.md' ||
		!inContentRules(site, p)
	);
}

const INVALID_PATH = 'Ongeldig pad';

function templateFor(schema: PageSchema, soort: string | null): string | undefined {
	const config = schema['nieuwe-pagina'];
	if ('soorten' in config) return config.soorten.find((s) => s.naam === soort)?.sjabloon;
	return config.sjabloon;
}

/** Same matches as /!\[([^\]]*)\]\(/g, in linear time: the regex backtracks quadratically on "![![![...". */
export function hasImageWithoutAlt(body: string): boolean {
	let close = -1;
	let i = body.indexOf('![');
	while (i !== -1) {
		if (close < i + 2) close = body.indexOf(']', i + 2);
		if (close === -1) return false;
		if (body[close + 1] === '(') {
			if (body.slice(i + 2, close).trim() === '') return true;
			i = body.indexOf('![', close + 2);
		} else {
			i = body.indexOf('![', i + 1);
		}
	}
	return false;
}

function branchSlug(filePath: string): string {
	const base = path.posix.basename(filePath, '.md');
	const stem =
		base === 'index' || base === '_index'
			? path.posix.basename(path.posix.dirname(filePath))
			: base;
	return slugify(stem) || 'pagina';
}

function forgeFailure(e: unknown): SaveResult {
	if (e instanceof ForgeError) return fail(e.status, e.message, { detail: e.detail });
	throw e;
}

export async function save(
	forge: Forge,
	site: SiteConfig,
	schema: PageSchema,
	identity: Identity,
	req: SaveRequest,
	opts: { isEditorial?: () => Promise<boolean>; identities?: Identity[] } = {}
): Promise<SaveResult> {
	let filePath = req.path;
	let template: string | undefined;
	const isNew = !!req.newPage;
	if (req.newPage) {
		try {
			const relative = newPagePath(
				schema,
				req.newPage.soort,
				req.newPage.folder,
				req.newPage.title,
				new Date()
			);
			filePath = `${site.content.pad}/${relative}`;
		} catch {
			return fail(400, 'Deze soort of map is niet toegestaan voor een nieuwe pagina');
		}
		template = templateFor(schema, req.newPage.soort)?.replaceAll('{titel}', req.newPage.title);
		if (template === undefined && schema.titel === 'uit-h1')
			template = `# ${req.newPage.title}\n\n`;
	}
	if (!validPagePath(site, filePath)) return fail(400, INVALID_PATH);

	const form = validateForm(buildForm(schema, req.frontmatter, filePath));
	if (!form.ok) {
		const fields = Object.fromEntries(
			form.fields.filter((f) => f.error).map((f) => [f.key, f.error as string])
		);
		return fail(400, 'Controleer de gemarkeerde velden', { fields });
	}
	if (missingDescriptions(req.body).length > 0) return fail(400, MERMAID_DESCR_MESSAGE);
	if (hasImageWithoutAlt(req.body)) return fail(400, 'Elke afbeelding heeft een alt-tekst nodig');

	const imageChanges: FileChange[] = [];
	for (const image of req.images) {
		try {
			const expected = imagePath(site, filePath, path.posix.basename(image.path)).repoPath;
			if (expected !== image.path) return fail(400, 'Ongeldig pad voor afbeelding');
		} catch (e) {
			if (e instanceof ImageError) return fail(400, e.message);
			throw e;
		}
		let bytes = new Uint8Array(Buffer.from(image.base64, 'base64'));
		if (bytes.length > MAX_IMAGE_BYTES) return fail(413, 'Afbeelding is groter dan 5 MB');
		const ext = path.posix.extname(image.path).slice(1).toLowerCase();
		const mime = Object.entries(ALLOWED_IMAGE_TYPES).find(
			([, e]) => e === (ext === 'jpeg' ? 'jpg' : ext)
		)?.[0];
		const checked = validateImage(bytes, mime ?? '');
		if (!checked.ok) return fail(checked.status, checked.message);
		if (checked.mime === 'image/svg+xml') {
			const clean = sanitizeSvg(dec.decode(bytes));
			if (!isSvgDocument(clean))
				return fail(415, 'Dit bestandstype wordt niet ondersteund (png, jpg, webp, svg)');
			bytes = new TextEncoder().encode(clean);
		}
		if (hasControlCharacters(image.path)) return fail(400, 'Ongeldig pad voor afbeelding');
		imageChanges.push({ path: image.path, content: bytes });
	}

	if (!isNew && req.baseSha === null) return fail(400, 'Ontbrekende basisversie');

	const prefix = `schrijver/${site.id}/`;
	if (req.branch !== null && !req.branch.startsWith(prefix)) return fail(400, 'Ongeldige branch');
	if (req.branch !== null && req.prNumber === null) return fail(400, 'Pull request ontbreekt');

	try {
		let existingPr: Awaited<ReturnType<Forge['getPr']>> | null = null;
		if (req.branch !== null) {
			existingPr = await forge.getPr(site.repo, req.prNumber as number);
			const own = isOwnTrailer(identityFromPrBody(existingPr.body), opts.identities ?? [identity]);
			if (
				!sameRepo(existingPr.headRepo, site.repo) ||
				existingPr.baseRef !== site.standaardbranch
			) {
				return fail(403, 'Dit voorstel is niet van jou');
			}
			if (existingPr.state !== 'open' || existingPr.headRef !== req.branch) {
				return fail(409, 'Dit voorstel is niet meer open');
			}
			if (!own && !(await opts.isEditorial?.())) return fail(403, 'Dit voorstel is niet van jou');
		}
		const ref = req.branch ?? site.standaardbranch;
		if (!req.overwrite) {
			for (const image of imageChanges) {
				if (!(await forge.readFile(site.repo, ref, image.path))) continue;
				// An image this proposal added itself may be replaced.
				const onBase =
					req.branch !== null &&
					(await forge.readFile(site.repo, site.standaardbranch, image.path));
				if (req.branch === null || onBase)
					return fail(409, 'Afbeelding bestaat al', { detail: image.path });
			}
		}
		const current = await forge.readFile(site.repo, ref, filePath);
		if (isNew && req.branch === null && current) return fail(409, 'Deze pagina bestaat al');
		if (!isNew && !current) return fail(404, 'Pagina niet gevonden');

		const currentText = current ? dec.decode(current.content) : (template ?? '');
		const page = parsePage(currentText);
		if (!page.ok)
			return fail(400, 'Deze pagina kan niet in Schrijver worden bewerkt', {
				detail: page.message
			});
		if (page.rawFrontmatter === null && /^\uFEFF?(---|\+\+\+)\r?(\n|$)/.test(req.body)) {
			return fail(400, 'De tekst mag niet met een gegevensblok (---) beginnen');
		}

		const known = new Set(buildForm(schema, req.frontmatter, filePath).map((f) => f.key));
		const changedKeys = (
			isNew ? [...new Set([...req.changedKeys, ...Object.keys(req.frontmatter)])] : req.changedKeys
		).filter((k) => known.has(k));
		const body = isNew && req.body.trim() === '' ? page.body : req.body;
		const text = serializePage({ ...page, frontmatter: req.frontmatter, body }, changedKeys);

		// Known limitation: a change on the default branch after the first save is not detected here;
		// the send-in mergeability check (mergeable === false) warns about it instead.
		if (current && req.baseSha !== null && current.sha !== req.baseSha && currentText !== text) {
			return { ok: false, conflict: { mine: text, theirs: currentText, sha: current.sha } };
		}

		const branch = req.branch ?? `${prefix}${branchSlug(filePath)}-${randomSuffix()}`;
		if (req.branch === null) await forge.createBranch(site.repo, site.standaardbranch, branch);

		const summary = `${isNew ? 'Nieuw:' : 'Bewerk'} ${singleLine(filePath)}`;
		await forge.commit(
			site.repo,
			branch,
			[{ path: filePath, content: text }, ...imageChanges],
			commitMessage(summary, identity)
		);
		const saved = await forge.readFile(site.repo, branch, filePath);
		const sha = saved?.sha ?? '';

		if (req.branch === null) {
			const title =
				singleLine(titleOf(schema, req.frontmatter, body)).slice(0, 200) ||
				path.posix.basename(filePath, '.md');
			const pr = await forge.openDraftPr(
				site.repo,
				branch,
				site.standaardbranch,
				title,
				`Voorgesteld via Schrijver.\n\n${identityTrailer(identity)}`
			);
			return { ok: true, branch, prNumber: pr.number, sha, url: pr.url, path: filePath };
		}
		const pr = existingPr!;
		return { ok: true, branch, prNumber: pr.number, sha, url: pr.url, path: filePath };
	} catch (e) {
		return forgeFailure(e);
	}
}
