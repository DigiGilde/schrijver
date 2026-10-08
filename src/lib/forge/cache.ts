import { repoKey } from './repo';
import type { FileChange, FileEntry, Forge, PrFile, PrSummary, Ref } from './types';

interface Entry {
	promise: Promise<unknown>;
	expires: number;
}

export class CachingForge implements Forge {
	private entries = new Map<string, Map<string, Entry>>();

	constructor(
		private inner: Forge,
		private ttlMs = 60000,
		private clock: () => number = Date.now,
		/** Pull request lists and file lists: short, because check runs do not invalidate. */
		private prTtlMs = 15000
	) {}

	invalidate(repo: string): void {
		this.entries.delete(repoKey(repo));
	}

	private cached<T>(
		repo: string,
		key: string,
		load: () => Promise<T>,
		ttl = this.ttlMs
	): Promise<T> {
		const now = this.clock();
		repo = repoKey(repo);
		const existing = this.entries.get(repo)?.get(key);
		if (existing && existing.expires > now) return existing.promise as Promise<T>;
		const promise = load();
		let perRepo = this.entries.get(repo);
		if (!perRepo) this.entries.set(repo, (perRepo = new Map()));
		const entry: Entry = { promise, expires: now + ttl };
		perRepo.set(key, entry);
		promise.catch(() => {
			if (this.entries.get(repo)?.get(key) === entry) this.entries.get(repo)!.delete(key);
		});
		return promise;
	}

	private async written<T>(repo: string, op: () => Promise<T>): Promise<T> {
		try {
			return await op();
		} finally {
			this.invalidate(repo);
		}
	}

	readTree(repo: string, ref: Ref, dir: string): Promise<FileEntry[]> {
		return this.cached(repo, `tree\0${ref}\0${dir}`, () => this.inner.readTree(repo, ref, dir));
	}

	readFile(repo: string, ref: Ref, path: string) {
		return this.cached(repo, `file\0${ref}\0${path}`, () => this.inner.readFile(repo, ref, path));
	}

	createBranch(repo: string, from: Ref, name: string): Promise<void> {
		return this.written(repo, () => this.inner.createBranch(repo, from, name));
	}
	commit(repo: string, branch: string, changes: FileChange[], message: string) {
		return this.written(repo, () => this.inner.commit(repo, branch, changes, message));
	}
	openDraftPr(repo: string, head: string, base: string, title: string, body: string) {
		return this.written(repo, () => this.inner.openDraftPr(repo, head, base, title, body));
	}
	markReady(repo: string, number: number): Promise<void> {
		return this.written(repo, () => this.inner.markReady(repo, number));
	}
	updatePr(repo: string, number: number, patch: { title?: string; body?: string }): Promise<void> {
		return this.written(repo, () => this.inner.updatePr(repo, number, patch));
	}
	setLabels(repo: string, number: number, labels: string[]): Promise<void> {
		return this.written(repo, () => this.inner.setLabels(repo, number, labels));
	}
	requestReviewers(repo: string, number: number, logins: string[]): Promise<void> {
		return this.written(repo, () => this.inner.requestReviewers(repo, number, logins));
	}
	approve(repo: string, number: number, comment: string): Promise<void> {
		return this.written(repo, () => this.inner.approve(repo, number, comment));
	}
	comment(repo: string, number: number, body: string): Promise<void> {
		return this.written(repo, () => this.inner.comment(repo, number, body));
	}
	merge(repo: string, number: number, message: string, sha?: string): Promise<void> {
		return this.written(repo, () => this.inner.merge(repo, number, message, sha));
	}

	listPrs(repo: string, state: 'open' | 'all'): Promise<PrSummary[]> {
		return this.cached(repo, `prs\0${state}`, () => this.inner.listPrs(repo, state), this.prTtlMs);
	}
	getPr(repo: string, number: number): Promise<PrSummary> {
		return this.inner.getPr(repo, number);
	}
	prFiles(repo: string, number: number): Promise<PrFile[]> {
		return this.cached(
			repo,
			`prfiles\0${number}`,
			() => this.inner.prFiles(repo, number),
			this.prTtlMs
		);
	}
	prCommits(repo: string, number: number) {
		return this.inner.prCommits(repo, number);
	}
	isPublic(repo: string) {
		return this.cached(repo, 'public', () => this.inner.isPublic(repo));
	}

	collaboratorPermission(repo: string, login: string) {
		return this.inner.collaboratorPermission(repo, login);
	}
}
