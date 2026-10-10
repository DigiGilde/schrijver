import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startingSettings } from '$lib/auth/team';
import { MemoryTeamStore } from '$lib/auth/team-memory';
import { useTeamStore } from '$lib/auth/team-store';
import { CachingForge } from '$lib/forge/cache';
import { FakeForge } from '$lib/forge/fake';

vi.mock('$lib/log', () => ({
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
	errorFields: (err: unknown) => ({ error: err instanceof Error ? err.name : typeof err })
}));

const reloadSite = vi.fn(async (_siteId: string) => {});
const fake = new FakeForge();
const forge = new CachingForge(fake);
const invalidate = vi.spyOn(forge, 'invalidate');

vi.mock('$lib/server/services', () => ({
	reloadSite: (siteId: string) => reloadSite(siteId),
	getForge: () => forge
}));

const { log } = await import('$lib/log');
const { POST } = await import('../../src/routes/api/webhook/github/+server');
const SECRET = 's3cret';
const SITE = 'Org/site';
let team: MemoryTeamStore;

function call(event: string, payload: unknown, sig?: string | null) {
	const body = JSON.stringify(payload);
	const headers: Record<string, string> = { 'x-github-event': event };
	if (sig !== null)
		headers['x-hub-signature-256'] =
			sig ?? 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
	return POST({
		request: new Request('http://x/api/webhook/github', { method: 'POST', body, headers })
	} as never);
}

const push = (over: Record<string, unknown> = {}, repository: Record<string, unknown> = {}) => ({
	ref: 'refs/heads/main',
	repository: { id: 7, full_name: SITE, default_branch: 'main', ...repository },
	...over
});

beforeEach(async () => {
	process.env.GITHUB_WEBHOOK_SECRET = SECRET;
	reloadSite.mockClear();
	invalidate.mockClear();
	vi.mocked(log.error).mockClear();
	team = new MemoryTeamStore();
	await team.addSite(
		{ id: 'site', repoId: 7, repo: SITE, standaardbranch: 'main' },
		startingSettings('Site'),
		null,
		null
	);
	useTeamStore(team);
});

describe('github webhook', () => {
	it('ignores a payload without a string repository name', async () => {
		const res = await call('push', { repository: { full_name: 42 } });
		expect(res.status).toBe(204);
		expect(invalidate).not.toHaveBeenCalled();
		expect(reloadSite).not.toHaveBeenCalled();
	});

	it('rejects a bad, a missing and a malformed signature', async () => {
		expect((await call('push', push(), 'sha256=' + '0'.repeat(64))).status).toBe(401);
		expect((await call('push', push(), null)).status).toBe(401);
		expect((await call('push', push(), 'sha256=zz')).status).toBe(401);
		expect(reloadSite).not.toHaveBeenCalled();
	});

	it('reloads the site of a push to the default branch of its repository', async () => {
		const res = await call('push', push());
		expect(res.status).toBe(204);
		expect(reloadSite).toHaveBeenCalledWith('site');
		expect(invalidate).toHaveBeenCalledWith(SITE);
	});

	it('knows the repository by its id, and follows a new name and a new default branch', async () => {
		const res = await call(
			'push',
			push({ ref: 'refs/heads/trunk' }, { full_name: 'Nieuw/naam', default_branch: 'trunk' })
		);
		expect(res.status).toBe(204);
		expect(reloadSite).toHaveBeenCalledWith('site');
		expect(invalidate).toHaveBeenCalledWith('Nieuw/naam');
		expect(invalidate).toHaveBeenCalledWith(SITE);
		expect((await team.sites())[0]).toMatchObject({
			repo: 'Nieuw/naam',
			standaardbranch: 'trunk'
		});
	});

	it('leaves a push to another branch, or to a repository of no site, to the cache', async () => {
		await call('push', push({ ref: 'refs/heads/schrijver/voorstel' }));
		await call('push', push({}, { id: 8, full_name: 'Org/ander' }));
		await call('push', push({ ref: 'refs/tags/main' }));
		expect(reloadSite).not.toHaveBeenCalled();
		expect(invalidate).toHaveBeenCalledWith('Org/ander');
	});

	it('refuses a name or a branch that is not one, whatever the signature', async () => {
		for (const repository of [
			{ id: '7' },
			{ full_name: 'geen naam' },
			{ default_branch: 'a..b' },
			{ default_branch: 'main x' }
		]) {
			await call('push', push({}, repository));
		}
		expect(reloadSite).not.toHaveBeenCalled();
		expect((await team.sites())[0]).toMatchObject({ repo: SITE, standaardbranch: 'main' });
	});

	it('invalidates on pull_request events without reloading', async () => {
		await call('pull_request', { repository: { id: 7, full_name: SITE } });
		expect(invalidate).toHaveBeenCalledWith(SITE);
		expect(reloadSite).not.toHaveBeenCalled();
	});

	it('ignores other events', async () => {
		const res = await call('ping', push());
		expect(res.status).toBe(204);
		expect(invalidate).not.toHaveBeenCalled();
		expect(reloadSite).not.toHaveBeenCalled();
	});

	it('answers 503 when the registry cannot be read, so GitHub shows the delivery failed', async () => {
		vi.spyOn(team, 'sites').mockRejectedValueOnce(new Error('database down'));
		expect((await call('push', push())).status).toBe(503);
		expect(log.error).toHaveBeenCalledWith('webhook.reload_failed', { repo: SITE, error: 'Error' });
		expect(reloadSite).not.toHaveBeenCalled();
	});
});
