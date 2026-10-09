export type Ref = string;

export interface FileEntry {
	path: string;
	sha: string;
}

/** A recursive listing; `truncated` when the forge left entries out of it. */
export type FileTree = FileEntry[] & { truncated?: true };

export type FileChange =
	| { path: string; content: Uint8Array | string } // string = utf8 text
	| { path: string; deleted: true };

export interface PrSummary {
	number: number;
	title: string;
	body: string;
	draft: boolean;
	state: 'open' | 'closed' | 'merged';
	headRef: string;
	/** Commit the head branch points at. */
	headSha: string;
	/** Full name (owner/name) of the head repository; empty when the fork was deleted. */
	headRepo: string;
	baseRef: string;
	url: string;
	labels: string[];
	updatedAt: string;
	mergeable: boolean | null;
	reviewState: 'none' | 'approved' | 'changes_requested';
	checks: 'none' | 'pending' | 'success' | 'failure';
}

export interface PrFile {
	path: string;
	status: 'added' | 'modified' | 'removed';
	/** The path a renamed file had: the pull request removes it. */
	previous?: string;
}

/** GitHub lists at most this many files of a pull request: a list this long may leave files out. */
export const MAX_PR_FILES = 3000;

/** Where a pull request stands with a review that the base branch requires; null when it requires none. */
export type ReviewDecision = 'approved' | 'changes_requested' | 'review_required' | null;

export class ForgeError extends Error {
	constructor(
		public status: number,
		message: string,
		public detail?: string
	) {
		super(message);
		this.name = 'ForgeError';
	}
}

export interface Forge {
	readTree(repo: string, ref: Ref, dir: string): Promise<FileTree>; // recursive
	/**
	 * With `maxBytes`, a larger file is not downloaded: it comes back empty with `tooLarge`. With
	 * `uncached`, a caching forge neither serves nor keeps the content.
	 */
	readFile(
		repo: string,
		ref: Ref,
		path: string,
		opts?: { maxBytes?: number; uncached?: true }
	): Promise<{ content: Uint8Array; sha: string; tooLarge?: true } | null>;
	createBranch(repo: string, from: Ref, name: string): Promise<void>;
	commit(
		repo: string,
		branch: string,
		changes: FileChange[],
		message: string
	): Promise<{ sha: string }>;
	openDraftPr(
		repo: string,
		head: string,
		base: string,
		title: string,
		body: string
	): Promise<PrSummary>;
	markReady(repo: string, number: number): Promise<void>;
	updatePr(repo: string, number: number, patch: { title?: string; body?: string }): Promise<void>;
	setLabels(repo: string, number: number, labels: string[]): Promise<void>;
	requestReviewers(repo: string, number: number, logins: string[]): Promise<void>;
	listPrs(repo: string, state: 'open' | 'all'): Promise<PrSummary[]>;
	getPr(repo: string, number: number): Promise<PrSummary>;
	prFiles(repo: string, number: number): Promise<PrFile[]>;
	prCommits(repo: string, number: number): Promise<{ sha: string; message: string }[]>;
	approve(repo: string, number: number, comment: string): Promise<void>;
	comment(repo: string, number: number, body: string): Promise<void>;
	/** Squash merge; with `sha`, the forge refuses (409) when the head has moved since. */
	merge(repo: string, number: number, message: string, sha?: string): Promise<void>;
	reviewDecision(repo: string, number: number): Promise<ReviewDecision>;
	collaboratorPermission(repo: string, login: string): Promise<'admin' | 'write' | 'read' | 'none'>;
	/** Whether the repository is publicly readable. */
	isPublic(repo: string): Promise<boolean>;
}
