import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ConfigStore, type ConfigReader } from '$lib/config/load';
import { setConfigStore, setForge } from './services';
import { FakeForge } from '$lib/forge/fake';
import { identityTrailer } from '$lib/forge/trailers';

const ROOT = process.cwd();

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

function seedFiles(corpus: string, prefix: string): Record<string, string> {
	const base = resolve(ROOT, 'tests/corpus', corpus);
	const files: Record<string, string> = {};
	for (const file of walk(base)) {
		if (!file.endsWith('.md')) continue;
		files[`${prefix}/${relative(base, file).split('\\').join('/')}`] = readFileSync(file, 'utf8');
	}
	return files;
}

const MELDING_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAA4UlEQVR42u3bMQ0AIAxFweIWD0hBUBdEYAEHmOgAySXPwW0/bcTIB1v7qKQADBgwYMCAAQMGDFiABRgwYMCAAQMGDBiwAAswYMCAAQMGDBgw4Gx9qiTAgAEDBgwYMGDAgAVYgAEDBmyqNFUCBgwYsAALMGDAgAEDBgwYMGDAgAVYgAEDBgwYMGDAgAELsHwXOroDDBgwYMCAAQMWYAEGDBgwYMCmSlMlYMCAAQuwAAMGDBgwYMCAAQMWYAEGDBgwYMCAAQMGLMACDNjRnaM7wIABAwYMGDBgARZgwIABA/6iC8DQmVuP/5FYAAAAAElFTkSuQmCC';
const SCHEMA_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAA30lEQVR42u3csQ3AIAxFQbNtdmAUBqLJEKzABhkgBRVIWCe9/ku+3lGepsSFEwAWYAEWYAEWYAEGLMACLMACLMACDFiABViABViABViAAQuwAAuwAAuwfsDvmEocYMACLMACLMACLMCABViXAEftm1oM2z2z69CAHRqwQwMGDNguYLuA7QIG7NCAHRqwQwO2C9guYLuAATs0YIcG7NCAAQO2C9guYLuAATs0YIcG7NCA7QK2C9guYMAODdihATs0YLuA7QK2CxiwQ+fd9UnKIzQBFmABFmABFmDAAqwr+gABiUhNlKBpRQAAAABJRU5ErkJggg==';

/** Images on pages no other e2e test edits: one shown on a single page, one that three pages share. */
function withImages(pages: Record<string, string>): Record<string, string | Uint8Array> {
	const show = (page: string, alt: string, ref: string) => {
		pages[page] = `${pages[page]}\n![${alt}](${ref})\n`;
	};
	show(
		'docs/over/kwetsbaarheid.md',
		'Stroomschema van een melding',
		'../afbeeldingen/kwetsbaarheid/melding.png'
	);
	for (const page of [
		'docs/werkwijze/index.md',
		'docs/werkwijze/beslissingen-logboek.md',
		'docs/over/toegankelijkheid.md'
	])
		show(page, 'Schema van onze werkwijze', '../afbeeldingen/werkwijze/schema.png');
	return {
		...pages,
		'docs/afbeeldingen/kwetsbaarheid/melding.png': Buffer.from(MELDING_PNG, 'base64'),
		'docs/afbeeldingen/werkwijze/schema.png': Buffer.from(SCHEMA_PNG, 'base64')
	};
}

async function seedDraft(forge: FakeForge, repo: string, path: string, title: string) {
	const branch = 'schrijver/voorbeeld';
	await forge.createBranch(repo, 'main', branch);
	const current = forge.fileText(repo, 'main', path) ?? '';
	await forge.commit(repo, branch, [{ path, content: current + '\nAanvulling.\n' }], 'Voorbeeld');
	const body = identityTrailer({ kind: 'anoniem', pseudoniem: 'voorbeeld0000' });
	await forge.openDraftPr(repo, branch, 'main', title, body);
}

function fixtureReader(): ConfigReader {
	const base = resolve(ROOT, 'tests/fixtures/config');
	return {
		async readFile(path) {
			try {
				const text = readFileSync(join(base, path), 'utf8');
				return path === 'sites.yaml'
					? text.replace(
							'- naam@rijksoverheid.nl',
							'- naam@rijksoverheid.nl\n      - test@example.org'
						)
					: text;
			} catch {
				return null;
			}
		},
		async listFiles(dir) {
			try {
				return walk(join(base, dir)).map((f) => relative(join(base, dir), f));
			} catch {
				return [];
			}
		}
	};
}

export async function buildFakeServices(): Promise<{ forge: FakeForge; store: ConfigStore }> {
	const forge = new FakeForge();
	forge.seedRepo('DigiGilde/handboek', 'main', withImages(seedFiles('digi-handboek', 'docs')));
	forge.seedRepo('MinBZK/moza-site', 'main', seedFiles('moza-site', 'content'));
	forge.setPublic('DigiGilde/handboek', true);
	forge.setPublic('MinBZK/moza-site', true);
	await seedDraft(forge, 'DigiGilde/handboek', 'docs/index.md', 'Voorbeeldvoorstel Digi Handboek');
	await seedDraft(forge, 'MinBZK/moza-site', 'content/contact.md', 'Voorbeeldvoorstel MOZa-site');
	const store = new ConfigStore(fixtureReader());
	await store.load();
	return { forge, store };
}

export async function initFakeServices(): Promise<void> {
	const { forge, store } = await buildFakeServices();
	setForge(forge);
	setConfigStore(store);
}
