import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import { CachingForge } from '../../src/lib/forge/cache';
import { imageUsage, mentionsByBlob } from '../../src/lib/forge/image-usage';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const KAT = 'docs/afbeeldingen/privacy/kat.png';
const HOND = 'docs/afbeeldingen/privacy/hond.png';
const BRANCH = 'schrijver/digi-handboek/privacy-abcd';

let forge: FakeForge;

beforeEach(() => {
	mentionsByBlob.clear();
	forge = new FakeForge();
	forge.seedRepo(digi.repo, 'main', {
		[KAT]: PNG,
		[HOND]: PNG,
		'docs/kennis/privacy.md': '# Privacy\n\n![Kat](../afbeeldingen/privacy/kat.png)\n',
		'docs/kennis/index.md': '# Kennis\n\n<img src="../afbeeldingen/privacy/kat.png" alt="Kat">\n',
		'docs/over/kat.md':
			'---\ndescription: Zonder kop\n---\n\n![Kat](../afbeeldingen/privacy/kat.png)\n',
		'docs/werkwijze/index.md': '# Werkwijze\n\nGeen plaatjes.\n',
		'README.md': '![Kat](docs/afbeeldingen/privacy/kat.png)\n'
	});
});

const scan = (
	page: string,
	images: string[],
	ref = 'main',
	limits?: { pages: number; bytes: number }
) => imageUsage(forge, digi, { titel: 'uit-h1' }, ref, page, images, limits);

describe('imageUsage', () => {
	it('names the other pages that still use each image, by title or else by path', async () => {
		expect(await scan('docs/kennis/privacy.md', [KAT, HOND])).toEqual({
			complete: true,
			images: [
				{
					path: KAT,
					usedOn: [
						{ path: 'docs/kennis/index.md', title: 'Kennis' },
						{ path: 'docs/over/kat.md', title: 'over/kat.md' }
					],
					excluded: false
				},
				{ path: HOND, usedOn: [], excluded: false }
			]
		});
	});

	it('leaves out the page being saved, files outside the content folder and missing images', async () => {
		expect(await scan('docs/kennis/index.md', [KAT, 'docs/afbeeldingen/privacy/weg.png'])).toEqual({
			complete: true,
			images: [
				{
					path: KAT,
					usedOn: [
						{ path: 'docs/kennis/privacy.md', title: 'Privacy' },
						{ path: 'docs/over/kat.md', title: 'over/kat.md' }
					],
					excluded: false
				}
			]
		});
	});

	it('reads the proposal branch and the default branch: a use on either keeps the image', async () => {
		await forge.createBranch(digi.repo, 'main', BRANCH);
		await forge.commit(
			digi.repo,
			BRANCH,
			[
				{ path: 'docs/kennis/index.md', content: '# Kennis\n' },
				{ path: 'docs/over/kat.md', content: '# Kat\n' },
				{
					path: 'docs/over/hond.md',
					content: '# Hond\n\n![Hond](../afbeeldingen/privacy/hond.png)\n'
				}
			],
			'x'
		);
		expect((await scan('docs/kennis/privacy.md', [KAT, HOND], BRANCH)).images).toEqual([
			{
				path: KAT,
				usedOn: [
					{ path: 'docs/kennis/index.md', title: 'Kennis' },
					{ path: 'docs/over/kat.md', title: 'over/kat.md' }
				],
				excluded: false
			},
			{ path: HOND, usedOn: [{ path: 'docs/over/hond.md', title: 'Hond' }], excluded: false }
		]);
	});

	it('takes the images from the proposal branch, also one the proposal added', async () => {
		const nieuw = 'docs/afbeeldingen/privacy/nieuw.png';
		await forge.createBranch(digi.repo, 'main', BRANCH);
		await forge.commit(
			digi.repo,
			BRANCH,
			[
				{ path: nieuw, content: PNG },
				{ path: HOND, deleted: true }
			],
			'x'
		);
		expect((await scan('docs/kennis/privacy.md', [nieuw, HOND], BRANCH)).images).toEqual([
			{ path: nieuw, usedOn: [], excluded: false }
		]);
	});

	it('resolves MOZa references from an _index.md, a subfolder and a bundle frontmatter', async () => {
		const schema = 'content/handboek/images/schema.png';
		forge.seedRepo(moza.repo, 'main', {
			[schema]: PNG,
			'content/handboek/_index.md': '---\ntitle: Handboek\n---\n\n![Schema](images/schema.png)\n',
			'content/handboek/werkwijze/rituelen.md':
				'---\ntitle: Rituelen\n---\n\n![Schema](../images/schema.png)\n',
			'content/actueel/bericht/index.md':
				'---\ntitle: Bericht\nlead_image: ../../handboek/images/schema.png\n---\n\nTekst.\n',
			'content/contact.md': '---\ntitle: Contact\n---\n\n![Schema](images/plattegrond.png)\n'
		});
		const result = await imageUsage(
			forge,
			moza,
			{ titel: 'veld:title' },
			'main',
			'content/handboek/_index.md',
			[schema]
		);
		expect(result.images[0].usedOn).toEqual([
			{ path: 'content/actueel/bericht/index.md', title: 'Bericht' },
			{ path: 'content/handboek/werkwijze/rituelen.md', title: 'Rituelen' }
		]);
	});

	it('counts a file that names the image as a possible use, when its path reaches no file there', async () => {
		const schema = 'content/handboek/images/schema.png';
		forge.seedRepo(moza.repo, 'main', {
			[schema]: PNG,
			'content/handboek/_index.md': '---\ntitle: Handboek\n---\n\n![Schema](images/schema.png)\n',
			'content/contact.md': '---\ntitle: Contact\n---\n\n![Schema](images/schema.png)\n'
		});
		const result = await imageUsage(
			forge,
			moza,
			{ titel: 'veld:title' },
			'main',
			'content/handboek/_index.md',
			[schema]
		);
		expect(result.images[0].usedOn).toEqual([
			{ path: 'content/contact.md', title: 'Contact', possible: true }
		]);
	});

	it('lets a path to a file of the same name explain the name: each page keeps its own', async () => {
		const privacy = 'docs/afbeeldingen/privacy/schema.png';
		const werkwijze = 'docs/afbeeldingen/werkwijze/schema.png';
		await forge.commit(
			digi.repo,
			'main',
			[
				{ path: privacy, content: PNG },
				{ path: werkwijze, content: PNG },
				{
					path: 'docs/kennis/privacy.md',
					content: '# Privacy\n\n![Schema](../afbeeldingen/privacy/schema.png)\n'
				},
				{
					path: 'docs/werkwijze/index.md',
					content: '# Werkwijze\n\n![Schema](../afbeeldingen/werkwijze/schema.png)\n'
				}
			],
			'schema'
		);
		expect((await scan('docs/kennis/privacy.md', [privacy])).images).toEqual([
			{ path: privacy, usedOn: [], excluded: false }
		]);
		expect((await scan('docs/werkwijze/index.md', [werkwijze])).images).toEqual([
			{ path: werkwijze, usedOn: [], excluded: false }
		]);
	});

	it('keeps an image a bare name in the frontmatter of a page beside it may mean', async () => {
		const schema = 'content/handboek/images/schema.png';
		forge.seedRepo(moza.repo, 'main', {
			[schema]: PNG,
			'content/handboek/_index.md': '---\ntitle: Handboek\n---\n\n![Schema](images/schema.png)\n',
			'content/handboek/rituelen.md':
				'---\ntitle: Rituelen\nafbeelding: schema.png\n---\n\nTekst.\n'
		});
		const result = await imageUsage(
			forge,
			moza,
			{ titel: 'veld:title' },
			'main',
			'content/handboek/_index.md',
			[schema]
		);
		expect(result.images[0].usedOn).toEqual([
			{ path: 'content/handboek/rituelen.md', title: 'Rituelen', possible: true }
		]);
	});

	it('counts a file with more mentions than it keeps as a possible use of every image', async () => {
		const names = Array.from({ length: 5_001 }, (_, i) => `plaatje-${i}.png`).join(' ');
		await forge.commit(
			digi.repo,
			'main',
			[{ path: 'docs/over/alles.md', content: `# Alles\n\n${names}\n` }],
			'alles'
		);
		expect((await scan('docs/kennis/privacy.md', [HOND])).images).toEqual([
			{
				path: HOND,
				usedOn: [{ path: 'docs/over/alles.md', title: 'Alles', possible: true }],
				excluded: false
			}
		]);
	});

	it('reads every kind of text file under the content folder', async () => {
		const team = 'content/documenten/presentaties/pulse/images/team.jpeg';
		forge.seedRepo(moza.repo, 'main', {
			[team]: PNG,
			'content/contact.md': '---\ntitle: Contact\n---\n\nTekst.\n',
			'content/documenten/presentaties/pulse/index.html':
				'<section><img src="images/team.jpeg" alt="Het team"></section>\n',
			'content/documenten/presentaties/pulse/stijl.css':
				'.kop { background: url("images/team.jpeg"); }\n',
			'content/actueel/bericht/index.md':
				'---\ntitle: Bericht\ngalerij: [team.jpeg]\n---\n\nTekst.\n',
			'content/data/fotos.yaml': '- foto: presentaties/pulse/images/team.jpeg\n',
			'content/data/fotos.json': '{"foto":"pulse\\/images\\/team.jpeg"}\n',
			'content/data/fotos.toml': 'foto = "team.jpeg"\n',
			'content/over/a.markdown': 'Zie team.jpeg.\n',
			'content/over/b.mdx': '<Foto src="../documenten/presentaties/pulse/images/team.jpeg" />\n',
			'content/over/c.htm': '<img src="/documenten/presentaties/pulse/images/team.jpeg">\n',
			'content/over/d.txt': 'team.jpeg\n',
			'layouts/partials/team.html': '<img src="team.jpeg">\n'
		});
		const result = await imageUsage(
			forge,
			moza,
			{ titel: 'veld:title' },
			'main',
			'content/contact.md',
			[team]
		);
		expect(result).toEqual({
			complete: true,
			images: [
				{
					path: team,
					usedOn: [
						{ path: 'content/actueel/bericht/index.md', title: 'Bericht', possible: true },
						{ path: 'content/data/fotos.json', title: 'data/fotos.json', possible: true },
						{ path: 'content/data/fotos.toml', title: 'data/fotos.toml', possible: true },
						{ path: 'content/data/fotos.yaml', title: 'data/fotos.yaml', possible: true },
						{
							path: 'content/documenten/presentaties/pulse/index.html',
							title: 'documenten/presentaties/pulse/index.html'
						},
						{
							path: 'content/documenten/presentaties/pulse/stijl.css',
							title: 'documenten/presentaties/pulse/stijl.css'
						},
						{ path: 'content/over/a.markdown', title: 'over/a.markdown', possible: true },
						{ path: 'content/over/b.mdx', title: 'over/b.mdx' },
						{ path: 'content/over/c.htm', title: 'over/c.htm' }
					],
					excluded: true
				}
			]
		});
	});

	it('marks an image under content.uitsluiten, or in the image folder of a page there', async () => {
		const team = 'content/documenten/presentaties/pulse/images/team.jpeg';
		const kaart = 'content/images/kaart.png';
		forge.seedRepo(moza.repo, 'main', {
			[team]: PNG,
			[kaart]: PNG,
			'content/contact.md': '---\ntitle: Contact\n---\n\nTekst.\n'
		});
		const moz = await imageUsage(
			forge,
			moza,
			{ titel: 'veld:title' },
			'main',
			'content/contact.md',
			[team, kaart]
		);
		expect(moz.images.map((image) => [image.path, image.excluded])).toEqual([
			[team, true],
			[kaart, false]
		]);

		const archief = { ...digi, content: { ...digi.content, uitsluiten: ['archief/**'] } };
		const oud = 'docs/afbeeldingen/oud/kaart.png';
		await forge.commit(
			digi.repo,
			'main',
			[
				{ path: oud, content: PNG },
				{ path: 'docs/archief/oud.md', content: '# Oud\n' }
			],
			'archief'
		);
		const dig = await imageUsage(forge, archief, { titel: 'uit-h1' }, 'main', 'docs/index.md', [
			oud,
			KAT
		]);
		expect(dig.images.map((image) => [image.path, image.excluded])).toEqual([
			[oud, true],
			[KAT, false]
		]);
	});

	it('is incomplete when a page is too large to read', async () => {
		await forge.commit(
			digi.repo,
			'main',
			[{ path: 'docs/groot.md', content: `# Groot\n\n${'x'.repeat(600_000)}\n` }],
			'x'
		);
		const result = await scan('docs/kennis/privacy.md', [HOND]);
		expect(result).toEqual({
			complete: false,
			images: [{ path: HOND, usedOn: [], excluded: false }]
		});
	});

	it('is incomplete when the listing of the branch was cut off', async () => {
		const readTree = forge.readTree.bind(forge);
		vi.spyOn(forge, 'readTree').mockImplementation(async (...args) =>
			Object.assign(await readTree(...args), { truncated: true as const })
		);
		expect(await scan('docs/kennis/privacy.md', [HOND])).toEqual({
			complete: false,
			images: [{ path: HOND, usedOn: [], excluded: false }]
		});
	});

	it('reads no more pages than the bound, and is then incomplete', async () => {
		const readFile = vi.spyOn(forge, 'readFile');
		const result = await scan('docs/werkwijze/index.md', [HOND], 'main', {
			pages: 2,
			bytes: 500_000
		});
		expect(readFile).toHaveBeenCalledTimes(2);
		expect(result.complete).toBe(false);
	});

	it('reads a file once, then knows it by its blob on every branch and after a write', async () => {
		const readFile = vi.spyOn(forge, 'readFile');
		const cached = new CachingForge(forge);
		const run = (ref = 'main') =>
			imageUsage(cached, digi, { titel: 'uit-h1' }, ref, 'docs/kennis/privacy.md', [KAT]);
		const first = await run();
		expect(readFile).toHaveBeenCalledTimes(3);
		readFile.mockClear();
		expect(await run()).toEqual(first);
		expect(readFile).not.toHaveBeenCalled();

		await cached.createBranch(digi.repo, 'main', BRANCH);
		await cached.commit(digi.repo, BRANCH, [{ path: 'docs/over/kat.md', content: '# Kat\n' }], 'x');
		const onBranch = await run(BRANCH);
		expect(readFile.mock.calls.map((call) => [call[1], call[2]])).toEqual([
			[BRANCH, 'docs/over/kat.md']
		]);
		expect(onBranch.images[0].usedOn.map((page) => page.path)).toEqual([
			'docs/kennis/index.md',
			'docs/over/kat.md'
		]);
	});

	it('leaves no page text in the forge cache', async () => {
		const readFile = vi.spyOn(forge, 'readFile');
		const cached = new CachingForge(forge);
		await imageUsage(cached, digi, { titel: 'uit-h1' }, 'main', 'docs/kennis/privacy.md', [KAT]);
		readFile.mockClear();
		await cached.readFile(digi.repo, 'main', 'docs/kennis/index.md', { maxBytes: 500_000 });
		expect(readFile).toHaveBeenCalledTimes(1);
	});

	it('reads no page when none of the images exists', async () => {
		const readFile = vi.spyOn(forge, 'readFile');
		expect(await scan('docs/kennis/privacy.md', ['docs/afbeeldingen/privacy/weg.png'])).toEqual({
			complete: true,
			images: []
		});
		expect(readFile).not.toHaveBeenCalled();
	});
});
