import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSchemaYaml, parseSitesYaml } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import { save, type SaveRequest, type SaveResult } from '../../src/lib/forge/save';
import { ForgeError } from '../../src/lib/forge/types';
import type { Identity } from '../../src/lib/forge/trailers';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const schema = (name: string) =>
	parseSchemaYaml(readFileSync(`tests/fixtures/config/schemas/${name}.yaml`, 'utf8'));
const digiSchema = schema('digi-handboek');
const mozaSchema = schema('moza-site');
const identity: Identity = { kind: 'anoniem', pseudoniem: 'abc123def456' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ORIGINAL = '---\ndescription: Oud\n---\n\n# Home\n\nTekst.\n';
const MOZA_FILE = '---\ntitle: Contact\ndescription: Bel ons\n---\n\nTekst.\n';

let forge: FakeForge;
let baseSha: string;

beforeEach(async () => {
	forge = new FakeForge();
	forge.seedRepo(digi.repo, 'main', { 'docs/index.md': ORIGINAL });
	forge.seedRepo(moza.repo, 'main', { 'content/contact.md': MOZA_FILE });
	baseSha = (await forge.readFile(digi.repo, 'main', 'docs/index.md'))!.sha;
});

const req = (over: Partial<SaveRequest> = {}): SaveRequest => ({
	path: 'docs/index.md',
	body: '\n# Home\n\nNieuwe tekst.\n',
	frontmatter: { description: 'Oud' },
	changedKeys: [],
	baseSha,
	branch: null,
	prNumber: null,
	images: [],
	...over
});

function ok(r: SaveResult) {
	if (!r.ok) throw new Error(JSON.stringify(r));
	return r;
}

describe('save', () => {
	it('creates a branch and a draft PR with the trailer on the first save', async () => {
		const r = ok(await save(forge, digi, digiSchema, identity, req()));
		expect(r.branch).toMatch(/^schrijver\/digi-handboek\/docs-[a-z2-7]{4}$/);
		const pr = forge.prs.get(r.prNumber)!;
		expect(pr.draft).toBe(true);
		expect(pr.title).toBe('Home');
		expect(pr.body).toBe('Voorgesteld via Schrijver.\n\nSchrijver-Auteur: abc123def456');
		expect(forge.fileText(digi.repo, r.branch, 'docs/index.md')).toBe(
			'---\ndescription: Oud\n---\n\n# Home\n\nNieuwe tekst.\n'
		);
		expect(forge.fileText(digi.repo, 'main', 'docs/index.md')).toBe(ORIGINAL);
		const [commit] = forge.commitsOf(digi.repo, r.branch);
		expect(commit.message).toBe('Bewerk docs/index.md\n\nSchrijver-Auteur: abc123def456');
	});

	it('commits a second save to the same branch and PR', async () => {
		const first = ok(await save(forge, digi, digiSchema, identity, req()));
		const second = ok(
			await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ body: '\n# Home\n\nWéér nieuw.\n', baseSha: first.sha, branch: first.branch, prNumber: first.prNumber })
			)
		);
		expect(second.branch).toBe(first.branch);
		expect(second.prNumber).toBe(first.prNumber);
		expect(forge.prs.size).toBe(1);
		expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(2);
		expect(forge.fileText(digi.repo, first.branch, 'docs/index.md')).toContain('Wéér nieuw.');
	});

	it('writes changed frontmatter keys', async () => {
		const r = ok(
			await save(forge, digi, digiSchema, identity, req({ frontmatter: { description: 'Nieuw' }, changedKeys: ['description'] }))
		);
		expect(forge.fileText(digi.repo, r.branch, 'docs/index.md')).toContain('description: Nieuw');
	});

	it('conflict-detected-on-changed-blob', async () => {
		const first = ok(await save(forge, digi, digiSchema, identity, req()));
		await forge.commit(digi.repo, first.branch, [{ path: 'docs/index.md', content: 'Elders bewerkt\n' }], 'x');
		const r = await save(
			forge,
			digi,
			digiSchema,
			identity,
			req({ baseSha: first.sha, branch: first.branch, prNumber: first.prNumber })
		);
		expect(r).toMatchObject({ ok: false, conflict: { theirs: 'Elders bewerkt\n' } });
		expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(2);
	});

	it('conflicts on a first save when the default branch moved on', async () => {
		forge.removeFile(digi.repo, 'main', 'docs/index.md');
		await forge.commit(digi.repo, 'main', [{ path: 'docs/index.md', content: 'Nieuwer\n' }], 'x');
		const r = await save(forge, digi, digiSchema, identity, req());
		expect(r).toMatchObject({ ok: false, conflict: { theirs: 'Nieuwer\n' } });
		expect(forge.branches(digi.repo)).toEqual(['main']);
	});

	describe('validation without forge calls', () => {
		const untouched = () => {
			expect(forge.branches(digi.repo)).toEqual(['main']);
			expect(forge.prs.size).toBe(0);
		};

		it('required field', async () => {
			const r = await save(
				forge,
				moza,
				mozaSchema,
				identity,
				req({ path: 'content/contact.md', frontmatter: { title: '', description: 'x' }, changedKeys: ['title'], body: 'Tekst' })
			);
			expect(r).toMatchObject({ ok: false, error: { fields: { title: 'Dit veld is verplicht' } } });
			expect(forge.branches(moza.repo)).toEqual(['main']);
		});

		it('mermaid without accDescr', async () => {
			const r = await save(forge, digi, digiSchema, identity, req({ body: '```mermaid\nflowchart LR\n A-->B\n```\n' }));
			expect(r).toMatchObject({ ok: false, error: { message: 'Elk Mermaid-diagram heeft een beschrijving (accDescr) nodig' } });
			untouched();
		});

		it('image without alt', async () => {
			const r = await save(forge, digi, digiSchema, identity, req({ body: '![](a.png)' }));
			expect(r).toMatchObject({ ok: false, error: { message: 'Elke afbeelding heeft een alt-tekst nodig' } });
			untouched();
		});

		it.each(['docs/../geheim.md', '/docs/index.md', 'docs\\index.md', 'elders/index.md', 'docs/index.txt', 'docs/.md'])(
			'bad path %s',
			async (path) => {
				const r = await save(forge, digi, digiSchema, identity, req({ path }));
				expect(r).toMatchObject({ ok: false, error: { message: 'Ongeldig pad' }, status: 400 });
				untouched();
			}
		);

		it('foreign branch and misplaced image', async () => {
			expect(await save(forge, digi, digiSchema, identity, req({ branch: 'main', prNumber: 1 }))).toMatchObject({ ok: false, status: 400 });
			const r = await save(forge, digi, digiSchema, identity, req({ images: [{ path: 'docs/index.md', base64: 'AA==' }] }));
			expect(r).toMatchObject({ ok: false, status: 400 });
			untouched();
		});
	});

	it('adds images to the same commit', async () => {
		const r = ok(
			await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({
					body: '![Een kat](afbeeldingen/docs/kat.png)\n',
					images: [{ path: 'docs/afbeeldingen/docs/kat.png', base64: PNG.toString('base64') }]
				})
			)
		);
		expect(forge.fileText(digi.repo, r.branch, 'docs/afbeeldingen/docs/kat.png')).toEqual(PNG.toString());
		expect(forge.commitsOf(digi.repo, r.branch)).toHaveLength(1);
	});

	describe('image validation', () => {
		const img = (name: string, bytes: Buffer) => ({
			path: `docs/afbeeldingen/docs/${name}`,
			base64: bytes.toString('base64')
		});
		const untouched = () => expect(forge.branches(digi.repo)).toEqual(['main']);

		it('rejects PNG-named bytes that are not a PNG', async () => {
			const r = await save(forge, digi, digiSchema, identity, req({ images: [img('x.png', Buffer.from('geen png'))] }));
			expect(r).toMatchObject({ ok: false, status: 415 });
			untouched();
		});

		it('sanitises svg before committing', async () => {
			const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect width="1" height="1"/></svg>';
			const r = ok(await save(forge, digi, digiSchema, identity, req({ images: [img('x.svg', Buffer.from(svg))] })));
			const stored = forge.fileText(digi.repo, r.branch, 'docs/afbeeldingen/docs/x.svg')!;
			expect(stored).toContain('<rect');
			expect(stored).not.toMatch(/script|onload/);
		});

		it('rejects svg-named text that is not an svg', async () => {
			const r = await save(forge, digi, digiSchema, identity, req({ images: [img('x.svg', Buffer.from('hallo'))] }));
			expect(r).toMatchObject({ ok: false, status: 415 });
		});
	});

	it('requires a base version for an existing file', async () => {
		const r = await save(forge, digi, digiSchema, identity, req({ baseSha: null }));
		expect(r).toMatchObject({ ok: false, status: 400, error: { message: 'Ontbrekende basisversie' } });
		expect(forge.branches(digi.repo)).toEqual(['main']);
	});

	it('ignores changed keys that are not schema fields', async () => {
		const r = ok(await save(forge, digi, digiSchema, identity, req({ frontmatter: { description: 'Oud', evil: 'x' }, changedKeys: ['evil'] })));
		expect(forge.fileText(digi.repo, r.branch, 'docs/index.md')).not.toContain('evil');
	});

	it('returns a forge error with its detail', async () => {
		forge.failNext('commit', new ForgeError(422, 'Commit mislukt', 'detail van GitHub'));
		const r = await save(forge, digi, digiSchema, identity, req());
		expect(r).toMatchObject({ ok: false, status: 422, error: { message: 'Commit mislukt', detail: 'detail van GitHub' } });
	});

	describe('ownership of an existing branch', () => {
		const other: Identity = { kind: 'anoniem', pseudoniem: 'zzzzzzzzzzzz' };
		const next = (first: Extract<SaveResult, { ok: true }>) =>
			req({ baseSha: first.sha, branch: first.branch, prNumber: first.prNumber, body: 'Anders\n' });

		it('refuses a foreign branch without editorial rights', async () => {
			const first = ok(await save(forge, digi, digiSchema, other, req()));
			const r = await save(forge, digi, digiSchema, identity, next(first));
			expect(r).toMatchObject({ ok: false, status: 403, error: { message: 'Dit voorstel is niet van jou' } });
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(1);
		});

		it('allows a foreign branch for editorial', async () => {
			const first = ok(await save(forge, digi, digiSchema, other, req()));
			ok(await save(forge, digi, digiSchema, identity, next(first), { isEditorial: async () => true }));
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(2);
		});

		it('allows the own branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req()));
			ok(await save(forge, digi, digiSchema, identity, next(first)));
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(2);
		});

		it('refuses a fork PR whose head branch is named like the victim branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, other, req()));
			const real = forge.prs.get(first.prNumber)!;
			const stub = {
				...forge,
				getPr: async () => ({ ...real, headRepo: 'aanvaller/handboek', body: `x\n\n${'Schrijver-Auteur: abc123def456'}` })
			} as unknown as FakeForge;
			Object.setPrototypeOf(stub, forge);
			const r = await save(stub, digi, digiSchema, identity, next(first));
			expect(r).toMatchObject({ ok: false, status: 403 });
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(1);
		});

		it('refuses a PR with another base branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req()));
			forge.prs.get(first.prNumber)!.baseRef = 'andere';
			const r = await save(forge, digi, digiSchema, identity, next(first));
			expect(r).toMatchObject({ ok: false, status: 403 });
		});

		it('refuses a PR whose head differs from the branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req()));
			const r = await save(forge, digi, digiSchema, identity, { ...next(first), branch: 'schrijver/digi-handboek/ander-abcd' });
			expect(r).toMatchObject({ ok: false, status: 409 });
		});
	});

	describe('new page', () => {
		const newReq = (over: Partial<SaveRequest> = {}) =>
			req({
				path: '',
				body: '',
				frontmatter: {},
				baseSha: null,
				newPage: { soort: null, folder: 'kennis', title: 'Mijn Pagina' },
				...over
			});

		it('applies the template and the Nieuw commit message', async () => {
			const r = ok(await save(forge, digi, digiSchema, identity, newReq()));
			expect(r.path).toBe('docs/kennis/mijn-pagina.md');
			expect(forge.fileText(digi.repo, r.branch, 'docs/kennis/mijn-pagina.md')).toBe('# Mijn Pagina\n');
			expect(forge.commitsOf(digi.repo, r.branch)[0].message).toMatch(/^Nieuw: docs\/kennis\/mijn-pagina\.md/);
			expect(forge.prs.get(r.prNumber)!.title).toBe('Mijn Pagina');
		});

		it('refuses when the file already exists', async () => {
			await forge.commit(digi.repo, 'main', [{ path: 'docs/kennis/mijn-pagina.md', content: 'bestaat' }], 'x');
			const again = await save(forge, digi, digiSchema, identity, newReq());
			expect(again).toMatchObject({ ok: false, status: 409 });
			expect(forge.branches(digi.repo)).toEqual(['main']);
		});
	});
});
