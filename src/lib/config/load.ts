import { ZodError } from 'zod';
import { parseSchemaYaml, parseSitesYaml, type PageSchema, type SiteConfig } from './types';

export interface ConfigReader {
	readFile(path: string): Promise<string | null>;
	listFiles(dir: string): Promise<string[]>;
}

export class UnknownSiteError extends Error {
	constructor(id: string) {
		super(`Unknown site: ${id}`);
		this.name = 'UnknownSiteError';
	}
}

interface Snapshot {
	sites: SiteConfig[];
	schemas: Map<string, PageSchema>;
	schrijfwijzers: Map<string, string>;
}

class LoadError extends Error {
	constructor(file: string, cause: unknown) {
		// A ZodError's message is its issues as JSON, so its first line would be "[".
		const issue = cause instanceof ZodError ? cause.issues[0] : undefined;
		const detail = issue
			? [issue.path.join('.'), issue.message].filter(Boolean).join(': ')
			: cause instanceof Error
				? cause.message
				: String(cause);
		super(`${file}: ${detail.split('\n')[0]}`);
	}
}

export class ConfigStore {
	private snapshot: Snapshot = { sites: [], schemas: new Map(), schrijfwijzers: new Map() };
	private loadedAt: number | null = null;
	private lastError: string | null = null;

	constructor(
		private reader: ConfigReader,
		private clock: () => number = Date.now
	) {}

	async load(): Promise<void> {
		try {
			this.snapshot = await this.read();
			this.loadedAt = this.clock();
			this.lastError = null;
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
		}
	}

	private async required(path: string): Promise<string> {
		let text: string | null;
		try {
			text = await this.reader.readFile(path);
		} catch (e) {
			throw new LoadError(path, e);
		}
		if (text === null) throw new LoadError(path, new Error('file not found'));
		return text;
	}

	private async read(): Promise<Snapshot> {
		const sitesPath = 'sites.yaml';
		const sitesText = await this.required(sitesPath);
		let sites: SiteConfig[];
		try {
			sites = parseSitesYaml(sitesText);
		} catch (e) {
			throw new LoadError(sitesPath, e);
		}

		const schemas = new Map<string, PageSchema>();
		const schrijfwijzers = new Map<string, string>();
		for (const site of sites) {
			const schemaPath = `schemas/${site.content.schema}.yaml`;
			const schemaText = await this.required(schemaPath);
			try {
				schemas.set(site.id, parseSchemaYaml(schemaText));
			} catch (e) {
				throw new LoadError(schemaPath, e);
			}
			if (site.schrijfwijzer) {
				const path = `schrijfwijzer/${site.schrijfwijzer}`;
				let text: string | null;
				try {
					text = await this.reader.readFile(path);
				} catch (e) {
					throw new LoadError(path, e);
				}
				schrijfwijzers.set(site.id, text ?? '');
			}
		}
		return { sites, schemas, schrijfwijzers };
	}

	sites(): SiteConfig[] {
		return this.snapshot.sites;
	}

	site(id: string): SiteConfig | undefined {
		return this.snapshot.sites.find((s) => s.id === id);
	}

	schema(siteId: string): PageSchema {
		const schema = this.snapshot.schemas.get(siteId);
		if (!schema) throw new UnknownSiteError(siteId);
		return schema;
	}

	schrijfwijzer(siteId: string): string {
		if (!this.site(siteId)) throw new UnknownSiteError(siteId);
		return this.snapshot.schrijfwijzers.get(siteId) ?? '';
	}

	state(): { loadedAt: number | null; lastError: string | null } {
		return { loadedAt: this.loadedAt, lastError: this.lastError };
	}
}
