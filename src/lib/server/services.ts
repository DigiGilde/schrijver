import { teamStore } from '$lib/auth/team-store';
import { ConfigStore, type Registry } from '$lib/config/load';
import { CachingForge } from '$lib/forge/cache';
import { githubForgeFromEnv } from '$lib/forge/github';
import type { Forge } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';

const RETRY_MS = 60000;

let configStore: ConfigStore | null = null;
let forge: Forge | null = null;
let stopped = false;
let initPromise: Promise<void> | null = null;
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

// Loads run one at a time, so an older read never overwrites a newer one.
let wholeLoad = false;
const siteLoads = new Set<string>();
let running: Promise<void> | null = null;

function drain(): Promise<void> {
	running ??= (async () => {
		try {
			while (wholeLoad || siteLoads.size > 0) {
				if (wholeLoad) {
					wholeLoad = false;
					siteLoads.clear();
					await loadAll();
				} else {
					const [siteId] = siteLoads;
					siteLoads.delete(siteId);
					await loadSite(siteId);
				}
			}
		} finally {
			running = null;
		}
	})();
	return running;
}

async function loadAll(): Promise<void> {
	const store = getConfigStore();
	try {
		await store.load();
		const statuses = store.statuses();
		log.info('config.loaded', {
			sites: statuses.length,
			available: statuses.filter((s) => s.available).length
		});
		for (const { site, errors } of statuses) {
			if (errors.length > 0)
				log.warn('config.site_invalid', { site: site.id, errors: errors.length });
		}
	} catch (err) {
		log.error('config.load_failed', errorFields(err));
	}
	if (store.state().lastError !== null || store.needsRetry()) scheduleRetry();
}

async function loadSite(siteId: string): Promise<void> {
	const store = getConfigStore();
	try {
		await store.reload(siteId);
		const status = store.status(siteId);
		log.info('config.site_loaded', {
			site: siteId,
			available: status?.available ?? false,
			errors: status?.errors.length ?? 0
		});
	} catch (err) {
		log.error('config.site_load_failed', { site: siteId, ...errorFields(err) });
		scheduleRetry();
		return;
	}
	if (store.needsRetry()) scheduleRetry();
}

function scheduleRetry(): void {
	if (retryTimer || stopped) return;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		void reloadConfig();
	}, RETRY_MS);
	retryTimer.unref?.();
}

/** Reads the list of sites and every site's structure again. */
export function reloadConfig(): Promise<void> {
	wholeLoad = true;
	return drain();
}

/** Reads one site's structure again: after a push to its default branch, or after adding or removing it. */
export function reloadSite(siteId: string): Promise<void> {
	siteLoads.add(siteId);
	return drain();
}

/**
 * Builds the sites from the registry in the database. `prepare` runs before every read of the
 * registry; when it or the read fails, the load is tried again in a minute.
 */
export function initServices(prepare?: () => Promise<void>): Promise<void> {
	initPromise ??= (async () => {
		stopped = false;
		const registry: Registry = {
			async sites() {
				await prepare?.();
				return teamStore().sites();
			},
			moveSite: (siteId, repo, standaardbranch) =>
				teamStore().moveSite(siteId, repo, standaardbranch)
		};
		setConfigStore(new ConfigStore(registry, getForge));
		await reloadConfig();
	})();
	return initPromise;
}

export function stopServices(): void {
	stopped = true;
	initPromise = null;
	if (retryTimer) clearTimeout(retryTimer);
	retryTimer = null;
}
