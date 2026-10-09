import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';
import { RequestError } from '@octokit/request-error';
import { log } from '../log';
import {
	ForgeError,
	MAX_PR_FILES,
	type FileChange,
	type FileTree,
	type Forge,
	type PrFile,
	type PrSummary,
	type Ref,
	type ReviewDecision
} from './types';

type Octo = Awaited<ReturnType<App['getInstallationOctokit']>>;
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const MESSAGES: Record<number, string> = {
	401: 'Geen toegang tot de repository',
	403: 'Geen toegang tot de repository',
	404: 'Niet gevonden op GitHub',
	405: 'Samenvoegen geweigerd',
	409: 'Conflict op GitHub',
	422: 'GitHub weigerde de wijziging',
	429: 'GitHub-limiet bereikt, probeer het later'
};

/** Says when the limit resets, from x-ratelimit-reset (epoch seconds) or retry-after (seconds). */
function rateLimitMessage(headers: Record<string, unknown>, now = Date.now()): string {
	const reset = Number(headers['x-ratelimit-reset']) * 1000;
	const retry = Number(headers['retry-after']) * 1000;
	const at = reset > now ? reset : retry > 0 ? now + retry : 0;
	if (!at) return MESSAGES[429];
	const time = new Date(at).toLocaleTimeString('nl-NL', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/Amsterdam'
	});
	return `GitHub-limiet bereikt, probeer het na ${time} opnieuw`;
}

function toForgeError(e: unknown): ForgeError {
	if (e instanceof ForgeError) return e;
	if (e instanceof RequestError) {
		const data = e.response?.data as { message?: string; errors?: unknown[] } | undefined;
		const parts = [data?.message ?? e.message];
		for (const x of data?.errors ?? []) {
			parts.push(
				typeof x === 'string' ? x : ((x as { message?: string }).message ?? JSON.stringify(x))
			);
		}
		const detail = parts.join('; ');
		const rateLimited =
			(e.status === 403 || e.status === 429) &&
			(/rate limit/i.test(detail) || !!e.response?.headers?.['retry-after']);
		const message = rateLimited
			? rateLimitMessage(e.response?.headers ?? {})
			: (MESSAGES[e.status] ?? 'GitHub gaf een fout');
		return new ForgeError(e.status, message, detail);
	}
	const msg = e instanceof Error ? e.message : String(e);
	return new ForgeError(500, 'GitHub gaf een fout', msg);
}

function splitRepo(repo: string): { owner: string; repo: string } {
	const [owner, name] = repo.split('/');
	return { owner, repo: name };
}

export class GitHubForge implements Forge {
	private app: App;
	private installations = new Map<string, number>();
	private clients = new Map<number, Octo>();

	constructor(opts: { appId: string; privateKey: string; baseUrl?: string }) {
		const privateKey = opts.privateKey.trim().startsWith('-----BEGIN')
			? opts.privateKey.replace(/\\n/g, '\n')
			: Buffer.from(opts.privateKey, 'base64').toString('utf8');
		this.app = new App({
			appId: opts.appId,
			privateKey,
			...(opts.baseUrl ? { Octokit: Octokit.defaults({ baseUrl: opts.baseUrl }) } : {})
		});
	}

	static fromEnv(env: NodeJS.ProcessEnv = process.env): GitHubForge {
		const appId = env.GITHUB_APP_ID;
		const privateKey = env.GITHUB_APP_PRIVATE_KEY;
		if (!appId || !privateKey) {
			throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set');
		}
		return new GitHubForge({ appId, privateKey });
	}

	private async octokit(repo: string): Promise<Octo> {
		let id = this.installations.get(repo);
		if (id === undefined) {
			const { owner, repo: name } = splitRepo(repo);
			try {
				const res = await this.app.octokit.request('GET /repos/{owner}/{repo}/installation', {
					owner,
					repo: name
				});
				id = res.data.id as number;
			} catch (e) {
				throw toForgeError(e);
			}
			this.installations.set(repo, id);
		}
		let ok = this.clients.get(id);
		if (!ok) {
			try {
				ok = await this.app.getInstallationOctokit(id);
			} catch (e) {
				throw toForgeError(e);
			}
			this.clients.set(id, ok);
		}
		return ok;
	}

	private forget(repo: string, e: unknown): void {
		const url = e instanceof RequestError ? e.request?.url : undefined;
		if (e instanceof RequestError && e.status === 404 && url?.includes('/access_tokens')) {
			const id = this.installations.get(repo);
			this.installations.delete(repo);
			if (id !== undefined) this.clients.delete(id);
		}
	}

	private async request(repo: string, route: string, params: Json = {}): Promise<Json> {
		const ok = await this.octokit(repo);
		try {
			const res = await ok.request(route, { ...splitRepo(repo), ...params });
			return res.data;
		} catch (e) {
			this.forget(repo, e);
			throw toForgeError(e);
		}
	}

	async readTree(repo: string, ref: Ref, dir: string): Promise<FileTree> {
		const data = await this.request(repo, 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
			tree_sha: ref,
			recursive: '1'
		});
		const prefix = dir === '' || dir === '.' ? '' : dir.replace(/\/+$/, '') + '/';
		const entries: FileTree = (data.tree as Json[])
			.filter((n) => n.type === 'blob' && n.path.startsWith(prefix))
			.map((n) => ({ path: n.path as string, sha: n.sha as string }));
		if (!data.truncated) return entries;
		log.warn('forge.tree_truncated', { repo, ref });
		return Object.assign(entries, { truncated: true as const });
	}

	async readFile(
		repo: string,
		ref: Ref,
		path: string,
		opts?: { maxBytes?: number }
	): Promise<{ content: Uint8Array; sha: string; tooLarge?: true } | null> {
		let data: Json;
		try {
			data = await this.request(repo, 'GET /repos/{owner}/{repo}/contents/{path}', { path, ref });
		} catch (e) {
			if (e instanceof ForgeError && e.status === 404) return null;
			throw e;
		}
		if (Array.isArray(data) || data.type !== 'file') return null;
		if (opts?.maxBytes !== undefined && Number(data.size) > opts.maxBytes) {
			return { content: new Uint8Array(), sha: data.sha, tooLarge: true };
		}
		if (data.content) {
			return { content: new Uint8Array(Buffer.from(data.content, 'base64')), sha: data.sha };
		}
		const blob = await this.request(repo, 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}', {
			file_sha: data.sha
		});
		return { content: new Uint8Array(Buffer.from(blob.content, 'base64')), sha: data.sha };
	}

	async createBranch(repo: string, from: Ref, name: string): Promise<void> {
		let sha = from;
		if (!/^[0-9a-f]{40}$/.test(from)) {
			const head = await this.request(repo, 'GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
				branch: from
			});
			sha = head.object.sha;
		}
		await this.request(repo, 'POST /repos/{owner}/{repo}/git/refs', {
			ref: `refs/heads/${name}`,
			sha
		});
	}

	async commit(
		repo: string,
		branch: string,
		changes: FileChange[],
		message: string
	): Promise<{ sha: string }> {
		const head = await this.request(repo, 'GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
			branch
		});
		const headSha: string = head.object.sha;
		const headCommit = await this.request(
			repo,
			'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
			{
				commit_sha: headSha
			}
		);
		const tree: Json[] = [];
		for (const change of changes) {
			if ('deleted' in change) {
				// A null sha removes the path from the base tree.
				tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
				continue;
			}
			const binary = typeof change.content !== 'string';
			const blob = await this.request(repo, 'POST /repos/{owner}/{repo}/git/blobs', {
				content: binary
					? Buffer.from(change.content as Uint8Array).toString('base64')
					: (change.content as string),
				encoding: binary ? 'base64' : 'utf-8'
			});
			tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
		}
		const newTree = await this.request(repo, 'POST /repos/{owner}/{repo}/git/trees', {
			base_tree: headCommit.tree.sha,
			tree
		});
		const created = await this.request(repo, 'POST /repos/{owner}/{repo}/git/commits', {
			message,
			tree: newTree.sha,
			parents: [headSha]
		});
		if (created.verification?.verified !== true) {
			log.warn('forge.commit_unverified', { repo, sha: created.sha });
		}
		await this.request(repo, 'PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}', {
			branch,
			sha: created.sha
		});
		return { sha: created.sha };
	}

	async openDraftPr(
		repo: string,
		head: string,
		base: string,
		title: string,
		body: string
	): Promise<PrSummary> {
		const pr = await this.request(repo, 'POST /repos/{owner}/{repo}/pulls', {
			head,
			base,
			title,
			body,
			draft: true
		});
		return this.summarize(repo, pr);
	}

	async markReady(repo: string, number: number): Promise<void> {
		const pr = await this.request(repo, 'GET /repos/{owner}/{repo}/pulls/{pull_number}', {
			pull_number: number
		});
		const ok = await this.octokit(repo);
		try {
			await ok.graphql(
				`mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { isDraft } } }`,
				{ id: pr.node_id }
			);
		} catch (e) {
			const status = (e as { status?: number }).status;
			const errors = (e as { errors?: { type?: string; message?: string }[] }).errors ?? [];
			const message = e instanceof Error ? e.message : String(e);
			const denied =
				status === 403 ||
				errors.some(
					(x) => x.type === 'FORBIDDEN' || /not accessible|permission/i.test(x.message ?? '')
				) ||
				/not accessible|permission/i.test(message);
			if (denied) {
				throw new ForgeError(403, 'Klaar-voor-beoordeling zetten is niet toegestaan', message);
			}
			throw toForgeError(e);
		}
	}

	async updatePr(
		repo: string,
		number: number,
		patch: { title?: string; body?: string }
	): Promise<void> {
		await this.request(repo, 'PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
			pull_number: number,
			...patch
		});
	}

	async setLabels(repo: string, number: number, labels: string[]): Promise<void> {
		await this.request(repo, 'PUT /repos/{owner}/{repo}/issues/{issue_number}/labels', {
			issue_number: number,
			labels
		});
	}

	async requestReviewers(repo: string, number: number, logins: string[]): Promise<void> {
		await this.request(repo, 'POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
			pull_number: number,
			reviewers: logins
		});
	}

	async listPrs(repo: string, state: 'open' | 'all'): Promise<PrSummary[]> {
		const prs: Json[] = await this.request(repo, 'GET /repos/{owner}/{repo}/pulls', {
			state,
			per_page: 100,
			sort: 'updated',
			direction: 'desc'
		});
		return mapPool(prs, 5, (pr) => this.summarize(repo, pr));
	}

	async getPr(repo: string, number: number): Promise<PrSummary> {
		const pr = await this.request(repo, 'GET /repos/{owner}/{repo}/pulls/{pull_number}', {
			pull_number: number
		});
		return this.summarize(repo, pr);
	}

	async prFiles(repo: string, number: number): Promise<PrFile[]> {
		const perPage = 100;
		const files: Json[] = [];
		for (let page = 1; files.length < MAX_PR_FILES; page++) {
			const batch: Json[] = await this.request(
				repo,
				'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
				{ pull_number: number, per_page: perPage, page }
			);
			files.push(...batch);
			if (batch.length < perPage) break;
		}
		return files.slice(0, MAX_PR_FILES).map((f) => ({
			path: f.filename as string,
			status: f.status === 'added' || f.status === 'removed' ? f.status : 'modified',
			...(f.status === 'renamed' && f.previous_filename
				? { previous: f.previous_filename as string }
				: {})
		}));
	}

	async prCommits(repo: string, number: number): Promise<{ sha: string; message: string }[]> {
		const commits: Json[] = await this.request(
			repo,
			'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
			{
				pull_number: number,
				per_page: 100
			}
		);
		return commits.map((c) => ({
			sha: c.sha as string,
			message: (c.commit as { message: string }).message
		}));
	}

	async approve(repo: string, number: number, comment: string): Promise<void> {
		await this.request(repo, 'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
			pull_number: number,
			event: 'APPROVE',
			body: comment
		});
	}

	async comment(repo: string, number: number, body: string): Promise<void> {
		await this.request(repo, 'POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
			issue_number: number,
			body
		});
	}

	async merge(repo: string, number: number, message: string, sha?: string): Promise<void> {
		const [title, ...rest] = message.split('\n');
		await this.request(repo, 'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
			pull_number: number,
			merge_method: 'squash',
			commit_title: title,
			commit_message: rest.join('\n'),
			...(sha ? { sha } : {})
		});
	}

	async reviewDecision(repo: string, number: number): Promise<ReviewDecision> {
		const ok = await this.octokit(repo);
		const { owner, repo: name } = splitRepo(repo);
		let data: Json;
		try {
			data = await ok.graphql(
				`query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewDecision } } }`,
				{ owner, name, number }
			);
		} catch (e) {
			throw toForgeError(e);
		}
		const decision = data?.repository?.pullRequest?.reviewDecision;
		return decision === 'APPROVED'
			? 'approved'
			: decision === 'CHANGES_REQUESTED'
				? 'changes_requested'
				: decision === 'REVIEW_REQUIRED'
					? 'review_required'
					: null;
	}

	async collaboratorPermission(
		repo: string,
		login: string
	): Promise<'admin' | 'write' | 'read' | 'none'> {
		try {
			const data = await this.request(
				repo,
				'GET /repos/{owner}/{repo}/collaborators/{username}/permission',
				{ username: login }
			);
			const p = data.permission;
			return p === 'admin' || p === 'write' || p === 'read' ? p : 'none';
		} catch (e) {
			if (e instanceof ForgeError && e.status === 404) return 'none';
			throw e;
		}
	}

	async isPublic(repo: string): Promise<boolean> {
		try {
			const data = await this.request(repo, 'GET /repos/{owner}/{repo}');
			return !data.private;
		} catch (e) {
			if (e instanceof ForgeError && e.status === 404) return true;
			throw e;
		}
	}

	private async summarize(repo: string, pr: Json): Promise<PrSummary> {
		const [reviews, checks] = await Promise.all([
			this.request(repo, 'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
				pull_number: pr.number,
				per_page: 100
			}),
			this.request(repo, 'GET /repos/{owner}/{repo}/commits/{ref}/check-runs', {
				ref: pr.head.sha,
				per_page: 100
			})
		]);
		return {
			number: pr.number,
			title: pr.title,
			body: pr.body ?? '',
			draft: !!pr.draft,
			state: pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
			headRef: pr.head.ref,
			headSha: pr.head.sha,
			headRepo: pr.head.repo?.full_name ?? '',
			baseRef: pr.base.ref,
			url: pr.html_url,
			labels: (pr.labels ?? []).map((l: Json) => l.name),
			updatedAt: pr.updated_at,
			mergeable: pr.mergeable ?? null,
			reviewState: reviewState(reviews),
			checks: checkState(checks.check_runs ?? [])
		};
	}
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

// COMMENTED and PENDING reviews do not change a reviewer's verdict.
function reviewState(reviews: Json[]): PrSummary['reviewState'] {
	const latest = new Map<string, string>();
	for (const r of reviews) {
		if (!r.user || r.state === 'COMMENTED' || r.state === 'PENDING') continue;
		latest.set(r.user.login, r.state);
	}
	const states = [...latest.values()];
	if (states.includes('CHANGES_REQUESTED')) return 'changes_requested';
	return states.includes('APPROVED') ? 'approved' : 'none';
}

function checkState(runs: Json[]): PrSummary['checks'] {
	if (runs.length === 0) return 'none';
	if (runs.some((r) => r.status !== 'completed')) return 'pending';
	const bad = ['failure', 'timed_out', 'cancelled', 'action_required'];
	return runs.some((r) => bad.includes(r.conclusion)) ? 'failure' : 'success';
}

export function githubForgeFromEnv(): GitHubForge {
	return GitHubForge.fromEnv();
}
