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
let dirty = false;
let stopped = false;
let initPromise: Promise<void> | null = null;
let initialised: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function getConfigStore(): ConfigStore {
	if (!configStore) throw new Error('config store not initialised');
	return configStore;
}

export function setConfigStore(store: ConfigStore | null): void {
	configStore = store;
	stopped = false;
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
	if (inFlight) {
		dirty = true;
		return inFlight;
	}
	inFlight = (async () => {
		const store = getConfigStore();
		let thrown: string | null = null;
		try {
			do {
				dirty = false;
				thrown = null;
				try {
					await store.load();
				} catch (e) {
					thrown = e instanceof Error ? e.message : String(e);
				}
			} while (dirty);
		} finally {
			inFlight = null;
		}
		const error = thrown ?? store.state().lastError;
		if (error) {
			log.error('config.load_failed', { error });
			scheduleRetry();
		} else {
			log.info('config.loaded');
		}
	})();
	return inFlight;
}

function scheduleRetry(): void {
	if (retryTimer || stopped) return;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		void loadOnce();
	}, RETRY_MS);
	retryTimer.unref?.();
}

export function reloadConfig(): Promise<void> {
	return loadOnce();
}

export function initServices(): Promise<void> {
	initPromise ??= (async () => {
		stopped = false;
		const { repo, ref } = parseConfigRepo();
		setConfigStore(new ConfigStore(forgeConfigReader(getForge(), repo, ref)));
		await loadOnce();
	})();
	return initPromise;
}

export function stopServices(): void {
	stopped = true;
	initPromise = null;
	if (retryTimer) clearTimeout(retryTimer);
	retryTimer = null;
}
