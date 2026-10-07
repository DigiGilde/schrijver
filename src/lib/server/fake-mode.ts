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
				return readFileSync(join(base, path), 'utf8');
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
	forge.seedRepo('DigiGilde/handboek', 'main', seedFiles('digi-handboek', 'docs'));
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
