import { createHash } from 'node:crypto';
import {
	ForgeError,
	MAX_CONVERSATION,
	MAX_PR_COMMITS,
	MAX_PR_FILES,
	type FileChange,
	type FileEntry,
	type Forge,
	type PrComment,
	type PrCommit,
	type PrFile,
	type PrHead,
	type PrReview,
	type PrSummary,
	type Ref,
	type RepoInfo,
	type ReviewDecision
} from './types';
import { sameRepo } from './repo';

type Blob = { content: Uint8Array; sha: string };
type Tree = Map<string, Blob>;
type Permission = 'admin' | 'write' | 'read' | 'none';

interface RepoState {
	id: number;
	defaultBranch: string;
	description: string | null;
	homepage: string | null;
	/** Whether the App is installed on it: without, GitHub shows the App nothing of it. */
	installed: boolean;
	isPublic: boolean;
	trees: Map<string, Tree>;
	/** Without an author, a commit is the App's. */
	commits: Map<string, { sha: string; message: string; author?: string | null }[]>;
	heads: Map<string, string>;
	/** The commit each commit follows; a seeded head has none. */
	parents: Map<string, string | null>;
	snapshots: Map<string, Tree>;
	/** The tree a branch started from: GitHub lists a pull request's files against that point, not the base's head. */
	forkTrees: Map<string, Tree>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const sha1 = (...parts: (Uint8Array | string)[]) => {
	const h = createHash('sha1');
	for (const p of parts) h.update(p);
	return h.digest('hex');
};
const toBytes = (c: Uint8Array | string) => (typeof c === 'string' ? enc.encode(c) : c);
const APP_LOGIN = 'schrijver[bot]';
const cloneTree = (t: Tree): Tree => new Map([...t].map(([p, b]) => [p, { ...b }]));
/** Paths whose content differs between two trees, a path that only one of them holds included. */
const changedPaths = (from: Tree, to: Tree): string[] =>
	[...new Set([...from.keys(), ...to.keys()])].filter(
		(path) => from.get(path)?.sha !== to.get(path)?.sha
	);

export class FakeForge implements Forge {
	mergeableByPr = new Map<number, boolean>();
	permissionByLogin = new Map<string, Permission>();
	prs = new Map<number, PrSummary>();

	private repos = new Map<string, RepoState>();
	/** Old names of renamed repositories: GitHub sends a request for one on to the new name. */
	private movedTo = new Map<string, string>();
	private reviewRequired = new Set<string>();
	private prRepo = new Map<number, string>();
	private comments = new Map<number, Omit<PrComment, 'byApp'>[]>();
	private reviews = new Map<number, PrReview[]>();
	private failures = new Map<keyof Forge, ForgeError>();
	private nextPr = 1;
	private nextRepoId = 1000;
	private nextId = 1;
	private commitCounter = 0;

	seedRepo(
		repo: string,
		defaultBranch: string,
		files: Record<string, string | Uint8Array>,
		about: {
			id?: number;
			description?: string | null;
			homepage?: string | null;
			installed?: boolean;
		} = {}
	): void {
		const tree: Tree = new Map();
		for (const [path, content] of Object.entries(files)) {
			const bytes = toBytes(content);
			tree.set(path, { content: bytes, sha: sha1(bytes) });
		}
		const head = sha1('seed', repo);
		this.repos.set(repo, {
			id: about.id ?? this.nextRepoId++,
			defaultBranch,
			description: about.description ?? null,
			homepage: about.homepage ?? null,
			installed: about.installed ?? true,
			isPublic: false,
			trees: new Map([[defaultBranch, tree]]),
			commits: new Map([[defaultBranch, []]]),
			heads: new Map([[defaultBranch, head]]),
			parents: new Map([[head, null]]),
			snapshots: new Map([[head, cloneTree(tree)]]),
			forkTrees: new Map()
		});
	}

	setPublic(repo: string, isPublic: boolean): void {
		this.repo(repo).isPublic = isPublic;
	}

	async isPublic(repo: string): Promise<boolean> {
		return this.repo(repo).isPublic;
	}

	/** As renaming or moving a repository on GitHub: the old name leads to the new one. */
	renameRepo(from: string, to: string): void {
		const state = this.repo(from);
		this.repos.delete(from);
		this.repos.set(to, state);
		this.movedTo.set(from.toLowerCase(), to);
		for (const [number, repo] of this.prRepo) if (repo === from) this.prRepo.set(number, to);
	}

	/** As choosing another default branch on GitHub. */
	setDefaultBranch(repo: string, branch: string): void {
		this.tree(repo, branch);
		this.repo(repo).defaultBranch = branch;
	}

	/** As installing the App on a repository, or taking it off again. */
	setInstalled(repo: string, installed: boolean): void {
		const state = this.repos.get(repo);
		if (!state) throw new ForgeError(404, 'Repository niet gevonden', repo);
		state.installed = installed;
	}

	async repository(repo: string): Promise<RepoInfo | null> {
		this.maybeFail('repository');
		const named = (name: string) => [...this.repos].find(([key]) => sameRepo(key, name));
		// An old name leads on to the new one until another repository takes it.
		const moved = this.movedTo.get(repo.toLowerCase());
		const found = named(repo) ?? (moved ? named(moved) : undefined);
		if (!found || !found[1].installed) return null;
		const [fullName, state] = found;
		return {
			id: state.id,
			fullName,
			defaultBranch: state.defaultBranch,
			description: state.description,
			homepage: state.homepage,
			isPublic: state.isPublic
		};
	}

	async installUrl(): Promise<string | null> {
		this.maybeFail('installUrl');
		return 'https://github.com/apps/schrijver/installations/new';
	}

	/** As branch protection that requires an approving review before a merge. */
	requireReview(repo: string): void {
		this.reviewRequired.add(repo);
	}

	/** A comment that someone posted on GitHub itself. */
	commentOnGitHub(
		repo: string,
		number: number,
		login: string,
		body: string,
		createdAt = new Date().toISOString()
	): void {
		this.addComment(repo, number, login, body, createdAt);
	}

	/** A review submitted on GitHub; as there, each reviewer's latest verdict counts. */
	reviewOnGitHub(
		repo: string,
		number: number,
		login: string,
		state: PrReview['state'],
		body: string,
		submittedAt = new Date().toISOString()
	): void {
		const pr = this.pr(repo, number);
		const id = this.nextId++;
		const list = [...(this.reviews.get(number) ?? [])];
		list.push({ id, login, state, body, submittedAt, url: `${pr.url}#pullrequestreview-${id}` });
		this.reviews.set(number, list);
		const latest = new Map<string, PrReview['state']>();
		for (const review of list)
			if (review.state !== 'commented') latest.set(review.login, review.state);
		const verdicts = [...latest.values()];
		this.touch(repo, number, {
			reviewState: verdicts.includes('changes_requested')
				? 'changes_requested'
				: verdicts.includes('approved')
					? 'approved'
					: 'none',
			changesRequestedBy: [...latest]
				.filter(([, verdict]) => verdict === 'changes_requested')
				.map(([reviewer]) => reviewer),
			requestedReviewers: pr.requestedReviewers.filter((reviewer) => reviewer !== login)
		});
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
		return (this.repo(repo).commits.get(branch) ?? []).map(({ sha, message }) => ({
			sha,
			message
		}));
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

	async readFile(
		repo: string,
		ref: Ref,
		path: string,
		opts?: { maxBytes?: number }
	): Promise<{ content: Uint8Array; sha: string; tooLarge?: true } | null> {
		this.maybeFail('readFile');
		const blob = this.tree(repo, ref).get(path);
		if (!blob) return null;
		if (opts?.maxBytes !== undefined && blob.content.length > opts.maxBytes) {
			return { content: new Uint8Array(), sha: blob.sha, tooLarge: true };
		}
		return { content: blob.content, sha: blob.sha };
	}

	async createBranch(repo: string, from: Ref, name: string): Promise<void> {
		this.maybeFail('createBranch');
		const r = this.repo(repo);
		if (r.trees.has(name))
			throw new ForgeError(422, 'Branch bestaat al', `Reference ${name} already exists`);
		r.trees.set(name, cloneTree(this.tree(repo, from)));
		r.forkTrees.set(name, cloneTree(this.tree(repo, from)));
		r.commits.set(name, []);
		r.heads.set(name, r.heads.get(from) ?? from);
	}

	async commit(repo: string, branch: string, changes: FileChange[], message: string) {
		this.maybeFail('commit');
		return this.applyCommit(repo, branch, changes, message);
	}

	/** A commit pushed on GitHub itself; a null author is one GitHub knows no account for. */
	commitOnGitHub(
		repo: string,
		branch: string,
		changes: FileChange[],
		message: string,
		author: string | null
	): { sha: string } {
		return this.applyCommit(repo, branch, changes, message, author);
	}

	private applyCommit(
		repo: string,
		branch: string,
		changes: FileChange[],
		message: string,
		author?: string | null
	): { sha: string } {
		const tree = this.tree(repo, branch);
		const missing = changes.find((change) => 'deleted' in change && !tree.has(change.path));
		if (missing) {
			throw new ForgeError(422, 'GitHub weigerde de wijziging', `${missing.path} does not exist`);
		}
		for (const change of changes) {
			if ('deleted' in change) {
				tree.delete(change.path);
				continue;
			}
			const bytes = toBytes(change.content);
			tree.set(change.path, { content: bytes, sha: sha1(bytes) });
		}
		const sha = sha1(branch, message, String(this.commitCounter++));
		this.recordCommit(repo, branch, sha, message, author);
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
			url: `https://github.com/${repo}/pulls`,
			labels: [],
			updatedAt: new Date().toISOString(),
			mergeable: this.mergeableByPr.get(number) ?? true,
			reviewState: 'none',
			changesRequestedBy: [],
			requestedReviewers: [],
			checks: 'none',
			author: APP_LOGIN,
			mergedAt: null
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

	async addLabel(repo: string, number: number, label: string): Promise<void> {
		this.maybeFail('addLabel');
		const { labels } = this.pr(repo, number);
		if (!labels.includes(label)) this.touch(repo, number, { labels: [...labels, label] });
	}

	async removeLabel(repo: string, number: number, label: string): Promise<void> {
		this.maybeFail('removeLabel');
		const { labels } = this.pr(repo, number);
		if (labels.includes(label)) {
			this.touch(repo, number, { labels: labels.filter((l) => l !== label) });
		}
	}

	async requestReviewers(repo: string, number: number, logins: string[]): Promise<void> {
		this.maybeFail('requestReviewers');
		const pr = this.pr(repo, number);
		this.touch(repo, number, {
			requestedReviewers: [...new Set([...pr.requestedReviewers, ...logins])]
		});
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

	async prHead(repo: string, number: number): Promise<PrHead> {
		this.maybeFail('prHead');
		const { headRef, headSha, headRepo, baseRef } = this.view(this.pr(repo, number));
		return { headRef, headSha, headRepo, baseRef };
	}

	async mergeBase(repo: string, base: Ref, head: Ref): Promise<string> {
		this.maybeFail('mergeBase');
		const r = this.repo(repo);
		const history = (ref: Ref): string[] => {
			this.tree(repo, ref);
			const shas: string[] = [];
			let sha: string | null = r.heads.get(ref) ?? ref;
			while (sha) {
				shas.push(sha);
				sha = r.parents.get(sha) ?? null;
			}
			return shas;
		};
		const ofBase = new Set(history(base));
		const common = history(head).find((sha) => ofBase.has(sha));
		if (!common) {
			throw new ForgeError(
				404,
				'Niet gevonden op GitHub',
				`No common ancestor of ${base} and ${head}`
			);
		}
		return common;
	}

	async prFiles(repo: string, number: number): Promise<PrFile[]> {
		this.maybeFail('prFiles');
		const pr = this.pr(repo, number);
		const head = this.tree(repo, pr.headRef);
		const base = this.repo(repo).forkTrees.get(pr.headRef) ?? this.tree(repo, pr.baseRef);
		const files: PrFile[] = [];
		for (const [path, blob] of head) {
			const b = base.get(path);
			if (!b) files.push({ path, status: 'added' });
			else if (b.sha !== blob.sha) files.push({ path, status: 'modified' });
		}
		for (const path of base.keys()) if (!head.has(path)) files.push({ path, status: 'removed' });
		return files.slice(0, MAX_PR_FILES);
	}

	async prCommits(repo: string, number: number): Promise<PrCommit[]> {
		this.maybeFail('prCommits');
		const commits = this.repo(repo).commits.get(this.pr(repo, number).headRef) ?? [];
		return commits.slice(0, MAX_PR_COMMITS).map(({ sha, message, author }) => ({
			sha,
			message,
			author: author === undefined ? APP_LOGIN : author
		}));
	}

	async approve(repo: string, number: number, _comment: string): Promise<void> {
		this.maybeFail('approve');
		this.touch(repo, number, { reviewState: 'approved' });
	}

	async comment(repo: string, number: number, body: string): Promise<void> {
		this.maybeFail('comment');
		this.touch(repo, number, {});
		this.addComment(repo, number, APP_LOGIN, body, new Date().toISOString());
	}

	async appLogin(): Promise<string | null> {
		this.maybeFail('appLogin');
		return APP_LOGIN;
	}

	async prComments(repo: string, number: number): Promise<PrComment[]> {
		this.maybeFail('prComments');
		this.pr(repo, number);
		return (this.comments.get(number) ?? [])
			.slice(0, MAX_CONVERSATION)
			.map((c) => ({ ...c, byApp: c.login === APP_LOGIN }));
	}

	async prReviews(repo: string, number: number): Promise<PrReview[]> {
		this.maybeFail('prReviews');
		this.pr(repo, number);
		return (this.reviews.get(number) ?? []).slice(0, MAX_CONVERSATION).map((r) => ({ ...r }));
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
		if (this.reviewRequired.has(repo) && pr.reviewState !== 'approved') {
			throw new ForgeError(
				405,
				'Samenvoegen geweigerd',
				'At least 1 approving review is required by reviewers with write access.'
			);
		}
		// Like a squash merge on GitHub: only what the branch changed since its fork point lands.
		const head = this.tree(repo, pr.headRef);
		const base = this.tree(repo, pr.baseRef);
		const fork = this.repo(repo).forkTrees.get(pr.headRef) ?? base;
		for (const path of changedPaths(fork, head)) {
			const blob = head.get(path);
			if (blob) base.set(path, { ...blob });
			else base.delete(path);
		}
		this.recordCommit(
			repo,
			pr.baseRef,
			sha1(pr.baseRef, message, String(this.commitCounter++)),
			message
		);
		this.touch(repo, number, { state: 'merged', mergedAt: new Date().toISOString() });
	}

	async reviewDecision(repo: string, number: number): Promise<ReviewDecision> {
		this.maybeFail('reviewDecision');
		const pr = this.pr(repo, number);
		if (!this.reviewRequired.has(repo)) return null;
		if (pr.reviewState === 'approved') return 'approved';
		if (pr.reviewState === 'changes_requested') return 'changes_requested';
		return 'review_required';
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
		if (!r || !r.installed) throw new ForgeError(404, 'Repository niet gevonden', repo);
		return r;
	}

	private addComment(
		repo: string,
		number: number,
		login: string,
		body: string,
		createdAt: string
	): void {
		const pr = this.pr(repo, number);
		const id = this.nextId++;
		const comment = { id, login, body, createdAt, url: `${pr.url}#issuecomment-${id}` };
		this.comments.set(number, [...(this.comments.get(number) ?? []), comment]);
	}

	private recordCommit(
		repo: string,
		branch: string,
		sha: string,
		message: string,
		author?: string | null
	): void {
		const r = this.repo(repo);
		r.commits.get(branch)!.push({ sha, message, ...(author !== undefined ? { author } : {}) });
		r.parents.set(sha, r.heads.get(branch) ?? null);
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
		const state = this.repos.get(this.prRepo.get(pr.number) ?? '');
		const conflicting = state !== undefined && this.conflicts(state, pr);
		const mergeable = this.mergeableByPr.get(pr.number) ?? (conflicting ? false : pr.mergeable);
		const headSha = state?.heads.get(pr.headRef) ?? pr.headSha;
		return {
			...pr,
			labels: [...pr.labels],
			changesRequestedBy: [...pr.changesRequestedBy],
			requestedReviewers: [...pr.requestedReviewers],
			mergeable,
			headSha
		};
	}

	/** Whether the base changed a path differently from the branch since the branch started. */
	private conflicts(state: RepoState, pr: PrSummary): boolean {
		const fork = state.forkTrees.get(pr.headRef);
		const head = state.trees.get(pr.headRef);
		const base = state.trees.get(pr.baseRef);
		if (pr.state !== 'open' || !fork || !head || !base) return false;
		return changedPaths(fork, head).some((path) => {
			const theirs = base.get(path)?.sha;
			return theirs !== fork.get(path)?.sha && theirs !== head.get(path)?.sha;
		});
	}

	private touch(repo: string, number: number, patch: Partial<PrSummary>): void {
		Object.assign(this.pr(repo, number), patch, { updatedAt: new Date().toISOString() });
	}
}
