import { createHash } from 'node:crypto';
import {
	ForgeError,
	type FileChange,
	type FileEntry,
	type Forge,
	type PrFile,
	type PrSummary,
	type Ref
} from './types';

type Blob = { content: Uint8Array; sha: string };
type Tree = Map<string, Blob>;
type Permission = 'admin' | 'write' | 'read' | 'none';

interface RepoState {
	defaultBranch: string;
	isPublic: boolean;
	trees: Map<string, Tree>;
	commits: Map<string, { sha: string; message: string }[]>;
	heads: Map<string, string>;
	snapshots: Map<string, Tree>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const sha1 = (...parts: (Uint8Array | string)[]) => {
	const h = createHash('sha1');
	for (const p of parts) h.update(p);
	return h.digest('hex');
};
const toBytes = (c: Uint8Array | string) => (typeof c === 'string' ? enc.encode(c) : c);
const cloneTree = (t: Tree): Tree => new Map([...t].map(([p, b]) => [p, { ...b }]));

export class FakeForge implements Forge {
	mergeableByPr = new Map<number, boolean>();
	permissionByLogin = new Map<string, Permission>();
	prs = new Map<number, PrSummary>();

	private repos = new Map<string, RepoState>();
	private prRepo = new Map<number, string>();
	private failures = new Map<keyof Forge, ForgeError>();
	private nextPr = 1;
	private commitCounter = 0;

	seedRepo(repo: string, defaultBranch: string, files: Record<string, string | Uint8Array>): void {
		const tree: Tree = new Map();
		for (const [path, content] of Object.entries(files)) {
			const bytes = toBytes(content);
			tree.set(path, { content: bytes, sha: sha1(bytes) });
		}
		const head = sha1('seed', repo);
		this.repos.set(repo, {
			defaultBranch,
			isPublic: false,
			trees: new Map([[defaultBranch, tree]]),
			commits: new Map([[defaultBranch, []]]),
			heads: new Map([[defaultBranch, head]]),
			snapshots: new Map([[head, cloneTree(tree)]])
		});
	}

	setPublic(repo: string, isPublic: boolean): void {
		this.repo(repo).isPublic = isPublic;
	}

	async isPublic(repo: string): Promise<boolean> {
		return this.repo(repo).isPublic;
	}

	failNext(op: keyof Forge, error: ForgeError): void {
		this.failures.set(op, error);
	}

	branches(repo: string): string[] {
		return [...this.repo(repo).trees.keys()];
	}

	fileText(repo: string, ref: string, path: string): string | null {
		const blob = this.tree(repo, ref).get(path);
		return blob ? dec.decode(blob.content) : null;
	}

	commitsOf(repo: string, branch: string): { sha: string; message: string }[] {
		return [...(this.repo(repo).commits.get(branch) ?? [])];
	}

	removeFile(repo: string, branch: string, path: string): void {
		this.tree(repo, branch).delete(path);
	}

	async readTree(repo: string, ref: Ref, dir: string): Promise<FileEntry[]> {
		this.maybeFail('readTree');
		const prefix = dir === '' || dir === '/' ? '' : dir.replace(/\/+$/, '') + '/';
		return [...this.tree(repo, ref)]
			.filter(([path]) => path.startsWith(prefix))
			.map(([path, b]) => ({ path, sha: b.sha }));
	}

	async readFile(repo: string, ref: Ref, path: string) {
		this.maybeFail('readFile');
		const blob = this.tree(repo, ref).get(path);
		return blob ? { content: blob.content, sha: blob.sha } : null;
	}

	async createBranch(repo: string, from: Ref, name: string): Promise<void> {
		this.maybeFail('createBranch');
		const r = this.repo(repo);
		if (r.trees.has(name))
			throw new ForgeError(422, 'Branch bestaat al', `Reference ${name} already exists`);
		r.trees.set(name, cloneTree(this.tree(repo, from)));
		r.commits.set(name, []);
		r.heads.set(name, r.heads.get(from) ?? from);
	}

	async commit(repo: string, branch: string, changes: FileChange[], message: string) {
		this.maybeFail('commit');
		const tree = this.tree(repo, branch);
		for (const change of changes) {
			const bytes = toBytes(change.content);
			tree.set(change.path, { content: bytes, sha: sha1(bytes) });
		}
		const sha = sha1(branch, message, String(this.commitCounter++));
		this.recordCommit(repo, branch, sha, message);
		return { sha };
	}

	async openDraftPr(repo: string, head: string, base: string, title: string, body: string) {
		this.maybeFail('openDraftPr');
		this.tree(repo, head);
		this.tree(repo, base);
		const number = this.nextPr++;
		const pr: PrSummary = {
			number,
			title,
			body,
			draft: true,
			state: 'open',
			headRef: head,
			headSha: this.repo(repo).heads.get(head) ?? '',
			headRepo: repo,
			baseRef: base,
			url: `https://github.com/${repo}/pull/${number}`,
			labels: [],
			updatedAt: new Date().toISOString(),
			mergeable: this.mergeableByPr.get(number) ?? true,
			reviewState: 'none',
			checks: 'none'
		};
		this.prs.set(number, pr);
		this.prRepo.set(number, repo);
		return { ...pr };
	}

	async markReady(repo: string, number: number): Promise<void> {
		this.maybeFail('markReady');
		this.touch(repo, number, { draft: false });
	}

	async updatePr(
		repo: string,
		number: number,
		patch: { title?: string; body?: string }
	): Promise<void> {
		this.maybeFail('updatePr');
		this.touch(repo, number, patch);
	}

	async setLabels(repo: string, number: number, labels: string[]): Promise<void> {
		this.maybeFail('setLabels');
		this.touch(repo, number, { labels: [...labels] });
	}

	async requestReviewers(repo: string, number: number, _logins: string[]): Promise<void> {
		this.maybeFail('requestReviewers');
		this.touch(repo, number, {});
	}

	async listPrs(repo: string, state: 'open' | 'all'): Promise<PrSummary[]> {
		this.maybeFail('listPrs');
		return [...this.prs.values()]
			.filter((p) => this.prRepo.get(p.number) === repo && (state === 'all' || p.state === 'open'))
			.map((p) => this.view(p));
	}

	async getPr(repo: string, number: number): Promise<PrSummary> {
		this.maybeFail('getPr');
		return this.view(this.pr(repo, number));
	}

	async prFiles(repo: string, number: number): Promise<PrFile[]> {
		this.maybeFail('prFiles');
		const pr = this.pr(repo, number);
		const head = this.tree(repo, pr.headRef);
		const base = this.tree(repo, pr.baseRef);
		const files: PrFile[] = [];
		for (const [path, blob] of head) {
			const b = base.get(path);
			if (!b) files.push({ path, status: 'added' });
			else if (b.sha !== blob.sha) files.push({ path, status: 'modified' });
		}
		for (const path of base.keys()) if (!head.has(path)) files.push({ path, status: 'removed' });
		return files;
	}

	async prCommits(repo: string, number: number): Promise<{ sha: string; message: string }[]> {
		this.maybeFail('prCommits');
		return this.commitsOf(repo, this.pr(repo, number).headRef);
	}

	async approve(repo: string, number: number, _comment: string): Promise<void> {
		this.maybeFail('approve');
		this.touch(repo, number, { reviewState: 'approved' });
	}

	async comment(repo: string, number: number, _body: string): Promise<void> {
		this.maybeFail('comment');
		this.touch(repo, number, {});
	}

	async merge(repo: string, number: number, message: string, sha?: string): Promise<void> {
		this.maybeFail('merge');
		const pr = this.pr(repo, number);
		if (sha !== undefined && sha !== this.repo(repo).heads.get(pr.headRef)) {
			throw new ForgeError(
				409,
				'Conflict op GitHub',
				'Head branch was modified. Review and try the merge again.'
			);
		}
		if (this.view(pr).mergeable === false) {
			throw new ForgeError(405, 'Samenvoegen geweigerd', 'Pull request is not mergeable');
		}
		const head = this.tree(repo, pr.headRef);
		const base = this.tree(repo, pr.baseRef);
		base.clear();
		for (const [path, blob] of head) base.set(path, { ...blob });
		this.recordCommit(
			repo,
			pr.baseRef,
			sha1(pr.baseRef, message, String(this.commitCounter++)),
			message
		);
		this.touch(repo, number, { state: 'merged' });
	}

	async collaboratorPermission(_repo: string, login: string): Promise<Permission> {
		this.maybeFail('collaboratorPermission');
		return this.permissionByLogin.get(login) ?? 'none';
	}

	private maybeFail(op: keyof Forge): void {
		const error = this.failures.get(op);
		if (error) {
			this.failures.delete(op);
			throw error;
		}
	}

	private repo(repo: string): RepoState {
		const r = this.repos.get(repo);
		if (!r) throw new ForgeError(404, 'Repository niet gevonden', repo);
		return r;
	}

	private recordCommit(repo: string, branch: string, sha: string, message: string): void {
		const r = this.repo(repo);
		r.commits.get(branch)!.push({ sha, message });
		r.heads.set(branch, sha);
		r.snapshots.set(sha, cloneTree(this.tree(repo, branch)));
	}

	private tree(repo: string, ref: string): Tree {
		const r = this.repo(repo);
		const t = r.trees.get(ref) ?? r.snapshots.get(ref);
		if (!t) throw new ForgeError(404, 'Branch niet gevonden', ref);
		return t;
	}

	private pr(repo: string, number: number): PrSummary {
		const pr = this.prs.get(number);
		if (!pr || this.prRepo.get(number) !== repo) {
			throw new ForgeError(404, 'Pull request niet gevonden', String(number));
		}
		return pr;
	}

	private view(pr: PrSummary): PrSummary {
		const mergeable = this.mergeableByPr.get(pr.number);
		const headSha =
			this.repos.get(this.prRepo.get(pr.number) ?? '')?.heads.get(pr.headRef) ?? pr.headSha;
		return { ...pr, labels: [...pr.labels], mergeable: mergeable ?? pr.mergeable, headSha };
	}

	private touch(repo: string, number: number, patch: Partial<PrSummary>): void {
		Object.assign(this.pr(repo, number), patch, { updatedAt: new Date().toISOString() });
	}
}
