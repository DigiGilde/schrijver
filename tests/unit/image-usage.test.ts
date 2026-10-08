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
					]
				},
				{ path: HOND, usedOn: [] }
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
					]
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
			{ path: KAT, usedOn: [] }
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
			{ path: 'content/actueel/bericht/index.md', title: 'Bericht' },
			{ path: 'content/handboek/werkwijze/rituelen.md', title: 'Rituelen' }
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
		expect(result).toEqual({ complete: false, images: [{ path: HOND, usedOn: [] }] });
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
