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
const reloadConfig = vi.fn(async () => {});
const forgetVisibility = vi.fn((_siteId: string) => {});
const fake = new FakeForge();
const forge = new CachingForge(fake);
const invalidate = vi.spyOn(forge, 'invalidate');

vi.mock('$lib/server/services', () => ({
	reloadSite: (siteId: string) => reloadSite(siteId),
	reloadConfig: () => reloadConfig(),
	getForge: () => forge,
	getConfigStore: () => ({ forgetVisibility })
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
	reloadConfig.mockClear();
	forgetVisibility.mockClear();
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

	describe('a pull request that is merged or closed', () => {
		const closed = (number: number, repository: Record<string, unknown>, action = 'closed') => ({
			action,
			number,
			pull_request: { number, merged: number % 2 === 0 },
			repository
		});

		beforeEach(async () => {
			await team.recordLogin({
				sub: 'jan',
				name: 'Jan',
				email: 'jan@example.org',
				emailVerified: true
			});
			for (const number of [4, 5, 6]) await team.recordWriter('site', number, 'jan');
		});

		it('takes the record of who wrote it along, merged or not, matched by repository id', async () => {
			expect((await call('pull_request', closed(4, { id: 7, full_name: SITE }))).status).toBe(204);
			await call('pull_request', closed(5, { id: 7, full_name: 'Org/nieuwe-naam' }));
			expect(await team.writers('site', 4)).toEqual([]);
			expect(await team.writers('site', 5)).toEqual([]);
			expect(log.info).toHaveBeenCalledWith('webhook.writers_forgotten', { site: 'site', pr: 4 });
		});

		it('keeps it for another event, another repository, or a number that is not one', async () => {
			for (const payload of [
				closed(6, { id: 7, full_name: SITE }, 'synchronize'),
				closed(6, { id: 7, full_name: SITE }, 'reopened'),
				closed(6, { id: 8, full_name: 'Org/ander' }),
				{ ...closed(6, { id: 7, full_name: SITE }), pull_request: { number: '6' } },
				{ ...closed(6, { id: 7, full_name: SITE }), pull_request: null }
			]) {
				await call('pull_request', payload);
			}
			expect(await team.writers('site', 6)).toEqual(['jan']);
		});

		it('answers 503 when the record cannot be deleted, so GitHub can send it again', async () => {
			vi.spyOn(team, 'forgetWriters').mockRejectedValueOnce(new Error('database down'));
			expect((await call('pull_request', closed(4, { id: 7, full_name: SITE }))).status).toBe(503);
			expect(log.error).toHaveBeenCalledWith('webhook.writers_failed', {
				repo: SITE,
				error: 'Error'
			});
		});
	});

	it('ignores other events', async () => {
		const res = await call('ping', push());
		expect(res.status).toBe(204);
		expect(invalidate).not.toHaveBeenCalled();
		expect(reloadSite).not.toHaveBeenCalled();
		expect(reloadConfig).not.toHaveBeenCalled();
	});

	describe('a change to the App installation', () => {
		const repos = (...ids: number[]) =>
			ids.map((id) => ({ id, name: `r${id}`, full_name: `Org/r${id}`, private: false }));

		it('reads again the sites of the repositories the App left or joined, by id', async () => {
			for (const [action, list] of [
				['removed', 'repositories_removed'],
				['added', 'repositories_added']
			]) {
				reloadSite.mockClear();
				const payload = { action, repositories_added: [], repositories_removed: [] };
				const res = await call('installation_repositories', { ...payload, [list]: repos(7, 8) });
				expect(res.status).toBe(204);
				expect(reloadSite.mock.calls).toEqual([['site']]);
				expect(invalidate).toHaveBeenCalledWith(SITE);
			}
			expect(reloadConfig).not.toHaveBeenCalled();
		});

		it('reads again the sites of an installation that is removed, suspended or let back', async () => {
			for (const action of ['deleted', 'suspend', 'unsuspend', 'created']) {
				await call('installation', { action, repositories: repos(7) });
			}
			expect(reloadSite.mock.calls).toEqual([['site'], ['site'], ['site'], ['site']]);
			await call('installation', { action: 'deleted', repositories: repos(8, 9) });
			expect(reloadSite).toHaveBeenCalledTimes(4);
			expect(reloadConfig).not.toHaveBeenCalled();
		});

		it('reads every site again when the event names no repository', async () => {
			await call('installation', { action: 'deleted' });
			await call('installation_repositories', {
				action: 'added',
				repository_selection: 'all',
				repositories_added: [],
				repositories_removed: []
			});
			expect(reloadConfig).toHaveBeenCalledTimes(2);
			expect(reloadSite).not.toHaveBeenCalled();
		});
	});

	describe('a change to a repository', () => {
		const changed = (action: string, repository: Record<string, unknown> = {}) => ({
			action,
			repository: { id: 7, full_name: SITE, default_branch: 'main', ...repository }
		});

		it('follows a repository of a site that is renamed or moved, by its id, and reads it again', async () => {
			await call('repository', changed('renamed', { full_name: 'Org/nieuwe-naam' }));
			expect((await team.sites())[0]).toMatchObject({ repo: 'Org/nieuwe-naam' });
			expect(log.info).toHaveBeenCalledWith('webhook.site_moved', { site: 'site' });
			await call('repository', changed('transferred', { full_name: 'Ander/site' }));
			expect((await team.sites())[0]).toMatchObject({
				repo: 'Ander/site',
				standaardbranch: 'main'
			});
			expect(reloadSite.mock.calls).toEqual([['site'], ['site']]);
			expect(invalidate).toHaveBeenCalledWith(SITE);
		});

		it('closes a site at once whose repository is made private or public, and reads it again', async () => {
			for (const action of ['privatized', 'publicized']) {
				reloadSite.mockImplementationOnce(async () => {
					expect(forgetVisibility).toHaveBeenCalledWith('site');
				});
				await call('repository', changed(action));
			}
			expect(forgetVisibility.mock.calls).toEqual([['site'], ['site']]);
			expect(reloadSite.mock.calls).toEqual([['site'], ['site']]);
			expect(invalidate).toHaveBeenCalledWith(SITE);
			expect((await team.sites())[0]).toMatchObject({ repo: SITE });
			await call('repository', changed('renamed', { full_name: 'Org/nieuw' }));
			expect(forgetVisibility).toHaveBeenCalledTimes(2);
		});

		it('reads a site again whose repository is deleted, so its admins see why', async () => {
			await call('repository', changed('deleted'));
			expect(reloadSite).toHaveBeenCalledWith('site');
			expect((await team.sites())[0]).toMatchObject({ repo: SITE });
		});

		it('leaves other changes, other repositories and names that are not one alone', async () => {
			await call('repository', changed('edited'));
			await call('repository', changed('archived'));
			await call('repository', changed('renamed', { id: 8, full_name: 'Org/ander' }));
			expect(reloadSite).not.toHaveBeenCalled();
			await call('repository', changed('renamed', { full_name: 'geen naam' }));
			expect((await team.sites())[0]).toMatchObject({ repo: SITE });
			expect(reloadSite).toHaveBeenCalledTimes(1);
		});

		it('answers 503 when the registry cannot be read', async () => {
			vi.spyOn(team, 'sites').mockRejectedValueOnce(new Error('database down'));
			expect((await call('repository', changed('deleted'))).status).toBe(503);
			expect(log.error).toHaveBeenCalledWith('webhook.reload_failed', {
				repo: SITE,
				error: 'Error'
			});
		});
	});

	it('answers 503 when the registry cannot be read, so GitHub shows the delivery failed', async () => {
		vi.spyOn(team, 'sites').mockRejectedValueOnce(new Error('database down'));
		expect((await call('push', push())).status).toBe(503);
		expect(log.error).toHaveBeenCalledWith('webhook.reload_failed', { repo: SITE, error: 'Error' });
		expect(reloadSite).not.toHaveBeenCalled();
	});
});
