import { beforeEach, describe, expect, it } from 'vitest';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';

const REPO = 'acme/site';
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe('FakeForge', () => {
	let forge: FakeForge;

	beforeEach(() => {
		forge = new FakeForge();
		forge.seedRepo(REPO, 'main', {
			'content/a.md': 'alpha',
			'content/sub/b.md': 'bravo',
			'other/c.md': 'charlie'
		});
	});

	it('reads the tree recursively under a dir', async () => {
		const tree = await forge.readTree(REPO, 'main', 'content');
		expect(tree.map((e) => e.path).sort()).toEqual(['content/a.md', 'content/sub/b.md']);
	});

	it('reads a file and returns null for a missing one', async () => {
		const f = await forge.readFile(REPO, 'main', 'content/a.md');
		expect(dec(f!.content)).toBe('alpha');
		expect(await forge.readFile(REPO, 'main', 'nope.md')).toBeNull();
	});

	it('lists a pull request against the point its branch started from', async () => {
		await forge.createBranch(REPO, 'main', 'voorstel');
		await forge.commit(REPO, 'voorstel', [{ path: 'content/a.md', content: 'alfa' }], 'mijn');
		const pr = await forge.openDraftPr(REPO, 'voorstel', 'main', 'Mijn', '');
		await forge.createBranch(REPO, 'main', 'ander');
		await forge.commit(REPO, 'ander', [{ path: 'other/c.md', content: 'delta' }], 'ander');
		const other = await forge.openDraftPr(REPO, 'ander', 'main', 'Ander', '');
		await forge.merge(REPO, other.number, 'Ander');
		expect(await forge.prFiles(REPO, pr.number)).toEqual([
			{ path: 'content/a.md', status: 'modified' }
		]);
	});

	it('knows the commit a branch was made from, also after the base moved on or took it in', async () => {
		await forge.createBranch(REPO, 'main', 'voorstel');
		const start = (await forge.openDraftPr(REPO, 'voorstel', 'main', 'T', 'B')).headSha;
		const { sha: head } = await forge.commit(
			REPO,
			'voorstel',
			[{ path: 'content/a.md', content: 'alfa' }],
			'mijn'
		);
		await forge.commit(REPO, 'main', [{ path: 'content/a.md', content: 'anders' }], 'op de site');
		expect(await forge.mergeBase(REPO, 'main', head)).toBe(start);
		expect(await forge.mergeBase(REPO, 'main', 'voorstel')).toBe(start);
		expect(forge.fileText(REPO, start, 'content/a.md')).toBe('alpha');
		expect(forge.fileText(REPO, head, 'content/a.md')).toBe('alfa');

		forge.mergeableByPr.set(1, true);
		await forge.merge(REPO, 1, 'Mijn');
		expect(await forge.mergeBase(REPO, 'main', head)).toBe(start);
	});

	it('finds the merge base of a branch made from another branch, and of a head the base holds', async () => {
		await forge.createBranch(REPO, 'main', 'eerst');
		const { sha: first } = await forge.commit(REPO, 'eerst', [], 'een');
		await forge.createBranch(REPO, 'eerst', 'daarna');
		const { sha: second } = await forge.commit(REPO, 'daarna', [], 'twee');
		const seeded = await forge.mergeBase(REPO, 'main', 'eerst');
		expect(await forge.mergeBase(REPO, 'main', second)).toBe(seeded);
		expect(await forge.mergeBase(REPO, 'eerst', second)).toBe(first);
		expect(await forge.mergeBase(REPO, 'main', seeded)).toBe(seeded);
	});

	it('does not know the merge base of a ref it does not have, and can be made to fail', async () => {
		await expect(forge.mergeBase(REPO, 'main', 'ghost')).rejects.toMatchObject({ status: 404 });
		await expect(forge.mergeBase(REPO, 'ghost', 'main')).rejects.toMatchObject({ status: 404 });
		forge.failNext('mergeBase', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await expect(forge.mergeBase(REPO, 'main', 'main')).rejects.toMatchObject({ status: 502 });
		expect(await forge.mergeBase(REPO, 'main', 'main')).toEqual(expect.any(String));
	});

	it('does not hand over a file above maxBytes', async () => {
		const big = await forge.readFile(REPO, 'main', 'content/a.md', { maxBytes: 3 });
		expect(big?.tooLarge).toBe(true);
		expect(big?.content.length).toBe(0);
		const small = await forge.readFile(REPO, 'main', 'content/a.md', { maxBytes: 5 });
		expect(small?.tooLarge).toBeUndefined();
		expect(dec(small!.content)).toBe('alpha');
	});

	it('createBranch copies the tree of the source', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		expect(forge.branches(REPO).sort()).toEqual(['draft', 'main']);
		expect(forge.fileText(REPO, 'draft', 'content/a.md')).toBe('alpha');
	});

	it('createBranch throws 422 when the branch exists', async () => {
		await expect(forge.createBranch(REPO, 'main', 'main')).rejects.toMatchObject({ status: 422 });
	});

	it('commit updates content and sha, and records the message', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		const before = await forge.readFile(REPO, 'draft', 'content/a.md');
		const { sha } = await forge.commit(
			REPO,
			'draft',
			[{ path: 'content/a.md', content: 'changed' }],
			'edit a'
		);
		const after = await forge.readFile(REPO, 'draft', 'content/a.md');
		expect(after!.sha).not.toBe(before!.sha);
		expect(forge.fileText(REPO, 'draft', 'content/a.md')).toBe('changed');
		expect(forge.fileText(REPO, 'main', 'content/a.md')).toBe('alpha');
		expect(forge.commitsOf(REPO, 'draft').at(-1)).toEqual({ sha, message: 'edit a' });
	});

	it('commit deletes a file, which the pull request lists as removed', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.commit(
			REPO,
			'draft',
			[
				{ path: 'content/a.md', content: 'zonder b' },
				{ path: 'content/sub/b.md', deleted: true }
			],
			'weg'
		);
		expect(await forge.readFile(REPO, 'draft', 'content/sub/b.md')).toBeNull();
		expect(forge.fileText(REPO, 'main', 'content/sub/b.md')).toBe('bravo');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		const files = await forge.prFiles(REPO, pr.number);
		expect(files.sort((x, y) => x.path.localeCompare(y.path))).toEqual([
			{ path: 'content/a.md', status: 'modified' },
			{ path: 'content/sub/b.md', status: 'removed' }
		]);
	});

	it('commit refuses to delete a file that is not there, and changes nothing', async () => {
		await expect(
			forge.commit(
				REPO,
				'main',
				[
					{ path: 'content/a.md', content: 'anders' },
					{ path: 'content/weg.md', deleted: true }
				],
				'x'
			)
		).rejects.toMatchObject({ status: 422 });
		expect(forge.fileText(REPO, 'main', 'content/a.md')).toBe('alpha');
		expect(forge.commitsOf(REPO, 'main')).toHaveLength(0);
	});

	it('leaves a file the branch added and deleted again out of the pull request', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.commit(REPO, 'draft', [{ path: 'content/kat.png', content: 'png' }], 'erbij');
		await forge.commit(REPO, 'draft', [{ path: 'content/kat.png', deleted: true }], 'eraf');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		expect(await forge.prFiles(REPO, pr.number)).toEqual([]);
	});

	it('commit throws 404 for an unknown branch', async () => {
		await expect(forge.commit(REPO, 'ghost', [], 'x')).rejects.toMatchObject({ status: 404 });
	});

	it('openDraftPr then listPrs and getPr', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'Title', 'Body');
		expect(pr).toMatchObject({
			number: 1,
			draft: true,
			state: 'open',
			mergeable: true,
			reviewState: 'none',
			checks: 'none',
			labels: [],
			headRef: 'draft',
			baseRef: 'main',
			url: `https://github.com/${REPO}/pulls`
		});
		expect(await forge.listPrs(REPO, 'open')).toHaveLength(1);
		expect((await forge.getPr(REPO, 1)).title).toBe('Title');
		expect(forge.prs.get(1)).toBeDefined();
	});

	it('markReady, approve, updatePr, addLabel change the PR', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		await forge.markReady(REPO, 1);
		await forge.approve(REPO, 1, 'ok');
		await forge.updatePr(REPO, 1, { title: 'T2' });
		await forge.addLabel(REPO, 1, 'x');
		expect(await forge.getPr(REPO, 1)).toMatchObject({
			draft: false,
			reviewState: 'approved',
			title: 'T2',
			body: 'B',
			labels: ['x']
		});
	});

	it('adds and takes off one label at a time, the others untouched', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		await forge.addLabel(REPO, 1, 'preview');
		await forge.addLabel(REPO, 1, 'aanpassing gevraagd');
		await forge.addLabel(REPO, 1, 'preview');
		expect((await forge.getPr(REPO, 1)).labels).toEqual(['preview', 'aanpassing gevraagd']);
		await forge.removeLabel(REPO, 1, 'aanpassing gevraagd');
		await forge.removeLabel(REPO, 1, 'bestaat-niet');
		expect((await forge.getPr(REPO, 1)).labels).toEqual(['preview']);
	});

	it('merge throws 405 when not mergeable', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		forge.mergeableByPr.set(1, false);
		const err = await forge.merge(REPO, 1, 'm').catch((e) => e);
		expect(err).toBeInstanceOf(ForgeError);
		expect(err.status).toBe(405);
		expect(err.message).toBe('Samenvoegen geweigerd');
		expect(err.detail).toBe('Pull request is not mergeable');
	});

	it('keeps the conversation: comments through Schrijver and on GitHub, reviews that judge', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		await forge.comment(REPO, pr.number, 'Via Schrijver');
		forge.commentOnGitHub(REPO, pr.number, 'jansen', 'Op GitHub', '2030-01-01T10:00:00Z');
		forge.reviewOnGitHub(REPO, pr.number, 'jansen', 'changes_requested', 'Korter graag');
		expect((await forge.getPr(REPO, pr.number)).reviewState).toBe('changes_requested');
		forge.reviewOnGitHub(REPO, pr.number, 'jansen', 'commented', '');
		expect((await forge.getPr(REPO, pr.number)).reviewState).toBe('changes_requested');
		forge.reviewOnGitHub(REPO, pr.number, 'jansen', 'approved', '');
		expect((await forge.getPr(REPO, pr.number)).reviewState).toBe('approved');

		forge.commentOnGitHub(REPO, pr.number, 'schrijver[bot]', 'Als de App');
		const comments = await forge.prComments(REPO, pr.number);
		expect(comments).toEqual([
			expect.objectContaining({ login: 'schrijver[bot]', body: 'Via Schrijver', byApp: true }),
			{
				id: expect.any(Number),
				login: 'jansen',
				body: 'Op GitHub',
				createdAt: '2030-01-01T10:00:00Z',
				url: expect.stringContaining('#issuecomment-'),
				byApp: false
			},
			expect.objectContaining({ login: 'schrijver[bot]', body: 'Als de App', byApp: true })
		]);
		expect((await forge.prReviews(REPO, pr.number)).map((r) => [r.login, r.state])).toEqual([
			['jansen', 'changes_requested'],
			['jansen', 'commented'],
			['jansen', 'approved']
		]);
		comments.pop();
		expect(await forge.prComments(REPO, pr.number)).toHaveLength(3);
	});

	it('keeps who asks for changes, and whose review is asked for until they review', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		expect(pr).toMatchObject({ changesRequestedBy: [], requestedReviewers: [] });
		forge.reviewOnGitHub(REPO, pr.number, 'jansen', 'changes_requested', 'Korter');
		forge.reviewOnGitHub(REPO, pr.number, 'pietersen', 'approved', '');
		await forge.requestReviewers(REPO, pr.number, ['jansen', 'de-vries']);
		await forge.requestReviewers(REPO, pr.number, ['jansen']);
		expect(await forge.getPr(REPO, pr.number)).toMatchObject({
			reviewState: 'changes_requested',
			changesRequestedBy: ['jansen'],
			requestedReviewers: ['jansen', 'de-vries']
		});
		forge.reviewOnGitHub(REPO, pr.number, 'jansen', 'approved', '');
		expect(await forge.getPr(REPO, pr.number)).toMatchObject({
			reviewState: 'approved',
			changesRequestedBy: [],
			requestedReviewers: ['de-vries']
		});
	});

	it('asks a reviewer again after their review, which keeps their change request until they review', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		forge.reviewOnGitHub(REPO, pr.number, 'jansen', 'changes_requested', 'Korter');
		expect(await forge.getPr(REPO, pr.number)).toMatchObject({ requestedReviewers: [] });
		await forge.rerequestReviewers(REPO, pr.number, ['jansen']);
		expect(await forge.getPr(REPO, pr.number)).toMatchObject({
			reviewState: 'changes_requested',
			changesRequestedBy: ['jansen'],
			requestedReviewers: ['jansen']
		});
		forge.failNext('rerequestReviewers', new ForgeError(422, 'GitHub weigerde de wijziging'));
		await expect(forge.rerequestReviewers(REPO, pr.number, ['piet'])).rejects.toMatchObject({
			status: 422
		});
		expect(await forge.getPr(REPO, pr.number)).toMatchObject({ requestedReviewers: ['jansen'] });
	});

	it('says who opened a pull request and when it was merged', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		expect(pr).toMatchObject({ author: 'schrijver[bot]', mergedAt: null });
		await forge.merge(REPO, pr.number, 'm');
		expect((await forge.getPr(REPO, pr.number)).mergedAt).toEqual(expect.any(String));
	});

	it('asks for an approval before a merge only where the repository requires one', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		expect(await forge.reviewDecision(REPO, pr.number)).toBeNull();
		forge.requireReview(REPO);
		expect(await forge.reviewDecision(REPO, pr.number)).toBe('review_required');
		await expect(forge.merge(REPO, pr.number, 'm')).rejects.toMatchObject({
			status: 405,
			detail: 'At least 1 approving review is required by reviewers with write access.'
		});
		forge.prs.get(pr.number)!.reviewState = 'changes_requested';
		expect(await forge.reviewDecision(REPO, pr.number)).toBe('changes_requested');
		await forge.approve(REPO, pr.number, 'ok');
		expect(await forge.reviewDecision(REPO, pr.number)).toBe('approved');
		await forge.merge(REPO, pr.number, 'm');
		expect((await forge.getPr(REPO, pr.number)).state).toBe('merged');
	});

	it('merge copies head files into base and marks merged', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.commit(
			REPO,
			'draft',
			[
				{ path: 'content/a.md', content: 'changed' },
				{ path: 'content/new.md', content: 'new' }
			],
			'edit'
		);
		await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		await forge.merge(REPO, 1, 'squash');
		expect(forge.fileText(REPO, 'main', 'content/a.md')).toBe('changed');
		expect(forge.fileText(REPO, 'main', 'content/new.md')).toBe('new');
		expect((await forge.getPr(REPO, 1)).state).toBe('merged');
		expect(await forge.listPrs(REPO, 'open')).toHaveLength(0);
		expect(await forge.listPrs(REPO, 'all')).toHaveLength(1);
	});

	it('merge applies only what a branch changed since it started, deletions included', async () => {
		await forge.commit(REPO, 'main', [{ path: 'content/x.png', content: 'png' }], 'x');
		await forge.createBranch(REPO, 'main', 'p1');
		await forge.createBranch(REPO, 'main', 'p2');
		await forge.commit(
			REPO,
			'p1',
			[
				{ path: 'content/a.md', content: 'alfa' },
				{ path: 'content/x.png', deleted: true }
			],
			'p1'
		);
		await forge.commit(REPO, 'p2', [{ path: 'content/c.md', content: '![x](x.png)' }], 'p2');
		const p1 = await forge.openDraftPr(REPO, 'p1', 'main', 'P1', '');
		const p2 = await forge.openDraftPr(REPO, 'p2', 'main', 'P2', '');
		await forge.merge(REPO, p1.number, 'P1');
		await forge.merge(REPO, p2.number, 'P2');
		expect(forge.fileText(REPO, 'main', 'content/a.md')).toBe('alfa');
		expect(forge.fileText(REPO, 'main', 'content/x.png')).toBeNull();
		expect(forge.fileText(REPO, 'main', 'content/c.md')).toBe('![x](x.png)');
		expect(forge.fileText(REPO, 'main', 'other/c.md')).toBe('charlie');
	});

	it('refuses a merge as not mergeable when the base changed the same file since', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.commit(REPO, 'draft', [{ path: 'content/a.md', content: 'mijn' }], 'mijn');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		await forge.commit(REPO, 'main', [{ path: 'content/a.md', content: 'hun' }], 'hun');
		expect((await forge.getPr(REPO, pr.number)).mergeable).toBe(false);
		await expect(forge.merge(REPO, pr.number, 'm')).rejects.toMatchObject({
			status: 405,
			detail: 'Pull request is not mergeable'
		});
		expect(forge.fileText(REPO, 'main', 'content/a.md')).toBe('hun');
		expect((await forge.getPr(REPO, pr.number)).state).toBe('open');
	});

	it('merges when the base made the same change since the fork', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.commit(REPO, 'draft', [{ path: 'content/sub/b.md', deleted: true }], 'weg');
		const pr = await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		await forge.commit(REPO, 'main', [{ path: 'content/sub/b.md', deleted: true }], 'ook weg');
		expect((await forge.getPr(REPO, pr.number)).mergeable).toBe(true);
		await forge.merge(REPO, pr.number, 'm');
		expect((await forge.getPr(REPO, pr.number)).state).toBe('merged');
	});

	it('prFiles reports added, modified and removed', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.commit(
			REPO,
			'draft',
			[
				{ path: 'content/a.md', content: 'changed' },
				{ path: 'content/new.md', content: 'new' }
			],
			'edit'
		);
		forge.removeFile(REPO, 'draft', 'other/c.md');
		await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		const files = await forge.prFiles(REPO, 1);
		expect(files.sort((x, y) => x.path.localeCompare(y.path))).toEqual([
			{ path: 'content/a.md', status: 'modified' },
			{ path: 'content/new.md', status: 'added' },
			{ path: 'other/c.md', status: 'removed' }
		]);
	});

	it('prFiles lists at most 3,000 files, as GitHub does', async () => {
		await forge.createBranch(REPO, 'main', 'groot');
		await forge.commit(
			REPO,
			'groot',
			Array.from({ length: 3001 }, (_, i) => ({ path: `content/${i}.md`, content: `${i}` })),
			'groot'
		);
		const pr = await forge.openDraftPr(REPO, 'groot', 'main', 'T', 'B');
		expect(await forge.prFiles(REPO, pr.number)).toHaveLength(3000);
	});

	it('collaboratorPermission defaults to none and reads the map', async () => {
		expect(await forge.collaboratorPermission(REPO, 'bob')).toBe('none');
		forge.permissionByLogin.set('bob', 'write');
		expect(await forge.collaboratorPermission(REPO, 'bob')).toBe('write');
	});

	it('failNext throws once for the given operation only', async () => {
		forge.failNext('readFile', new ForgeError(500, 'boom'));
		await expect(forge.readFile(REPO, 'main', 'content/a.md')).rejects.toMatchObject({
			status: 500
		});
		expect(await forge.readFile(REPO, 'main', 'content/a.md')).not.toBeNull();
	});

	it('failNext does not affect other operations', async () => {
		forge.failNext('merge', new ForgeError(500, 'boom'));
		expect(await forge.readTree(REPO, 'main', '')).toHaveLength(3);
	});

	it('setPublic is stored per repo', async () => {
		forge.setPublic(REPO, true);
		expect(await forge.isPublic(REPO)).toBe(true);
	});

	it('describes a repository by its id, whatever the casing of its name', async () => {
		forge.seedRepo(
			'Org/Kennis',
			'trunk',
			{},
			{
				id: 77,
				description: 'Wat we weten',
				homepage: 'https://kennis.example/'
			}
		);
		forge.setPublic('Org/Kennis', true);
		expect(await forge.repository('org/kennis')).toEqual({
			id: 77,
			fullName: 'Org/Kennis',
			defaultBranch: 'trunk',
			description: 'Wat we weten',
			homepage: 'https://kennis.example/',
			isPublic: true
		});
		expect(await forge.repository('org/bestaat-niet')).toBeNull();
		expect((await forge.repository(REPO))?.id).toEqual(expect.any(Number));
		expect(await forge.installUrl()).toBe('https://github.com/apps/schrijver/installations/new');
	});

	it('shows nothing of a repository the App is not installed on', async () => {
		forge.setInstalled(REPO, false);
		expect(await forge.repository(REPO)).toBeNull();
		await expect(forge.readFile(REPO, 'main', 'content/a.md')).rejects.toMatchObject({
			status: 404
		});
		forge.setInstalled(REPO, true);
		expect(await forge.repository(REPO)).not.toBeNull();
	});

	it('follows a renamed repository and a new default branch, keeping its id', async () => {
		const { id } = (await forge.repository(REPO))!;
		await forge.createBranch(REPO, 'main', 'trunk');
		forge.setDefaultBranch(REPO, 'trunk');
		forge.renameRepo(REPO, 'acme/nieuw');
		expect(await forge.repository(REPO)).toMatchObject({
			id,
			fullName: 'acme/nieuw',
			defaultBranch: 'trunk'
		});
		expect(dec((await forge.readFile('acme/nieuw', 'trunk', 'content/a.md'))!.content)).toBe(
			'alpha'
		);
		expect(() => forge.setDefaultBranch('acme/nieuw', 'bestaat-niet')).toThrow(ForgeError);
	});
});
