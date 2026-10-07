export type Ref = string;

export interface FileEntry {
	path: string;
	sha: string;
}

export interface FileChange {
	path: string;
	content: Uint8Array | string; // string = utf8 text
}

export interface PrSummary {
	number: number;
	title: string;
	body: string;
	draft: boolean;
	state: 'open' | 'closed' | 'merged';
	headRef: string;
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
}

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
	readTree(repo: string, ref: Ref, dir: string): Promise<FileEntry[]>; // recursive
	readFile(repo: string, ref: Ref, path: string): Promise<{ content: Uint8Array; sha: string } | null>;
	createBranch(repo: string, from: Ref, name: string): Promise<void>;
	commit(repo: string, branch: string, changes: FileChange[], message: string): Promise<{ sha: string }>;
	openDraftPr(repo: string, head: string, base: string, title: string, body: string): Promise<PrSummary>;
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
	merge(repo: string, number: number, message: string): Promise<void>; // squash
	collaboratorPermission(repo: string, login: string): Promise<'admin' | 'write' | 'read' | 'none'>;
	/** Whether the repository is publicly readable. */
	isPublic(repo: string): Promise<boolean>;
}
