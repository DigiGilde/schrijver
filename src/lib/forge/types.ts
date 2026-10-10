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
	/** Logins whose latest review asks for changes. */
	changesRequestedBy: string[];
	/** Logins whose review GitHub waits for; a reviewer leaves the list with their review. */
	requestedReviewers: string[];
	checks: 'none' | 'pending' | 'success' | 'failure';
	/** Login of who opened it on GitHub; Schrijver's App for a proposal made in Schrijver. */
	author?: string;
	mergedAt?: string | null;
	/**
	 * The commit the merge put on the base branch: the merge commit, the squashed commit, or the last
	 * rebased one. Null until it is merged.
	 */
	mergeCommitSha?: string | null;
}

/** Where a pull request's head is, the branch it would merge into, and what its merge put there. */
export type PrHead = Pick<
	PrSummary,
	'headRef' | 'headSha' | 'headRepo' | 'baseRef' | 'mergeCommitSha'
>;

export interface PrCommit {
	sha: string;
	message: string;
	/** GitHub login of its author; null when GitHub knows no account for it. */
	author: string | null;
}

/** A comment in the conversation of a pull request, not one on a line of a file. */
export interface PrComment {
	id: number;
	login: string;
	body: string;
	createdAt: string;
	url: string;
	/** Posted by the account of Schrijver's own App, as the forge knows it: only then is its header Schrijver's. */
	byApp: boolean;
}

/** A submitted review; a pending one is the reviewer's own draft and never listed. */
export interface PrReview {
	id: number;
	login: string;
	state: 'approved' | 'changes_requested' | 'commented' | 'dismissed';
	body: string;
	submittedAt: string;
	url: string;
}

/** A conversation lists at most this many comments, and at most this many reviews. */
export const MAX_CONVERSATION = 300;

export interface PrFile {
	path: string;
	status: 'added' | 'modified' | 'removed';
	/** The path a renamed file had: the pull request removes it. */
	previous?: string;
}

/** GitHub lists at most this many files of a pull request: a list this long may leave files out. */
export const MAX_PR_FILES = 3000;

/** GitHub lists at most this many commits of a pull request: a list this long may leave commits out. */
export const MAX_PR_COMMITS = 250;

/** A repository as GitHub describes it to the App. */
export interface RepoInfo {
	/** GitHub's numeric id: it stays when the repository is renamed or moved. */
	id: number;
	/** owner/name as GitHub writes it now. */
	fullName: string;
	defaultBranch: string;
	description: string | null;
	homepage: string | null;
	isPublic: boolean;
}

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
	/** Adds one label to a pull request; the labels it has keep. */
	addLabel(repo: string, number: number, label: string): Promise<void>;
	/** Takes one label off a pull request, the others keep; a label it does not have is no error. */
	removeLabel(repo: string, number: number, label: string): Promise<void>;
	requestReviewers(repo: string, number: number, logins: string[]): Promise<void>;
	/** Asks reviewers who already reviewed to review again. */
	rerequestReviewers(repo: string, number: number, logins: string[]): Promise<void>;
	listPrs(repo: string, state: 'open' | 'all'): Promise<PrSummary[]>;
	getPr(repo: string, number: number): Promise<PrSummary>;
	/** One lookup of the pull request, without its reviews and checks. */
	prHead(repo: string, number: number): Promise<PrHead>;
	/** The commit where `head` and `base` last agree: what a pull request's changes are measured from. */
	mergeBase(repo: string, base: Ref, head: Ref): Promise<string>;
	/** The first parent of a commit: of a merge commit, the branch that was merged into. */
	firstParent(repo: string, sha: string): Promise<string>;
	prFiles(repo: string, number: number): Promise<PrFile[]>;
	prCommits(repo: string, number: number): Promise<PrCommit[]>;
	/** Oldest first. */
	prComments(repo: string, number: number): Promise<PrComment[]>;
	/** Oldest first. */
	prReviews(repo: string, number: number): Promise<PrReview[]>;
	approve(repo: string, number: number, comment: string): Promise<void>;
	comment(repo: string, number: number, body: string): Promise<void>;
	/** Squash merge; with `sha`, the forge refuses (409) when the head has moved since. */
	merge(repo: string, number: number, message: string, sha?: string): Promise<void>;
	reviewDecision(repo: string, number: number): Promise<ReviewDecision>;
	/** The account the App acts as on GitHub, such as `schrijver[bot]`; null when GitHub does not say. */
	appLogin(): Promise<string | null>;
	collaboratorPermission(repo: string, login: string): Promise<'admin' | 'write' | 'read' | 'none'>;
	/** The repository, when the App is installed on it; null when it is not, or GitHub knows no such repository. */
	repository(repo: string): Promise<RepoInfo | null>;
	/** Where an owner installs the App on a repository; null when GitHub does not say. */
	installUrl(): Promise<string | null>;
}
