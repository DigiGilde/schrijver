import { generateKeyPairSync } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { GitHubForge } from '../../src/lib/forge/github';
import { ForgeError } from '../../src/lib/forge/types';

const { privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const API = 'https://api.github.com';
const server = setupServer();
let bodies: Record<string, unknown[]>;

function record(key: string, body: unknown) {
	(bodies[key] ??= []).push(body);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
	bodies = {};
	server.use(
		http.get(`${API}/repos/o/r/installation`, () => HttpResponse.json({ id: 42 })),
		http.post(`${API}/app/installations/42/access_tokens`, () =>
			HttpResponse.json(
				{ token: 'ghs_x', expires_at: new Date(Date.now() + 3600_000).toISOString() },
				{ status: 201 }
			)
		)
	);
});

const forge = () => new GitHubForge({ appId: '1', privateKey });

describe('GitHubForge', () => {
	it('commits without author/committer and updates the ref with the new sha', async () => {
		server.use(
			http.get(`${API}/repos/o/r/git/ref/heads/x`, () =>
				HttpResponse.json({ object: { sha: 'head1' } })
			),
			http.get(`${API}/repos/o/r/git/commits/head1`, () =>
				HttpResponse.json({ sha: 'head1', tree: { sha: 'tree0' } })
			),
			http.post(`${API}/repos/o/r/git/blobs`, async ({ request }) => {
				const b = (await request.json()) as { encoding: string };
				record('blob', b);
				return HttpResponse.json({ sha: `blob-${b.encoding}` }, { status: 201 });
			}),
			http.post(`${API}/repos/o/r/git/trees`, async ({ request }) => {
				record('tree', await request.json());
				return HttpResponse.json({ sha: 'tree1' }, { status: 201 });
			}),
			http.post(`${API}/repos/o/r/git/commits`, async ({ request }) => {
				record('commit', await request.json());
				return HttpResponse.json(
					{ sha: 'commit1', verification: { verified: true } },
					{ status: 201 }
				);
			}),
			http.patch(`${API}/repos/o/r/git/refs/heads/x`, async ({ request }) => {
				record('ref', await request.json());
				return HttpResponse.json({});
			})
		);
		const res = await forge().commit(
			'o/r',
			'x',
			[
				{ path: 'a.md', content: 'hi' },
				{ path: 'b.png', content: new Uint8Array([1, 2]) }
			],
			'msg'
		);
		expect(res.sha).toBe('commit1');
		const commit = bodies.commit[0] as Record<string, unknown>;
		expect(commit).not.toHaveProperty('author');
		expect(commit).not.toHaveProperty('committer');
		expect(commit.parents).toEqual(['head1']);
		expect(bodies.blob.map((b) => (b as { encoding: string }).encoding)).toEqual([
			'utf-8',
			'base64'
		]);
		expect((bodies.tree[0] as { base_tree: string }).base_tree).toBe('tree0');
		expect((bodies.ref[0] as { sha: string }).sha).toBe('commit1');
	});

	it('maps a 422 from merge to ForgeError with GitHub detail', async () => {
		server.use(
			http.put(`${API}/repos/o/r/pulls/3/merge`, async ({ request }) => {
				record('merge', await request.json());
				return HttpResponse.json({ message: 'Head branch was modified' }, { status: 422 });
			})
		);
		const err = await forge()
			.merge('o/r', 3, 'title\n\nrest')
			.catch((e) => e);
		expect(err).toBeInstanceOf(ForgeError);
		expect(err.status).toBe(422);
		expect(err.detail).toContain('Head branch was modified');
		expect(bodies.merge[0]).toMatchObject({
			merge_method: 'squash',
			commit_title: 'title',
			commit_message: '\nrest'
		});
	});

	it('maps collaborator permission', async () => {
		server.use(
			http.get(`${API}/repos/o/r/collaborators/jan/permission`, () =>
				HttpResponse.json({ permission: 'write' })
			),
			http.get(`${API}/repos/o/r/collaborators/nobody/permission`, () =>
				HttpResponse.json({ message: 'Not Found' }, { status: 404 })
			)
		);
		expect(await forge().collaboratorPermission('o/r', 'jan')).toBe('write');
		expect(await forge().collaboratorPermission('o/r', 'nobody')).toBe('none');
	});

	it('marks ready through the GraphQL mutation', async () => {
		server.use(
			http.get(`${API}/repos/o/r/pulls/5`, () => HttpResponse.json({ node_id: 'PR_node' })),
			http.post(`${API}/graphql`, async ({ request }) => {
				record('gql', await request.json());
				return HttpResponse.json({
					data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } }
				});
			})
		);
		await forge().markReady('o/r', 5);
		const q = JSON.stringify(bodies.gql[0]);
		expect(q).toContain('markPullRequestReadyForReview');
		expect(q).toContain('PR_node');
	});

	it('maps a GraphQL permission error to ForgeError 403', async () => {
		server.use(
			http.get(`${API}/repos/o/r/pulls/5`, () => HttpResponse.json({ node_id: 'PR_node' })),
			http.post(`${API}/graphql`, () =>
				HttpResponse.json({
					data: null,
					errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }]
				})
			)
		);
		const err = await forge()
			.markReady('o/r', 5)
			.catch((e) => e);
		expect(err).toBeInstanceOf(ForgeError);
		expect(err.status).toBe(403);
		expect(err.detail).toContain('Resource not accessible');
	});

	it('lists PRs with draft, labels, review state and checks', async () => {
		server.use(
			http.get(`${API}/repos/o/r/pulls`, () =>
				HttpResponse.json([
					{
						number: 7,
						title: 'T',
						body: null,
						draft: true,
						state: 'open',
						merged_at: null,
						head: { ref: 'h', sha: 'sha7' },
						base: { ref: 'main' },
						html_url: 'https://github.com/o/r/pull/7',
						labels: [{ name: 'a' }, { name: 'b' }],
						updated_at: '2026-01-01T00:00:00Z',
						mergeable: null
					}
				])
			),
			http.get(`${API}/repos/o/r/pulls/7/reviews`, () =>
				HttpResponse.json([
					{ user: { login: 'u1' }, state: 'APPROVED' },
					{ user: { login: 'u2' }, state: 'CHANGES_REQUESTED' },
					{ user: { login: 'u2' }, state: 'COMMENTED' }
				])
			),
			http.get(`${API}/repos/o/r/commits/sha7/check-runs`, () =>
				HttpResponse.json({
					check_runs: [
						{ status: 'completed', conclusion: 'success' },
						{ status: 'completed', conclusion: 'failure' }
					]
				})
			)
		);
		const [pr] = await forge().listPrs('o/r', 'open');
		expect(pr).toMatchObject({
			number: 7,
			draft: true,
			state: 'open',
			headRef: 'h',
			baseRef: 'main',
			labels: ['a', 'b'],
			mergeable: null,
			reviewState: 'changes_requested',
			checks: 'failure'
		});
	});

	it('reuses the installation client: one token exchange across operations', async () => {
		let tokenHits = 0;
		server.use(
			http.post(`${API}/app/installations/42/access_tokens`, () => {
				tokenHits++;
				return HttpResponse.json(
					{ token: 'ghs_x', expires_at: new Date(Date.now() + 3600_000).toISOString() },
					{ status: 201 }
				);
			}),
			http.get(`${API}/repos/o/r/collaborators/jan/permission`, () =>
				HttpResponse.json({ permission: 'read' })
			),
			http.post(`${API}/repos/o/r/issues/1/comments`, () => HttpResponse.json({}, { status: 201 }))
		);
		const f = forge();
		await f.collaboratorPermission('o/r', 'jan');
		await f.comment('o/r', 1, 'x');
		await f.collaboratorPermission('o/r', 'jan');
		expect(tokenHits).toBe(1);
	});

	it('bounds listPrs concurrency to 5', async () => {
		let active = 0;
		let peak = 0;
		const prs = Array.from({ length: 12 }, (_, n) => ({
			number: n + 1,
			title: 't',
			body: '',
			draft: false,
			state: 'open',
			merged_at: null,
			head: { ref: 'h', sha: `s${n + 1}` },
			base: { ref: 'main' },
			html_url: 'u',
			labels: [],
			updated_at: '2026-01-01T00:00:00Z',
			mergeable: true
		}));
		const track = async <T,>(v: T) => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 5));
			active--;
			return HttpResponse.json(v as never);
		};
		server.use(
			http.get(`${API}/repos/o/r/pulls`, () => HttpResponse.json(prs)),
			http.get(`${API}/repos/o/r/pulls/:n/reviews`, () => track([])),
			http.get(`${API}/repos/o/r/commits/:sha/check-runs`, () => track({ check_runs: [] }))
		);
		const res = await forge().listPrs('o/r', 'open');
		expect(res).toHaveLength(12);
		expect(peak).toBeLessThanOrEqual(10);
	});

	it('treats a 403 with retry-after as rate limited', async () => {
		server.use(
			http.put(`${API}/repos/o/r/pulls/3/merge`, () =>
				HttpResponse.json({ message: 'You have exceeded a secondary thing' }, {
					status: 403,
					headers: { 'retry-after': '30' }
				})
			)
		);
		const err = await forge()
			.merge('o/r', 3, 't')
			.catch((e) => e);
		expect(err.message).toBe('GitHub-limiet bereikt, probeer het later');
	});
});
