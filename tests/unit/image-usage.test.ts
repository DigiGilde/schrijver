import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import { imageUsage } from '../../src/lib/forge/image-usage';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const KAT = 'docs/afbeeldingen/privacy/kat.png';
const HOND = 'docs/afbeeldingen/privacy/hond.png';
const BRANCH = 'schrijver/digi-handboek/privacy-abcd';

let forge: FakeForge;

beforeEach(() => {
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

	it('reads the pages on the proposal branch', async () => {
		await forge.createBranch(digi.repo, 'main', BRANCH);
		await forge.commit(
			digi.repo,
			BRANCH,
			[
				{ path: 'docs/kennis/index.md', content: '# Kennis\n' },
				{ path: 'docs/over/kat.md', content: '# Kat\n' }
			],
			'x'
		);
		expect((await scan('docs/kennis/privacy.md', [KAT], BRANCH)).images).toEqual([
			{ path: KAT, usedOn: [], excluded: false }
		]);
		expect((await scan('docs/kennis/privacy.md', [KAT])).images[0].usedOn).toHaveLength(2);
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

	it('counts a file that names the image, even when its path would point elsewhere', async () => {
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
		expect(result.images[0].usedOn).toEqual([{ path: 'content/contact.md', title: 'Contact' }]);
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
						{ path: 'content/actueel/bericht/index.md', title: 'Bericht' },
						{ path: 'content/data/fotos.json', title: 'data/fotos.json' },
						{ path: 'content/data/fotos.toml', title: 'data/fotos.toml' },
						{ path: 'content/data/fotos.yaml', title: 'data/fotos.yaml' },
						{
							path: 'content/documenten/presentaties/pulse/index.html',
							title: 'documenten/presentaties/pulse/index.html'
						},
						{
							path: 'content/documenten/presentaties/pulse/stijl.css',
							title: 'documenten/presentaties/pulse/stijl.css'
						},
						{ path: 'content/over/a.markdown', title: 'over/a.markdown' },
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

	it('reads no page when none of the images exists', async () => {
		const readFile = vi.spyOn(forge, 'readFile');
		expect(await scan('docs/kennis/privacy.md', ['docs/afbeeldingen/privacy/weg.png'])).toEqual({
			complete: true,
			images: []
		});
		expect(readFile).not.toHaveBeenCalled();
	});
});
