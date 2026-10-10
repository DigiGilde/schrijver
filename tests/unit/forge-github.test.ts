import { generateKeyPairSync } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { GitHubForge } from '../../src/lib/forge/github';
import { ForgeError, MAX_CONVERSATION } from '../../src/lib/forge/types';

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
	it('says when GitHub cut the tree listing off', async () => {
		let truncated = false;
		server.use(
			http.get(`${API}/repos/o/r/git/trees/main`, () =>
				HttpResponse.json({
					truncated,
					tree: [
						{ path: 'docs/a.md', type: 'blob', sha: 'a' },
						{ path: 'docs', type: 'tree', sha: 'd' }
					]
				})
			)
		);
		const whole = await forge().readTree('o/r', 'main', '');
		expect(whole).toEqual([{ path: 'docs/a.md', sha: 'a' }]);
		expect(whole.truncated).toBeUndefined();
		truncated = true;
		const cut = await forge().readTree('o/r', 'main', 'docs');
		expect([...cut]).toEqual([{ path: 'docs/a.md', sha: 'a' }]);
		expect(cut.truncated).toBe(true);
	});

	it('lists the files of a pull request, with the old path of a renamed one', async () => {
		server.use(
			http.get(`${API}/repos/o/r/pulls/7/files`, ({ request }) => {
				record('perPage', new URL(request.url).searchParams.get('per_page'));
				return HttpResponse.json([
					{ filename: 'docs/a.md', status: 'modified' },
					{ filename: 'docs/b.png', status: 'renamed', previous_filename: 'docs/oud.png' },
					{ filename: 'docs/c.png', status: 'removed' },
					{ filename: 'docs/d.md', status: 'added' }
				]);
			})
		);
		expect(await forge().prFiles('o/r', 7)).toEqual([
			{ path: 'docs/a.md', status: 'modified' },
			{ path: 'docs/b.png', status: 'modified', previous: 'docs/oud.png' },
			{ path: 'docs/c.png', status: 'removed' },
			{ path: 'docs/d.md', status: 'added' }
		]);
		expect(bodies.perPage).toEqual(['100']);
	});

	it('pages through the files of a pull request, up to the 3,000 GitHub lists', async () => {
		let total = 250;
		const pages: number[] = [];
		server.use(
			http.get(`${API}/repos/o/r/pulls/8/files`, ({ request }) => {
				const query = new URL(request.url).searchParams;
				const page = Number(query.get('page'));
				const perPage = Number(query.get('per_page'));
				pages.push(page);
				const start = (page - 1) * perPage;
				const count = Math.max(0, Math.min(perPage, total - start));
				return HttpResponse.json(
					Array.from({ length: count }, (_, i) => ({
						filename: `docs/${start + i}.md`,
						status: 'added'
					}))
				);
			})
		);
		const files = await forge().prFiles('o/r', 8);
		expect(files).toHaveLength(250);
		expect(files.at(-1)).toEqual({ path: 'docs/249.md', status: 'added' });
		expect(pages).toEqual([1, 2, 3]);

		total = 5000;
		pages.length = 0;
		const capped = await forge().prFiles('o/r', 8);
		expect(capped).toHaveLength(3000);
		expect(pages).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
	});

	it('reports a file above maxBytes without downloading its blob', async () => {
		let blobRequests = 0;
		server.use(
			http.get(`${API}/repos/o/r/contents/:path`, () =>
				HttpResponse.json({ type: 'file', size: 2_000_000, sha: 'big', content: '' })
			),
			http.get(`${API}/repos/o/r/git/blobs/big`, () => {
				blobRequests++;
				return HttpResponse.json({ content: '' });
			})
		);
		const file = await forge().readFile('o/r', 'main', 'groot.md', { maxBytes: 500_000 });
		expect(file).toEqual({ content: new Uint8Array(), sha: 'big', tooLarge: true });
		expect(blobRequests).toBe(0);
	});

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

	it('deletes a file through a tree entry with a null sha, without a blob', async () => {
		server.use(
			http.get(`${API}/repos/o/r/git/ref/heads/x`, () =>
				HttpResponse.json({ object: { sha: 'head1' } })
			),
			http.get(`${API}/repos/o/r/git/commits/head1`, () =>
				HttpResponse.json({ sha: 'head1', tree: { sha: 'tree0' } })
			),
			http.post(`${API}/repos/o/r/git/blobs`, async ({ request }) => {
				record('blob', await request.json());
				return HttpResponse.json({ sha: 'blob1' }, { status: 201 });
			}),
			http.post(`${API}/repos/o/r/git/trees`, async ({ request }) => {
				record('tree', await request.json());
				return HttpResponse.json({ sha: 'tree1' }, { status: 201 });
			}),
			http.post(`${API}/repos/o/r/git/commits`, () =>
				HttpResponse.json({ sha: 'commit1', verification: { verified: true } }, { status: 201 })
			),
			http.patch(`${API}/repos/o/r/git/refs/heads/x`, () => HttpResponse.json({}))
		);
		await forge().commit(
			'o/r',
			'x',
			[
				{ path: 'docs/a.md', content: 'Zonder kat' },
				{ path: 'docs/afbeeldingen/a/kat.png', deleted: true }
			],
			'msg'
		);
		expect(bodies.blob).toHaveLength(1);
		expect(bodies.tree[0]).toEqual({
			base_tree: 'tree0',
			tree: [
				{ path: 'docs/a.md', mode: '100644', type: 'blob', sha: 'blob1' },
				{ path: 'docs/afbeeldingen/a/kat.png', mode: '100644', type: 'blob', sha: null }
			]
		});
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

	it('marks a comment as the App own only when its own bot account posted it', async () => {
		let appRequests = 0;
		const comment = (id: number, login: string, type: string, appId: number | null) => ({
			id,
			user: { login, type },
			body: `Opmerking ${id}`,
			created_at: '2026-10-09T10:00:00Z',
			html_url: `https://github.com/o/r/pull/7#issuecomment-${id}`,
			performed_via_github_app: appId === null ? null : { id: appId, slug: 'x' }
		});
		server.use(
			http.get(`${API}/app`, () => {
				appRequests++;
				return HttpResponse.json({ id: 1, slug: 'schrijver' });
			}),
			http.get(`${API}/repos/o/r/issues/7/comments`, () =>
				HttpResponse.json([
					comment(11, 'schrijver[bot]', 'Bot', 1),
					// A person acting through the App with a user token: the App is named, the person posted.
					comment(12, 'jansen', 'User', 1),
					comment(13, 'ander[bot]', 'Bot', 99),
					comment(14, 'schrijver[bot]', 'User', null),
					{ ...comment(15, 'pietersen', 'User', null), body: null }
				])
			)
		);
		const f = forge();
		const comments = await f.prComments('o/r', 7);
		expect(comments.map((c) => [c.id, c.login, c.byApp])).toEqual([
			[11, 'schrijver[bot]', true],
			[12, 'jansen', false],
			[13, 'ander[bot]', false],
			[14, 'schrijver[bot]', false],
			[15, 'pietersen', false]
		]);
		expect(comments[0]).toEqual({
			id: 11,
			login: 'schrijver[bot]',
			body: 'Opmerking 11',
			createdAt: '2026-10-09T10:00:00Z',
			url: 'https://github.com/o/r/pull/7#issuecomment-11',
			byApp: true
		});
		expect(comments[4].body).toBe('');
		await f.prComments('o/r', 7);
		expect(appRequests).toBe(1);
	});

	it('trusts no comment as the App own when GitHub does not say which account the App is', async () => {
		server.use(
			http.get(`${API}/app`, () => HttpResponse.json({ message: 'kapot' }, { status: 500 })),
			http.get(`${API}/repos/o/r/issues/7/comments`, () =>
				HttpResponse.json([
					{
						id: 11,
						user: { login: 'schrijver[bot]', type: 'Bot' },
						body: 'x',
						created_at: '2026-10-09T10:00:00Z',
						html_url: 'https://github.com/o/r/pull/7#issuecomment-11',
						performed_via_github_app: { id: 1, slug: 'schrijver' }
					}
				])
			)
		);
		expect((await forge().prComments('o/r', 7)).map((c) => c.byApp)).toEqual([false]);
	});

	it('pages through the comments, up to the conversation limit', async () => {
		const pages: number[] = [];
		server.use(
			http.get(`${API}/repos/o/r/issues/8/comments`, ({ request }) => {
				const query = new URL(request.url).searchParams;
				const page = Number(query.get('page'));
				pages.push(page);
				const start = (page - 1) * Number(query.get('per_page'));
				return HttpResponse.json(
					Array.from({ length: start < 350 ? Math.min(100, 350 - start) : 0 }, (_, i) => ({
						id: start + i,
						user: { login: 'jansen' },
						body: 'x',
						created_at: '2026-10-09T10:00:00Z',
						performed_via_github_app: null
					}))
				);
			})
		);
		const comments = await forge().prComments('o/r', 8);
		expect(comments).toHaveLength(MAX_CONVERSATION);
		expect(pages).toEqual([1, 2, 3]);
	});

	it('lists the commits with their author, paging up to the 250 GitHub lists', async () => {
		let total = 2;
		const pages: number[] = [];
		server.use(
			http.get(`${API}/repos/o/r/pulls/7/commits`, ({ request }) => {
				const query = new URL(request.url).searchParams;
				const page = Number(query.get('page'));
				pages.push(page);
				const start = (page - 1) * Number(query.get('per_page'));
				return HttpResponse.json(
					Array.from({ length: Math.max(0, Math.min(100, total - start)) }, (_, i) => ({
						sha: `s${start + i}`,
						commit: { message: `Bericht ${start + i}` },
						author: start + i === 1 ? null : { login: 'schrijver[bot]' }
					}))
				);
			})
		);
		expect(await forge().prCommits('o/r', 7)).toEqual([
			{ sha: 's0', message: 'Bericht 0', author: 'schrijver[bot]' },
			{ sha: 's1', message: 'Bericht 1', author: null }
		]);
		total = 400;
		pages.length = 0;
		expect(await forge().prCommits('o/r', 7)).toHaveLength(250);
		expect(pages).toEqual([1, 2, 3]);
	});

	it('lists the submitted reviews with their verdict, without pending ones', async () => {
		server.use(
			http.get(`${API}/repos/o/r/pulls/7/reviews`, ({ request }) => {
				record('reviewPage', new URL(request.url).searchParams.get('per_page'));
				return HttpResponse.json([
					{
						id: 21,
						user: { login: 'jansen' },
						state: 'CHANGES_REQUESTED',
						body: 'Graag korter',
						submitted_at: '2026-10-09T10:00:00Z',
						html_url: 'https://github.com/o/r/pull/7#pullrequestreview-21'
					},
					{
						id: 22,
						user: { login: 'pietersen' },
						state: 'PENDING',
						body: '',
						html_url: 'https://github.com/o/r/pull/7#pullrequestreview-22'
					},
					{
						id: 23,
						user: { login: 'jansen' },
						state: 'APPROVED',
						body: '',
						submitted_at: '2026-10-09T12:00:00Z',
						html_url: 'https://github.com/o/r/pull/7#pullrequestreview-23'
					}
				]);
			})
		);
		expect(await forge().prReviews('o/r', 7)).toEqual([
			{
				id: 21,
				login: 'jansen',
				state: 'changes_requested',
				body: 'Graag korter',
				submittedAt: '2026-10-09T10:00:00Z',
				url: 'https://github.com/o/r/pull/7#pullrequestreview-21'
			},
			{
				id: 23,
				login: 'jansen',
				state: 'approved',
				body: '',
				submittedAt: '2026-10-09T12:00:00Z',
				url: 'https://github.com/o/r/pull/7#pullrequestreview-23'
			}
		]);
		expect(bodies.reviewPage).toEqual(['100']);
	});

	it('says who opened a pull request and when it was merged', async () => {
		server.use(
			http.get(`${API}/repos/o/r/pulls/9`, () =>
				HttpResponse.json({
					number: 9,
					title: 'T',
					body: '',
					draft: false,
					state: 'closed',
					merged_at: '2026-10-09T15:00:00Z',
					merge_commit_sha: 'c'.repeat(40),
					user: { login: 'jansen' },
					head: { ref: 'h', sha: 'sha9' },
					base: { ref: 'main' },
					html_url: 'https://github.com/o/r/pull/9',
					labels: [],
					updated_at: '2026-10-09T15:00:00Z',
					mergeable: null
				})
			),
			http.get(`${API}/repos/o/r/pulls/9/reviews`, () => HttpResponse.json([])),
			http.get(`${API}/repos/o/r/commits/sha9/check-runs`, () =>
				HttpResponse.json({ check_runs: [] })
			)
		);
		expect(await forge().getPr('o/r', 9)).toMatchObject({
			state: 'merged',
			author: 'jansen',
			mergedAt: '2026-10-09T15:00:00Z',
			mergeCommitSha: 'c'.repeat(40)
		});
	});

	it('reads the head of a pull request in one call, without its reviews and checks', async () => {
		let calls = 0;
		server.use(
			http.get(`${API}/repos/o/r/pulls/9`, () => {
				calls++;
				return HttpResponse.json({
					number: 9,
					head: { ref: 'schrijver/site/x', sha: 'sha9', repo: { full_name: 'O/R' } },
					base: { ref: 'main' },
					merged_at: null,
					merge_commit_sha: 'd'.repeat(40)
				});
			})
		);
		expect(await forge().prHead('o/r', 9)).toEqual({
			headRef: 'schrijver/site/x',
			headSha: 'sha9',
			headRepo: 'O/R',
			baseRef: 'main',
			mergeCommitSha: null
		});
		expect(calls).toBe(1);
		server.use(
			http.get(`${API}/repos/o/r/pulls/9`, () =>
				HttpResponse.json({
					number: 9,
					head: { ref: 'h', sha: 's', repo: null },
					base: { ref: 'main' }
				})
			)
		);
		expect((await forge().prHead('o/r', 9)).headRepo).toBe('');
		for (const [sha, expected] of [
			['e'.repeat(40), 'e'.repeat(40)],
			['geen-commit', null],
			[null, null]
		]) {
			server.use(
				http.get(`${API}/repos/o/r/pulls/9`, () =>
					HttpResponse.json({
						number: 9,
						head: { ref: 'h', sha: 's', repo: null },
						base: { ref: 'main' },
						merged_at: '2026-10-09T15:00:00Z',
						merge_commit_sha: sha
					})
				)
			);
			expect((await forge().prHead('o/r', 9)).mergeCommitSha, String(sha)).toBe(expected);
		}
	});

	it("reads a commit's first parent from the commit object", async () => {
		const asked: string[] = [];
		server.use(
			http.get(`${API}/repos/o/r/git/commits/:sha`, ({ params }) => {
				asked.push(String(params.sha));
				return HttpResponse.json({
					sha: params.sha,
					parents: [{ sha: 'a'.repeat(40) }, { sha: 'b'.repeat(40) }]
				});
			})
		);
		expect(await forge().firstParent('o/r', 'c'.repeat(40))).toBe('a'.repeat(40));
		expect(asked).toEqual(['c'.repeat(40)]);
		for (const parents of [[], [{}], [{ sha: 'abc' }], undefined]) {
			server.use(
				http.get(`${API}/repos/o/r/git/commits/:sha`, () => HttpResponse.json({ parents }))
			);
			await expect(forge().firstParent('o/r', 'c'.repeat(40))).rejects.toMatchObject({
				status: 502
			});
		}
		server.use(
			http.get(`${API}/repos/o/r/git/commits/:sha`, () =>
				HttpResponse.json({ message: 'Not Found' }, { status: 404 })
			)
		);
		await expect(forge().firstParent('o/r', 'c'.repeat(40))).rejects.toMatchObject({
			status: 404
		});
	});

	it('finds where a pull request started with one compare call, asked for one commit', async () => {
		const asked: { path: string; perPage: string | null }[] = [];
		server.use(
			http.get(`${API}/repos/o/r/compare/:basehead`, ({ request }) => {
				const url = new URL(request.url);
				asked.push({ path: url.pathname, perPage: url.searchParams.get('per_page') });
				return HttpResponse.json({
					merge_base_commit: { sha: 'b'.repeat(40) },
					ahead_by: 3,
					files: []
				});
			})
		);
		const head = 'a'.repeat(40);
		expect(await forge().mergeBase('o/r', 'main', head)).toBe('b'.repeat(40));
		expect(asked).toEqual([{ path: `/repos/o/r/compare/main...${head}`, perPage: '1' }]);
	});

	it('fails the merge base when GitHub names no commit, and passes its refusal on', async () => {
		const answer = (status: number, body: Record<string, unknown>) =>
			server.use(
				http.get(`${API}/repos/o/r/compare/:basehead`, () => HttpResponse.json(body, { status }))
			);
		for (const body of [{}, { merge_base_commit: {} }, { merge_base_commit: { sha: 'abc' } }]) {
			answer(200, body);
			await expect(forge().mergeBase('o/r', 'main', 'c'.repeat(40))).rejects.toMatchObject({
				status: 502
			});
		}
		answer(404, { message: 'No common ancestor between main and x' });
		await expect(forge().mergeBase('o/r', 'main', 'x')).rejects.toMatchObject({
			status: 404,
			detail: 'No common ancestor between main and x'
		});
	});

	it('says who asks for changes and whose review GitHub waits for', async () => {
		server.use(
			http.get(`${API}/repos/o/r/pulls/8`, () =>
				HttpResponse.json({
					number: 8,
					title: 'T',
					body: '',
					draft: false,
					state: 'open',
					merged_at: null,
					head: { ref: 'h', sha: 'sha8' },
					base: { ref: 'main' },
					html_url: 'https://github.com/o/r/pull/8',
					labels: [],
					updated_at: '2026-10-10T09:00:00Z',
					mergeable: true,
					requested_reviewers: [{ login: 'u2' }, { login: 'u4' }]
				})
			),
			http.get(`${API}/repos/o/r/pulls/8/reviews`, () =>
				HttpResponse.json([
					{ user: { login: 'u1' }, state: 'CHANGES_REQUESTED' },
					{ user: { login: 'u1' }, state: 'APPROVED' },
					{ user: { login: 'u2' }, state: 'CHANGES_REQUESTED' },
					{ user: { login: 'u2' }, state: 'COMMENTED' },
					{ user: { login: 'u3' }, state: 'CHANGES_REQUESTED' }
				])
			),
			http.get(`${API}/repos/o/r/commits/sha8/check-runs`, () =>
				HttpResponse.json({ check_runs: [] })
			)
		);
		expect(await forge().getPr('o/r', 8)).toMatchObject({
			reviewState: 'changes_requested',
			changesRequestedBy: ['u2', 'u3'],
			requestedReviewers: ['u2', 'u4']
		});
	});

	it('reads the review decision through GraphQL, null where no review is required', async () => {
		const answers: (string | null)[] = ['REVIEW_REQUIRED', 'APPROVED', 'CHANGES_REQUESTED', null];
		server.use(
			http.post(`${API}/graphql`, async ({ request }) => {
				record('gql', await request.json());
				return HttpResponse.json({
					data: { repository: { pullRequest: { reviewDecision: answers.shift() } } }
				});
			})
		);
		const f = forge();
		expect(await f.reviewDecision('o/r', 7)).toBe('review_required');
		expect(await f.reviewDecision('o/r', 7)).toBe('approved');
		expect(await f.reviewDecision('o/r', 7)).toBe('changes_requested');
		expect(await f.reviewDecision('o/r', 7)).toBeNull();
		expect(bodies.gql[0]).toMatchObject({ variables: { owner: 'o', name: 'r', number: 7 } });
		expect(JSON.stringify(bodies.gql[0])).toContain('reviewDecision');
	});

	it('fails the review decision with a ForgeError when GitHub answers with errors', async () => {
		server.use(
			http.post(`${API}/graphql`, () =>
				HttpResponse.json({
					data: null,
					errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a PullRequest' }]
				})
			)
		);
		await expect(forge().reviewDecision('o/r', 7)).rejects.toBeInstanceOf(ForgeError);
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

	describe('asking reviewers to review again', () => {
		const RE = `${API}/repos/o/r/pulls/7/requested_reviewers/rerequest`;
		const PLAIN = `${API}/repos/o/r/pulls/7/requested_reviewers`;
		const created = () => HttpResponse.json({}, { status: 201 });

		it('uses the rerequest route of GitHub, and only that', async () => {
			server.use(
				http.post(RE, async ({ request }) => {
					record('rerequest', await request.json());
					return created();
				})
			);
			await forge().rerequestReviewers('o/r', 7, ['jan', 'piet']);
			expect(bodies.rerequest).toEqual([{ reviewers: ['jan', 'piet'] }]);
		});

		it('falls back to the plain request where GitHub has no such route', async () => {
			server.use(
				http.post(RE, () => HttpResponse.json({ message: 'Not Found' }, { status: 404 })),
				http.post(PLAIN, async ({ request }) => {
					record('plain', await request.json());
					return created();
				})
			);
			await forge().rerequestReviewers('o/r', 7, ['jan']);
			expect(bodies.plain).toEqual([{ reviewers: ['jan'] }]);
		});

		it('does not fall back for any other refusal, such as a reviewer who is no collaborator', async () => {
			let plain = 0;
			server.use(
				http.post(RE, () =>
					HttpResponse.json(
						{ message: 'Reviews may only be requested from collaborators' },
						{ status: 422 }
					)
				),
				http.post(PLAIN, () => {
					plain++;
					return created();
				})
			);
			await expect(forge().rerequestReviewers('o/r', 7, ['jan'])).rejects.toMatchObject({
				status: 422,
				detail: 'Reviews may only be requested from collaborators'
			});
			expect(plain).toBe(0);
		});

		it('fails when the plain request is not found either', async () => {
			server.use(
				http.post(RE, () => HttpResponse.json({ message: 'Not Found' }, { status: 404 })),
				http.post(PLAIN, () => HttpResponse.json({ message: 'Not Found' }, { status: 404 }))
			);
			await expect(forge().rerequestReviewers('o/r', 7, ['jan'])).rejects.toMatchObject({
				status: 404
			});
		});
	});

	it('adds and takes off one label at a time, and takes a label that is not there as gone', async () => {
		const deleted: string[] = [];
		server.use(
			http.post(`${API}/repos/o/r/issues/7/labels`, async ({ request }) => {
				record('added', await request.json());
				return HttpResponse.json([{ name: 'preview' }, { name: 'aanpassing gevraagd' }]);
			}),
			http.delete(`${API}/repos/o/r/issues/7/labels/:name`, ({ request, params }) => {
				deleted.push(new URL(request.url).pathname);
				return params.name === 'weg'
					? HttpResponse.json({ message: 'Label does not exist' }, { status: 404 })
					: HttpResponse.json([{ name: 'preview' }]);
			})
		);
		const f = forge();
		await f.addLabel('o/r', 7, 'aanpassing gevraagd');
		expect(bodies.added).toEqual([{ labels: ['aanpassing gevraagd'] }]);
		await f.removeLabel('o/r', 7, 'aanpassing gevraagd');
		await f.removeLabel('o/r', 7, 'weg');
		expect(deleted).toEqual([
			'/repos/o/r/issues/7/labels/aanpassing%20gevraagd',
			'/repos/o/r/issues/7/labels/weg'
		]);
		server.use(
			http.delete(`${API}/repos/o/r/issues/7/labels/:name`, () =>
				HttpResponse.json({ message: 'kapot' }, { status: 500 })
			)
		);
		await expect(f.removeLabel('o/r', 7, 'preview')).rejects.toBeInstanceOf(ForgeError);
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
		const track = async <T>(v: T) => {
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
				HttpResponse.json(
					{ message: 'You have exceeded a secondary thing' },
					{
						status: 403,
						headers: { 'retry-after': '30' }
					}
				)
			)
		);
		const err = await forge()
			.merge('o/r', 3, 't')
			.catch((e) => e);
		expect(err.message).toMatch(/^GitHub-limiet bereikt, probeer het na \d\d:\d\d opnieuw$/);
	});

	it('says when the primary rate limit resets', async () => {
		const reset = Date.UTC(2030, 0, 1, 12, 5) / 1000;
		server.use(
			http.put(`${API}/repos/o/r/pulls/3/merge`, () =>
				HttpResponse.json(
					{ message: 'API rate limit exceeded' },
					{ status: 403, headers: { 'x-ratelimit-reset': String(reset) } }
				)
			)
		);
		const err = await forge()
			.merge('o/r', 3, 't')
			.catch((e) => e);
		expect(err.message).toBe('GitHub-limiet bereikt, probeer het na 13:05 opnieuw');
	});

	it('describes a repository the App is installed on, by its numeric id', async () => {
		server.use(
			http.get(`${API}/repos/o/r`, () =>
				HttpResponse.json({
					id: 4242,
					full_name: 'O/R',
					default_branch: 'trunk',
					description: 'Een site',
					homepage: 'https://example.org/',
					private: true
				})
			)
		);
		expect(await forge().repository('o/r')).toEqual({
			id: 4242,
			fullName: 'O/R',
			defaultBranch: 'trunk',
			description: 'Een site',
			homepage: 'https://example.org/',
			isPublic: false
		});
		server.use(
			http.get(`${API}/repos/o/r`, () =>
				HttpResponse.json({
					id: 4242,
					full_name: 'o/r',
					default_branch: 'main',
					description: null,
					homepage: '',
					private: false
				})
			)
		);
		expect(await forge().repository('o/r')).toMatchObject({
			description: null,
			homepage: null,
			isPublic: true
		});
	});

	it('looks the installation up again for every repository check: an App that left or came back shows at once', async () => {
		let installation: number | null = 42;
		server.use(
			http.get(`${API}/repos/o/r/installation`, () =>
				installation === null
					? HttpResponse.json({ message: 'Not Found' }, { status: 404 })
					: HttpResponse.json({ id: installation })
			),
			http.post(`${API}/app/installations/43/access_tokens`, () =>
				HttpResponse.json(
					{ token: 'ghs_y', expires_at: new Date(Date.now() + 3600_000).toISOString() },
					{ status: 201 }
				)
			),
			http.get(`${API}/repos/o/r`, ({ request }) => {
				record('token', request.headers.get('authorization'));
				return HttpResponse.json({ id: 4242, full_name: 'o/r', default_branch: 'main' });
			})
		);
		const f = forge();
		expect(await f.repository('o/r')).toMatchObject({ id: 4242 });
		installation = null;
		expect(await f.repository('o/r')).toBeNull();
		installation = 43;
		expect(await f.repository('o/r')).toMatchObject({ id: 4242 });
		expect(bodies.token).toEqual(['token ghs_x', 'token ghs_y']);
	});

	it('answers no repository where the App is not installed, and fails on anything else', async () => {
		server.use(
			http.get(`${API}/repos/o/elders/installation`, () =>
				HttpResponse.json({ message: 'Not Found' }, { status: 404 })
			)
		);
		expect(await forge().repository('o/elders')).toBeNull();
		server.use(
			http.get(`${API}/repos/o/r`, () => HttpResponse.json({ message: 'x' }, { status: 500 }))
		);
		await expect(forge().repository('o/r')).rejects.toBeInstanceOf(ForgeError);
		server.use(http.get(`${API}/repos/o/r`, () => HttpResponse.json({ full_name: 'o/r' })));
		await expect(forge().repository('o/r')).rejects.toBeInstanceOf(ForgeError);
	});

	it('gives the page where an owner installs the App, and nothing GitHub did not say', async () => {
		let appRequests = 0;
		server.use(
			http.get(`${API}/app`, () => {
				appRequests++;
				return HttpResponse.json({
					id: 1,
					slug: 'schrijver',
					html_url: 'https://github.com/apps/schrijver'
				});
			})
		);
		const f = forge();
		expect(await f.installUrl()).toBe('https://github.com/apps/schrijver/installations/new');
		expect(await f.appLogin()).toBe('schrijver[bot]');
		expect(appRequests).toBe(1);

		for (const html_url of ['javascript:alert(1)', 'http://github.com/apps/x', null]) {
			server.use(http.get(`${API}/app`, () => HttpResponse.json({ id: 1, slug: 'x', html_url })));
			expect(await forge().installUrl(), String(html_url)).toBeNull();
		}
		server.use(
			http.get(`${API}/app`, () => HttpResponse.json({ message: 'kapot' }, { status: 500 }))
		);
		expect(await forge().installUrl()).toBeNull();
	});
});
