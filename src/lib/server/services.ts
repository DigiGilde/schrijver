import type { ConfigStore } from '$lib/config/load';

let configStore: ConfigStore | null = null;

export function setConfigStore(store: ConfigStore): void {
	configStore = store;
}

export function getConfigStore(): ConfigStore {
	if (!configStore) throw new Error('ConfigStore not initialised');
	return configStore;
}
