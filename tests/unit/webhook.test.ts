import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CachingForge } from '$lib/forge/cache';
import { FakeForge } from '$lib/forge/fake';

vi.mock('$lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }));

const reloadConfig = vi.fn(async () => {});
const fake = new FakeForge();
const forge = new CachingForge(fake);
const invalidate = vi.spyOn(forge, 'invalidate');

vi.mock('$lib/server/services', () => ({
	reloadConfig: () => reloadConfig(),
	getForge: () => forge,
	configRepoName: () => 'o/config'
}));

const { POST } = await import('../../src/routes/api/webhook/github/+server');
const SECRET = 's3cret';

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

beforeEach(() => {
	process.env.GITHUB_WEBHOOK_SECRET = SECRET;
	reloadConfig.mockClear();
	invalidate.mockClear();
});

describe('github webhook', () => {
	it('ignores a payload without a string repository name', async () => {
		const res = await call('push', { repository: { full_name: 42 } });
		expect(res.status).toBe(204);
		expect(invalidate).not.toHaveBeenCalled();
		expect(reloadConfig).not.toHaveBeenCalled();
	});

	it('rejects a bad signature', async () => {
		const res = await call(
			'push',
			{ repository: { full_name: 'o/config' } },
			'sha256=' + '0'.repeat(64)
		);
		expect(res.status).toBe(401);
		expect(reloadConfig).not.toHaveBeenCalled();
	});

	it('rejects a missing signature', async () => {
		const res = await call('push', { repository: { full_name: 'o/config' } }, null);
		expect(res.status).toBe(401);
	});

	it('rejects a malformed signature', async () => {
		const res = await call('push', { repository: { full_name: 'o/config' } }, 'sha256=zz');
		expect(res.status).toBe(401);
	});

	it('reloads config on a push to the config repo', async () => {
		const res = await call('push', { repository: { full_name: 'o/config' } });
		expect(res.status).toBe(204);
		expect(reloadConfig).toHaveBeenCalledTimes(1);
		expect(invalidate).toHaveBeenCalledWith('o/config');
	});

	it('reloads config when the payload casing differs from GITHUB_CONFIG_REPO', async () => {
		const res = await call('push', { repository: { full_name: 'O/Config' } });
		expect(res.status).toBe(204);
		expect(reloadConfig).toHaveBeenCalledTimes(1);
	});

	it('invalidates the cache on a push to a site repo', async () => {
		const res = await call('push', { repository: { full_name: 'o/site' } });
		expect(res.status).toBe(204);
		expect(invalidate).toHaveBeenCalledWith('o/site');
		expect(reloadConfig).not.toHaveBeenCalled();
	});

	it('invalidates on pull_request events', async () => {
		await call('pull_request', { repository: { full_name: 'o/site' } });
		expect(invalidate).toHaveBeenCalledWith('o/site');
	});

	it('ignores other events', async () => {
		const res = await call('ping', { repository: { full_name: 'o/site' } });
		expect(res.status).toBe(204);
		expect(invalidate).not.toHaveBeenCalled();
		expect(reloadConfig).not.toHaveBeenCalled();
	});
});
