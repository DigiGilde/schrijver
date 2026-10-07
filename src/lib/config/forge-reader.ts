import type { Forge } from '$lib/forge/types';
import type { ConfigReader } from './load';

export function forgeConfigReader(forge: Forge, repo: string, ref = 'main'): ConfigReader {
	return {
		async readFile(path) {
			const file = await forge.readFile(repo, ref, path);
			return file ? new TextDecoder().decode(file.content) : null;
		},
		async listFiles(dir) {
			const prefix = dir === '' || dir === '/' ? '' : dir.replace(/\/+$/, '') + '/';
			const entries = await forge.readTree(repo, ref, dir);
			return entries
				.map((e) => e.path)
				.filter((p) => p.startsWith(prefix))
				.map((p) => p.slice(prefix.length));
		}
	};
}
