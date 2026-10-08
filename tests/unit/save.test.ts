import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSchemaYaml, parseSitesYaml } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import {
	hasImageWithoutAlt,
	save,
	singleLine,
	type SaveRequest,
	type SaveResult
} from '../../src/lib/forge/save';
import { ForgeError } from '../../src/lib/forge/types';
import type { Identity } from '../../src/lib/forge/trailers';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const schema = (name: string) =>
	parseSchemaYaml(readFileSync(`tests/fixtures/config/schemas/${name}.yaml`, 'utf8'));
const digiSchema = schema('digi-handboek');
const mozaSchema = schema('moza-site');
const identity: Identity = { kind: 'anoniem', pseudoniem: 'abc123def456' };
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);
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
				req({
					body: '\n# Home\n\nWéér nieuw.\n',
					baseSha: first.sha,
					branch: first.branch,
					prNumber: first.prNumber
				})
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
			await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ frontmatter: { description: 'Nieuw' }, changedKeys: ['description'] })
			)
		);
		expect(forge.fileText(digi.repo, r.branch, 'docs/index.md')).toContain('description: Nieuw');
	});

	it('conflict-detected-on-changed-blob', async () => {
		const first = ok(await save(forge, digi, digiSchema, identity, req()));
		await forge.commit(
			digi.repo,
			first.branch,
			[{ path: 'docs/index.md', content: 'Elders bewerkt\n' }],
			'x'
		);
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
				req({
					path: 'content/contact.md',
					frontmatter: { title: '', description: 'x' },
					changedKeys: ['title'],
					body: 'Tekst'
				})
			);
			expect(r).toMatchObject({
				ok: false,
				error: {
					message: 'Vul de gemarkeerde velden in bij Eigenschappen',
					fields: { title: 'Titel is verplicht' }
				}
			});
			expect(forge.branches(moza.repo)).toEqual(['main']);
		});

		it('mermaid without accDescr', async () => {
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ body: '```mermaid\nflowchart LR\n A-->B\n```\n' })
			);
			expect(r).toMatchObject({
				ok: false,
				error: { message: 'Elk Mermaid-diagram heeft een beschrijving (accDescr) nodig' }
			});
			untouched();
		});

		it('image without alt', async () => {
			const r = await save(forge, digi, digiSchema, identity, req({ body: '![](a.png)' }));
			expect(r).toMatchObject({
				ok: false,
				error: { message: 'Elke afbeelding heeft een alt-tekst nodig' }
			});
			untouched();
		});

		it.each([
			'docs/../geheim.md',
			'/docs/index.md',
			'docs\\index.md',
			'elders/index.md',
			'docs/index.txt',
			'docs/.md'
		])('bad path %s', async (path) => {
			const r = await save(forge, digi, digiSchema, identity, req({ path }));
			expect(r).toMatchObject({ ok: false, error: { message: 'Ongeldig pad' }, status: 400 });
			untouched();
		});

		it('foreign branch and misplaced image', async () => {
			expect(
				await save(forge, digi, digiSchema, identity, req({ branch: 'main', prNumber: 1 }))
			).toMatchObject({ ok: false, status: 400 });
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ images: [{ path: 'docs/index.md', base64: 'AA==' }] })
			);
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
		expect(forge.fileText(digi.repo, r.branch, 'docs/afbeeldingen/docs/kat.png')).toEqual(
			PNG.toString()
		);
		expect(forge.commitsOf(digi.repo, r.branch)).toHaveLength(1);
	});

	describe('image validation', () => {
		const img = (name: string, bytes: Buffer) => ({
			path: `docs/afbeeldingen/docs/${name}`,
			base64: bytes.toString('base64')
		});
		const untouched = () => expect(forge.branches(digi.repo)).toEqual(['main']);

		it('rejects PNG-named bytes that are not a PNG', async () => {
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ images: [img('x.png', Buffer.from('geen png'))] })
			);
			expect(r).toMatchObject({ ok: false, status: 415 });
			untouched();
		});

		it('sanitises svg before committing', async () => {
			const svg =
				'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect width="1" height="1"/></svg>';
			const r = ok(
				await save(
					forge,
					digi,
					digiSchema,
					identity,
					req({ images: [img('x.svg', Buffer.from(svg))] })
				)
			);
			const stored = forge.fileText(digi.repo, r.branch, 'docs/afbeeldingen/docs/x.svg')!;
			expect(stored).toContain('<rect');
			expect(stored).not.toMatch(/script|onload/);
		});

		it('rejects svg-named text that is not an svg', async () => {
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ images: [img('x.svg', Buffer.from('hallo'))] })
			);
			expect(r).toMatchObject({ ok: false, status: 415 });
		});
	});

	it('requires a base version for an existing file', async () => {
		const r = await save(forge, digi, digiSchema, identity, req({ baseSha: null }));
		expect(r).toMatchObject({
			ok: false,
			status: 400,
			error: { message: 'Ontbrekende basisversie' }
		});
		expect(forge.branches(digi.repo)).toEqual(['main']);
	});

	it('ignores changed keys that are not schema fields', async () => {
		const r = ok(
			await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ frontmatter: { description: 'Oud', evil: 'x' }, changedKeys: ['evil'] })
			)
		);
		expect(forge.fileText(digi.repo, r.branch, 'docs/index.md')).not.toContain('evil');
	});

	it('returns a forge error with its detail', async () => {
		forge.failNext('commit', new ForgeError(422, 'Commit mislukt', 'detail van GitHub'));
		const r = await save(forge, digi, digiSchema, identity, req());
		expect(r).toMatchObject({
			ok: false,
			status: 422,
			error: { message: 'Commit mislukt', detail: 'detail van GitHub' }
		});
	});

	describe('ownership of an existing branch', () => {
		const other: Identity = { kind: 'anoniem', pseudoniem: 'zzzzzzzzzzzz' };
		const next = (first: Extract<SaveResult, { ok: true }>) =>
			req({ baseSha: first.sha, branch: first.branch, prNumber: first.prNumber, body: 'Anders\n' });

		it('refuses a foreign branch without editorial rights', async () => {
			const first = ok(await save(forge, digi, digiSchema, other, req()));
			const r = await save(forge, digi, digiSchema, identity, next(first));
			expect(r).toMatchObject({
				ok: false,
				status: 403,
				error: { message: 'Dit voorstel is niet van jou' }
			});
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(1);
		});

		it('allows a foreign branch for editorial', async () => {
			const first = ok(await save(forge, digi, digiSchema, other, req()));
			ok(
				await save(forge, digi, digiSchema, identity, next(first), {
					isEditorial: async () => true
				})
			);
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(2);
		});

		it('allows the own branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req()));
			ok(await save(forge, digi, digiSchema, identity, next(first)));
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(2);
		});

		it('keeps a linked author the owner after the trailer format changed', async () => {
			const old: Identity = { kind: 'gekoppeld', name: 'Jan Jansen', githubId: 42, login: 'jan' };
			const now: Identity = { kind: 'gekoppeld', name: 'jan', githubId: 42, login: 'jan' };
			const first = ok(await save(forge, digi, digiSchema, old, req()));
			const again = await save(forge, digi, digiSchema, now, next(first), {
				identities: [{ kind: 'anoniem', pseudoniem: 'zzz' }, now]
			});
			expect(again.ok).toBe(true);
			const stranger = await save(forge, digi, digiSchema, identity, next(first), {
				identities: [identity]
			});
			expect(stranger).toMatchObject({ ok: false, status: 403 });
		});

		it('refuses a fork PR whose head branch is named like the victim branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, other, req()));
			const real = forge.prs.get(first.prNumber)!;
			const stub = {
				...forge,
				getPr: async () => ({
					...real,
					headRepo: 'aanvaller/handboek',
					body: `x\n\n${'Schrijver-Auteur: abc123def456'}`
				})
			} as unknown as FakeForge;
			Object.setPrototypeOf(stub, forge);
			const r = await save(stub, digi, digiSchema, identity, next(first));
			expect(r).toMatchObject({ ok: false, status: 403 });
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(1);
		});

		it('accepts the own PR when GitHub casing differs from the config', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req()));
			const real = forge.prs.get(first.prNumber)!;
			const stub = {
				...forge,
				getPr: async () => ({ ...real, headRepo: digi.repo.toUpperCase() })
			} as unknown as FakeForge;
			Object.setPrototypeOf(stub, forge);
			ok(await save(stub, digi, digiSchema, identity, next(first)));
			expect(forge.commitsOf(digi.repo, first.branch)).toHaveLength(2);
		});

		it('refuses a PR with another base branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req()));
			forge.prs.get(first.prNumber)!.baseRef = 'andere';
			const r = await save(forge, digi, digiSchema, identity, next(first));
			expect(r).toMatchObject({ ok: false, status: 403 });
		});

		it('refuses a PR whose head differs from the branch', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req()));
			const r = await save(forge, digi, digiSchema, identity, {
				...next(first),
				branch: 'schrijver/digi-handboek/ander-abcd'
			});
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
			expect(forge.fileText(digi.repo, r.branch, 'docs/kennis/mijn-pagina.md')).toBe(
				'# Mijn Pagina\n'
			);
			expect(forge.commitsOf(digi.repo, r.branch)[0].message).toMatch(
				/^Nieuw: docs\/kennis\/mijn-pagina\.md/
			);
			expect(forge.prs.get(r.prNumber)!.title).toBe('Mijn Pagina');
		});

		it('refuses when the file already exists', async () => {
			await forge.commit(
				digi.repo,
				'main',
				[{ path: 'docs/kennis/mijn-pagina.md', content: 'bestaat' }],
				'x'
			);
			const again = await save(forge, digi, digiSchema, identity, newReq());
			expect(again).toMatchObject({ ok: false, status: 409 });
			expect(forge.branches(digi.repo)).toEqual(['main']);
		});
	});

	describe('alt-text check', () => {
		const viaRegex = (body: string) =>
			[...body.matchAll(/!\[([^\]]*)\]\(/g)].some((m) => !m[1].trim());

		it('finds the same images as the original pattern', () => {
			const samples = [
				'![](a.png)',
				'![ ](a.png)',
				'![kat](a.png)',
				'![a ![](b.png)',
				'![]x ![kat](a.png)',
				'![ \n ](a.png)',
				'![![](a.png)',
				'tekst zonder afbeelding',
				'![open zonder sluiting',
				'![kat] (a.png) ![](b.png)'
			];
			for (const body of samples) expect(hasImageWithoutAlt(body), body).toBe(viaRegex(body));
		});

		it('stays linear on adversarial input', () => {
			for (const body of [
				'!['.repeat(250_000),
				'![ '.repeat(160_000) + ']',
				'![a]'.repeat(120_000)
			]) {
				const start = performance.now();
				hasImageWithoutAlt(body);
				expect(performance.now() - start).toBeLessThan(100);
			}
		});
	});

	describe('path and text hygiene', () => {
		it('refuses page paths with control characters', async () => {
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ path: 'docs/a\nCo-authored-by: X <x@y>\n.md' })
			);
			expect(r).toMatchObject({ ok: false, status: 400 });
		});

		it('refuses a new page in a folder with control characters', async () => {
			const r = await save(forge, moza, mozaSchema, identity, {
				...req({
					path: '',
					body: '',
					frontmatter: { title: 'T', description: 'D' },
					baseSha: null
				}),
				newPage: {
					soort: 'Handboekpagina',
					folder: 'handboek/a\n\nCo-authored-by: Jan <jan@example.org>\nb',
					title: 'T'
				}
			});
			expect(r).toMatchObject({ ok: false, status: 400 });
			expect(forge.branches(moza.repo)).toEqual(['main']);
		});

		it('refuses paths outside the content rules', async () => {
			forge.seedRepo(moza.repo, 'main', {
				'content/documenten/x.md': '---\ntitle: X\ndescription: Y\n---\nTekst\n'
			});
			const sha = (await forge.readFile(moza.repo, 'main', 'content/documenten/x.md'))!.sha;
			const r = await save(
				forge,
				moza,
				mozaSchema,
				identity,
				req({
					path: 'content/documenten/x.md',
					frontmatter: { title: 'X', description: 'Y' },
					baseSha: sha
				})
			);
			expect(r).toMatchObject({ ok: false, status: 400 });
		});

		it('drops hidden and out-of-scope keys', async () => {
			const sha = (await forge.readFile(moza.repo, 'main', 'content/contact.md'))!.sha;
			const r = ok(
				await save(
					forge,
					moza,
					mozaSchema,
					identity,
					req({
						path: 'content/contact.md',
						body: '\nTekst.\n',
						frontmatter: {
							title: 'Contact',
							description: 'Bel ons',
							weight: 1,
							date: '2026-01-01'
						},
						changedKeys: ['weight', 'date'],
						baseSha: sha
					})
				)
			);
			expect(forge.fileText(moza.repo, r.branch, 'content/contact.md')).toBe(MOZA_FILE);
		});

		it('refuses a body that would become frontmatter', async () => {
			forge.seedRepo(digi.repo, 'main', { 'docs/kaal.md': '# Kaal\n' });
			const sha = (await forge.readFile(digi.repo, 'main', 'docs/kaal.md'))!.sha;
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({
					path: 'docs/kaal.md',
					body: '---\nlayout: evil\n---\n# Kaal\n',
					frontmatter: {},
					baseSha: sha
				})
			);
			expect(r).toMatchObject({ ok: false, status: 400 });
		});

		it('makes a single plain line of a title', () => {
			expect(singleLine('Titel\n\nCo-authored-by: X `id` $(curl x)')).toBe(
				"Titel Co-authored-by: X 'id' (curl x)"
			);
		});

		it('keeps the pull request title on one line', async () => {
			const r = ok(
				await save(forge, digi, digiSchema, identity, req({ body: '\n# Home `$(x)`\n\nTekst.\n' }))
			);
			expect(forge.prs.get(r.prNumber)!.title).toBe("Home '(x)'");
		});
	});

	describe('deleting images', () => {
		const KAT = 'docs/afbeeldingen/docs/kat.png';
		const without = '\n# Home\n\nZonder kat.\n';
		const refused = (status: number, message: string) => ({
			ok: false,
			status,
			error: expect.objectContaining({ message })
		});

		beforeEach(async () => {
			await forge.commit(
				digi.repo,
				'main',
				[
					{
						path: 'docs/index.md',
						content:
							'---\ndescription: Oud\n---\n\n# Home\n\n![Een kat](afbeeldingen/docs/kat.png)\n'
					},
					{ path: KAT, content: PNG }
				],
				'met kat'
			);
			baseSha = (await forge.readFile(digi.repo, 'main', 'docs/index.md'))!.sha;
		});

		it('deletes an image no page uses in the same commit as the text', async () => {
			const r = ok(
				await save(forge, digi, digiSchema, identity, req({ body: without, deletions: [KAT] }))
			);
			expect(await forge.readFile(digi.repo, r.branch, KAT)).toBeNull();
			expect(forge.fileText(digi.repo, r.branch, 'docs/index.md')).toContain('Zonder kat.');
			expect(forge.commitsOf(digi.repo, r.branch)).toHaveLength(1);
			expect(await forge.readFile(digi.repo, 'main', KAT)).not.toBeNull();
			expect(await forge.prFiles(digi.repo, r.prNumber)).toContainEqual({
				path: KAT,
				status: 'removed'
			});
		});

		it('deletes on the proposal branch an image the proposal added itself', async () => {
			const hond = 'docs/afbeeldingen/docs/hond.png';
			const first = ok(
				await save(
					forge,
					digi,
					digiSchema,
					identity,
					req({
						body: '\n# Home\n\n![Een kat](afbeeldingen/docs/kat.png) ![Een hond](afbeeldingen/docs/hond.png)\n',
						images: [{ path: hond, base64: PNG.toString('base64') }]
					})
				)
			);
			ok(
				await save(
					forge,
					digi,
					digiSchema,
					identity,
					req({
						body: '\n# Home\n\n![Een kat](afbeeldingen/docs/kat.png)\n\nZonder hond.\n',
						baseSha: first.sha,
						branch: first.branch,
						prNumber: first.prNumber,
						deletions: [hond]
					})
				)
			);
			expect(await forge.readFile(digi.repo, first.branch, hond)).toBeNull();
			expect(await forge.prFiles(digi.repo, first.prNumber)).toEqual([
				{ path: 'docs/index.md', status: 'modified' }
			]);
		});

		it('refuses a file outside the image folder', async () => {
			await forge.commit(digi.repo, 'main', [{ path: 'docs/kat.png', content: PNG }], 'x');
			for (const path of ['docs/kat.png', 'docs/afbeeldingen/docs/../../index.md', '../kat.png']) {
				const r = await save(forge, digi, digiSchema, identity, req({ deletions: [path] }));
				expect(r, path).toMatchObject(
					refused(400, 'Niet bewaard: dit bestand kan niet worden verwijderd')
				);
			}
			expect(forge.branches(digi.repo)).toEqual(['main']);
		});

		it('refuses an image another page still uses', async () => {
			await forge.commit(
				digi.repo,
				'main',
				[
					{ path: 'docs/kennis/kat.md', content: '# Kat\n\n![Kat](../afbeeldingen/docs/kat.png)\n' }
				],
				'x'
			);
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ body: without, deletions: [KAT] })
			);
			expect(r).toMatchObject({
				...refused(409, 'Niet bewaard: de afbeelding staat nog op een andere pagina'),
				error: { detail: `${KAT}: docs/kennis/kat.md` }
			});
			expect(forge.branches(digi.repo)).toEqual(['main']);
		});

		it('refuses an image that is not there', async () => {
			await forge.commit(
				digi.repo,
				'main',
				[
					{
						path: 'docs/index.md',
						content: '---\ndescription: Oud\n---\n\n# Home\n\n![Weg](afbeeldingen/docs/weg.png)\n'
					}
				],
				'kapot plaatje'
			);
			baseSha = (await forge.readFile(digi.repo, 'main', 'docs/index.md'))!.sha;
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ body: without, deletions: ['docs/afbeeldingen/docs/weg.png'] })
			);
			expect(r).toMatchObject(refused(409, 'Niet bewaard: de afbeelding bestaat niet meer'));
		});

		it('refuses an image the page did not show before this save', async () => {
			const oud = 'docs/afbeeldingen/andere-pagina/oud.png';
			await forge.commit(digi.repo, 'main', [{ path: oud, content: PNG }], 'oud');
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ body: without, deletions: [KAT, oud] })
			);
			expect(r).toMatchObject({
				...refused(400, 'Niet bewaard: deze afbeelding stond niet op deze pagina'),
				error: { detail: oud }
			});
			expect(forge.branches(digi.repo)).toEqual(['main']);
		});

		it('refuses an image the saved text still shows from the site root', async () => {
			const body = '\n# Home\n\n![Een kat](/afbeeldingen/docs/kat.png)\n';
			const r = await save(forge, digi, digiSchema, identity, req({ body, deletions: [KAT] }));
			expect(r).toMatchObject(refused(400, 'Niet bewaard: de afbeelding staat nog in de tekst'));
		});

		it('refuses an image a page under content.uitsluiten shows, which this page never did', async () => {
			const team = 'content/documenten/presentaties/pulse/images/team.jpeg';
			await forge.commit(
				moza.repo,
				'main',
				[
					{ path: team, content: PNG },
					{
						path: 'content/documenten/presentaties/pulse/index.html',
						content: '<img src="images/team.jpeg" alt="Het team">\n'
					}
				],
				'presentatie'
			);
			const r = await save(
				forge,
				moza,
				mozaSchema,
				identity,
				req({
					path: 'content/contact.md',
					baseSha: (await forge.readFile(moza.repo, 'main', 'content/contact.md'))!.sha,
					frontmatter: { title: 'Contact', description: 'Bel ons' },
					body: '\nTekst.\n',
					deletions: [team]
				})
			);
			expect(r).toMatchObject({ ok: false, status: 400 });
			expect(forge.fileText(moza.repo, 'main', team)).not.toBeNull();
			expect(forge.branches(moza.repo)).toEqual(['main']);
		});

		it('refuses an image in the image folder of a page under content.uitsluiten', async () => {
			const team = 'content/documenten/presentaties/pulse/images/team.jpeg';
			await forge.commit(
				moza.repo,
				'main',
				[
					{ path: team, content: PNG },
					{
						path: 'content/contact.md',
						content: `${MOZA_FILE}\n![Het team](documenten/presentaties/pulse/images/team.jpeg)\n`
					}
				],
				'team'
			);
			const r = await save(
				forge,
				moza,
				mozaSchema,
				identity,
				req({
					path: 'content/contact.md',
					baseSha: (await forge.readFile(moza.repo, 'main', 'content/contact.md'))!.sha,
					frontmatter: { title: 'Contact', description: 'Bel ons' },
					body: '\nTekst.\n',
					deletions: [team]
				})
			);
			expect(r).toMatchObject({
				...refused(400, 'Niet bewaard: dit bestand kan niet worden verwijderd'),
				error: { detail: team }
			});
			expect(forge.branches(moza.repo)).toEqual(['main']);
		});

		it('refuses an image the saved text still shows', async () => {
			const body = '\n# Home\n\n<img src="afbeeldingen/docs/kat.png" alt="Een kat">\n';
			const r = await save(forge, digi, digiSchema, identity, req({ body, deletions: [KAT] }));
			expect(r).toMatchObject(refused(400, 'Niet bewaard: de afbeelding staat nog in de tekst'));
		});

		it('refuses an image sent along in the same save', async () => {
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ images: [{ path: KAT, base64: PNG.toString('base64') }], deletions: [KAT] })
			);
			expect(r).toMatchObject({ ok: false, status: 400 });
		});

		it('refuses when not every page could be read', async () => {
			await forge.commit(
				digi.repo,
				'main',
				[{ path: 'docs/groot.md', content: `# Groot\n\n${'x'.repeat(600_000)}\n` }],
				'x'
			);
			const r = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({ body: without, deletions: [KAT] })
			);
			expect(r).toMatchObject(
				refused(
					409,
					'Niet bewaard: niet na te gaan of de afbeelding nog op een andere pagina staat'
				)
			);
		});
	});

	describe('existing images', () => {
		const kat = { path: 'docs/afbeeldingen/docs/kat.png', base64: PNG.toString('base64') };
		const body = '\n# Home\n\n![Een kat](afbeeldingen/docs/kat.png)\n';

		it('refuses to overwrite an image on the default branch', async () => {
			await forge.commit(digi.repo, 'main', [{ path: kat.path, content: 'oud logo' }], 'x');
			const r = await save(forge, digi, digiSchema, identity, req({ body, images: [kat] }));
			expect(r).toMatchObject({
				ok: false,
				status: 409,
				error: { message: 'Afbeelding bestaat al' }
			});
			expect(forge.fileText(digi.repo, 'main', kat.path)).toBe('oud logo');
		});

		it('overwrites when asked to', async () => {
			await forge.commit(digi.repo, 'main', [{ path: kat.path, content: 'oud logo' }], 'x');
			const r = ok(
				await save(forge, digi, digiSchema, identity, req({ body, images: [kat], overwrite: true }))
			);
			expect(forge.fileText(digi.repo, r.branch, kat.path)).toBe(PNG.toString());
		});

		it('lets a proposal replace an image it added itself', async () => {
			const first = ok(await save(forge, digi, digiSchema, identity, req({ body, images: [kat] })));
			const second = await save(
				forge,
				digi,
				digiSchema,
				identity,
				req({
					body,
					images: [kat],
					baseSha: first.sha,
					branch: first.branch,
					prNumber: first.prNumber
				})
			);
			expect(second.ok).toBe(true);
		});
	});
});
