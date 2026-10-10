import { describe, expect, it, vi } from 'vitest';
import { checkRepository, readStructure } from '../../src/lib/config/structure';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { structureFile } from './sites-fixture';

const REPO = 'Org/site';

function forgeWith(files: Record<string, string | Uint8Array>, id = 7) {
	const forge = new FakeForge();
	forge.seedRepo(REPO, 'main', files, { id, description: 'Een site', homepage: null });
	return forge;
}

const files = (site: string, names = ['site.yaml', 'schema.yaml']) =>
	Object.fromEntries(names.map((name) => [`.schrijver/${name}`, structureFile(site, name)]));

describe('readStructure', () => {
	it('reads the three files of .schrijver/ on a branch, the writing guide optional', async () => {
		const forge = forgeWith(files('moza-site', ['site.yaml', 'schema.yaml', 'schrijfwijzer.md']));
		const read = await readStructure(forge, REPO, 'main');
		expect(read.ok && read.value.site.preview.soort).toBe('bij-label');
		expect(read.ok && read.value.schema.titel).toBe('veld:title');
		expect(read.ok && read.value.schrijfwijzer).toBe(
			structureFile('moza-site', 'schrijfwijzer.md')
		);
		const without = await readStructure(forgeWith(files('digi-handboek')), REPO, 'main');
		expect(without.ok && without.value.schrijfwijzer).toBe('');
	});

	it('names every problem of every file, each with its file and field', async () => {
		const read = await readStructure(forgeWith(files('intranet')), REPO, 'main');
		expect(read).toEqual({
			ok: false,
			errors: [
				'.schrijver/site.yaml: preview.label: is nodig bij soort: bij-label',
				'.schrijver/site.yaml: preview.url: moet {nummer} bevatten',
				'.schrijver/schema.yaml: velden.kleur.type: moet een van deze waarden zijn: tekst, getal, ja-nee, datum, paginaverwijzing'
			]
		});
		const missing = await readStructure(forgeWith({ 'README.md': '# x' }), REPO, 'main');
		expect(missing).toEqual({
			ok: false,
			errors: ['.schrijver/site.yaml: ontbreekt', '.schrijver/schema.yaml: ontbreekt']
		});
	});

	it('refuses a file above its limit without downloading it, and one that is no UTF-8', async () => {
		const forge = forgeWith({
			...files('digi-handboek'),
			'.schrijver/site.yaml': `# ${'x'.repeat(64_000)}\n${structureFile('digi-handboek', 'site.yaml')}`,
			'.schrijver/schrijfwijzer.md': new Uint8Array([0xff, 0xfe, 0x00])
		});
		const readFile = vi.spyOn(forge, 'readFile');
		expect(await readStructure(forge, REPO, 'main')).toEqual({
			ok: false,
			errors: [
				'.schrijver/site.yaml: is groter dan 64 kB',
				'.schrijver/schrijfwijzer.md: is geen tekst in UTF-8'
			]
		});
		expect(readFile).toHaveBeenCalledWith(REPO, 'main', '.schrijver/site.yaml', {
			maxBytes: 64_000,
			uncached: true
		});
		expect(readFile).toHaveBeenCalledWith(REPO, 'main', '.schrijver/schrijfwijzer.md', {
			maxBytes: 32_000,
			uncached: true
		});
	});

	it('names the first ten problems of a file and counts the rest', async () => {
		const velden = Array.from({ length: 12 }, (_, i) => `  v${i}: { type: kleur }`).join('\n');
		const forge = forgeWith({
			...files('digi-handboek'),
			'.schrijver/schema.yaml': `titel: uit-h1\nvelden:\n${velden}\nnieuwe-pagina: { mappen: [a] }\n`
		});
		const read = await readStructure(forge, REPO, 'main');
		expect(read.ok ? [] : read.errors).toHaveLength(11);
		expect(read.ok ? '' : read.errors[10]).toBe('.schrijver/schema.yaml: en nog 2 meldingen');
	});
});

describe('checkRepository', () => {
	it('looks the repository up and reads its structure from its default branch', async () => {
		const forge = forgeWith({});
		await forge.createBranch(REPO, 'main', 'trunk');
		await forge.commit(
			REPO,
			'trunk',
			Object.entries(files('kennisbank')).map(([path, content]) => ({ path, content })),
			'm'
		);
		forge.setDefaultBranch(REPO, 'trunk');
		const check = await checkRepository(forge, 'org/SITE');
		expect(check).toMatchObject({
			ok: true,
			repo: { id: 7, fullName: REPO, defaultBranch: 'trunk', description: 'Een site' },
			structure: { site: { content: { pad: 'inhoud' } } }
		});
	});

	it('tells a missing App, another repository, GitHub down and invalid files apart', async () => {
		const forge = forgeWith(files('intranet'));
		expect(await checkRepository(forge, 'Org/bestaat-niet')).toEqual({
			ok: false,
			reason: 'not-installed'
		});
		forge.setInstalled(REPO, false);
		expect(await checkRepository(forge, REPO)).toEqual({ ok: false, reason: 'not-installed' });
		forge.setInstalled(REPO, true);
		expect(await checkRepository(forge, REPO, 8)).toMatchObject({
			ok: false,
			reason: 'other-repository',
			repo: { id: 7 }
		});
		forge.failNext('repository', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect(await checkRepository(forge, REPO, 7)).toMatchObject({
			ok: false,
			reason: 'unreachable'
		});
		forge.failNext('readFile', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect(await checkRepository(forge, REPO, 7)).toMatchObject({
			ok: false,
			reason: 'unreachable'
		});
		expect(await checkRepository(forge, REPO, 7)).toMatchObject({
			ok: false,
			reason: 'invalid',
			errors: expect.arrayContaining(['.schrijver/site.yaml: preview.url: moet {nummer} bevatten'])
		});
	});
});
