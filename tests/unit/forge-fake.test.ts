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
			url: `https://github.com/${REPO}/pull/1`
		});
		expect(await forge.listPrs(REPO, 'open')).toHaveLength(1);
		expect((await forge.getPr(REPO, 1)).title).toBe('Title');
		expect(forge.prs.get(1)).toBeDefined();
	});

	it('markReady, approve, updatePr, setLabels change the PR', async () => {
		await forge.createBranch(REPO, 'main', 'draft');
		await forge.openDraftPr(REPO, 'draft', 'main', 'T', 'B');
		await forge.markReady(REPO, 1);
		await forge.approve(REPO, 1, 'ok');
		await forge.updatePr(REPO, 1, { title: 'T2' });
		await forge.setLabels(REPO, 1, ['x']);
		expect(await forge.getPr(REPO, 1)).toMatchObject({
			draft: false,
			reviewState: 'approved',
			title: 'T2',
			body: 'B',
			labels: ['x']
		});
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
});
