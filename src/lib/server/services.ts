import { forgeConfigReader } from '$lib/config/forge-reader';
import { ConfigStore } from '$lib/config/load';
import { CachingForge } from '$lib/forge/cache';
import { githubForgeFromEnv } from '$lib/forge/github';
import type { Forge } from '$lib/forge/types';
import { log } from '$lib/log';

const RETRY_MS = 60000;

let configStore: ConfigStore | null = null;
let forge: Forge | null = null;
let inFlight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function getConfigStore(): ConfigStore {
	if (!configStore) throw new Error('config store not initialised');
	return configStore;
}

export function setConfigStore(store: ConfigStore | null): void {
	configStore = store;
}

export function getForge(): Forge {
	return (forge ??= new CachingForge(githubForgeFromEnv()));
}

export function setForge(f: Forge | null): void {
	forge = f;
}

function parseConfigRepo(): { repo: string; ref: string } {
	const raw = process.env.GITHUB_CONFIG_REPO ?? '';
	const [repo, ref] = raw.split('@');
	if (!repo || !repo.includes('/')) throw new Error('GITHUB_CONFIG_REPO must be owner/name[@ref]');
	return { repo, ref: ref || 'main' };
}

export function configRepoName(): string {
	return parseConfigRepo().repo;
}

function loadOnce(): Promise<void> {
	inFlight ??= (async () => {
		const store = getConfigStore();
		try {
			await store.load();
		} finally {
			inFlight = null;
		}
		const { lastError } = store.state();
		if (lastError) {
			log.error('config.load_failed', { error: lastError });
			scheduleRetry();
		} else {
			log.info('config.loaded');
		}
	})();
	return inFlight;
}

function scheduleRetry(): void {
	if (retryTimer) return;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		void loadOnce();
	}, RETRY_MS);
	retryTimer.unref?.();
}

export function reloadConfig(): Promise<void> {
	return loadOnce();
}

export async function initServices(): Promise<void> {
	const { repo, ref } = parseConfigRepo();
	setConfigStore(new ConfigStore(forgeConfigReader(getForge(), repo, ref)));
	await loadOnce();
}

export function stopServices(): void {
	if (retryTimer) clearTimeout(retryTimer);
	retryTimer = null;
}
