import { movedColumns, type RegisteredSite } from '$lib/auth/team';
import type { Forge } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { checkRepository, type RepositoryCheck } from './structure';
import type { PageSchema, SiteConfig } from './types';

/** Where the list of sites lives: Schrijver's database. */
export interface Registry {
	sites(): Promise<RegisteredSite[]>;
	moveSite(siteId: string, repo: string, standaardbranch: string): Promise<string[]>;
}

export class UnknownSiteError extends Error {
	constructor(id: string) {
		super(`Unknown site: ${id}`);
		this.name = 'UnknownSiteError';
	}
}

/** How many sites read their structure at the same time. */
const PARALLEL = 4;

/** What Schrijver knows of a site in the registry, for its admins. */
export interface SiteStatus {
	/** As the registry has it, following GitHub when the repository moved. */
	site: RegisteredSite;
	/** Whether colleagues can work on it: it has a valid structure, from now or from before. */
	available: boolean;
	/** What is wrong now, in Dutch; empty when nothing is. */
	errors: string[];
	/** Whether its repository is public, as Schrijver last read it; null when the last read failed. */
	isPublic: boolean | null;
}

interface Entry {
	site: RegisteredSite;
	isPublic: boolean | null;
	/** The last valid structure: kept when a later change to the files is not valid. */
	config: SiteConfig | null;
	schema: PageSchema | null;
	schrijfwijzer: string;
	errors: string[];
	/** GitHub could not be reached or shows nothing: worth trying again. */
	retry: boolean;
}

export const NOT_INSTALLED = (repo: string) =>
	`De Schrijver-app is niet geïnstalleerd op ${repo}, of die repository bestaat niet meer.`;
export const OTHER_REPOSITORY = (repo: string) =>
	`${repo} is op GitHub niet meer de repository van deze site. Schrijver werkt er niet in.`;
export const UNREACHABLE =
	'Schrijver kon GitHub niet bereiken. Het probeert het elke minuut opnieuw.';

function problems(check: Exclude<RepositoryCheck, { ok: true }>, repo: string): string[] {
	switch (check.reason) {
		case 'not-installed':
			return [NOT_INSTALLED(repo)];
		case 'other-repository':
			return [OTHER_REPOSITORY(repo)];
		case 'unreachable':
			return [UNREACHABLE];
		case 'invalid':
			return check.errors;
	}
}

async function inParallel<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
	return out;
}

/** The sites of Schrijver: the registry, plus the structure each site keeps in its own repository. */
export class ConfigStore {
	private entries = new Map<string, Entry>();
	private loadedAt: number | null = null;
	private lastError: string | null = null;
	/** Per site, how often its visibility was forgotten: a read that began before cannot tell it. */
	private forgotten = new Map<string, number>();

	constructor(
		private registry: Registry,
		private forge: () => Forge,
		private clock: () => number = Date.now
	) {}

	/** Reads the registry and every site's structure. Throws, keeping what it had, when the registry cannot be read. */
	async load(): Promise<void> {
		let registered: RegisteredSite[];
		try {
			registered = await this.registry.sites();
		} catch (e) {
			this.lastError = 'De lijst met sites kon niet worden gelezen.';
			throw e;
		}
		const entries = await inParallel(registered, PARALLEL, (site) =>
			this.read(site, this.entries.get(site.id))
		);
		this.entries = new Map(entries.map((entry) => [entry.site.id, entry]));
		this.loadedAt = this.clock();
		this.lastError = null;
	}

	/** Reads one site again, as the registry has it now; a site that left the registry goes. */
	async reload(siteId: string): Promise<void> {
		const site = (await this.registry.sites()).find((s) => s.id === siteId);
		if (!site) {
			this.entries.delete(siteId);
			return;
		}
		this.entries.set(siteId, await this.read(site, this.entries.get(siteId)));
	}

	/**
	 * Forgets whether a site's repository is public, as when GitHub says it was made private or public:
	 * until it is read again, only the site's team sees it.
	 */
	forgetVisibility(siteId: string): void {
		this.forgotten.set(siteId, (this.forgotten.get(siteId) ?? 0) + 1);
		const entry = this.entries.get(siteId);
		if (entry) this.entries.set(siteId, { ...entry, isPublic: null });
	}

	private async read(site: RegisteredSite, previous?: Entry): Promise<Entry> {
		const forgotten = this.forgotten.get(site.id) ?? 0;
		const entry = await this.check(site, previous);
		return (this.forgotten.get(site.id) ?? 0) === forgotten ? entry : { ...entry, isPublic: null };
	}

	private async check(site: RegisteredSite, previous?: Entry): Promise<Entry> {
		const check = await checkRepository(this.forge(), site.repo, site.repoId);
		if (check.ok) {
			const { fullName: repo, defaultBranch: standaardbranch } = check.repo;
			const current = { ...site, repo, standaardbranch };
			if (movedColumns(site, current).length > 0) {
				try {
					await this.registry.moveSite(site.id, repo, standaardbranch);
					log.info('config.site_moved', { site: site.id });
				} catch (err) {
					log.warn('config.site_move_failed', { site: site.id, ...errorFields(err) });
				}
			}
			return {
				site: current,
				isPublic: check.repo.isPublic,
				config: {
					...check.structure.site,
					id: site.id,
					repoId: site.repoId,
					repo,
					standaardbranch
				},
				schema: check.structure.schema,
				schrijfwijzer: check.structure.schrijfwijzer,
				errors: [],
				retry: false
			};
		}
		if (check.reason === 'unreachable') {
			log.warn('config.site_unreachable', { site: site.id, ...errorFields(check.error) });
		}
		// A name that leads to another repository: nothing that was read for this site may be used.
		const kept = check.reason === 'other-repository' ? undefined : previous;
		const { repo, standaardbranch } = site;
		return {
			site,
			isPublic: check.reason === 'invalid' ? check.repo.isPublic : null,
			config: kept?.config ? { ...kept.config, repo, standaardbranch } : null,
			schema: kept?.schema ?? null,
			schrijfwijzer: kept?.schrijfwijzer ?? '',
			errors: problems(check, site.repo),
			retry: check.reason === 'unreachable' || check.reason === 'not-installed'
		};
	}

	/** The sites colleagues can work on, oldest first. */
	sites(): SiteConfig[] {
		return [...this.entries.values()].flatMap((entry) => (entry.config ? [entry.config] : []));
	}

	/** A site colleagues can work on; undefined for one without a valid structure. */
	site(id: string): SiteConfig | undefined {
		return this.entries.get(id)?.config ?? undefined;
	}

	schema(siteId: string): PageSchema {
		const schema = this.entries.get(siteId)?.schema;
		if (!schema) throw new UnknownSiteError(siteId);
		return schema;
	}

	schrijfwijzer(siteId: string): string {
		const entry = this.entries.get(siteId);
		if (!entry?.config) throw new UnknownSiteError(siteId);
		return entry.schrijfwijzer;
	}

	/** Every site in the registry with what is wrong with it, for its admins. */
	statuses(): SiteStatus[] {
		return [...this.entries.values()].map((entry) => ({
			site: { ...entry.site },
			available: entry.config !== null,
			errors: [...entry.errors],
			isPublic: entry.isPublic
		}));
	}

	status(siteId: string): SiteStatus | undefined {
		return this.statuses().find((status) => status.site.id === siteId);
	}

	/** The sites that could not be read for a reason that may pass. */
	retrying(): string[] {
		return [...this.entries.values()].filter((entry) => entry.retry).map((entry) => entry.site.id);
	}

	state(): { loadedAt: number | null; lastError: string | null } {
		return { loadedAt: this.loadedAt, lastError: this.lastError };
	}
}
