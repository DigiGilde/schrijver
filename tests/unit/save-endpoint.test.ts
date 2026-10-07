import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({ site: (id: string) => (id === 'onbekend' ? undefined : { id }), schema: () => ({}) }),
	getForge: () => ({})
}));
vi.mock('../../src/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/lib/auth/identity', () => ({ identityFor: () => ({ kind: 'anoniem', pseudoniem: 'x' }) }));
vi.mock('../../src/lib/forge/save', () => ({
	save: vi.fn(async () => ({ ok: true, branch: 'b', prNumber: 3, sha: 's', url: 'u', path: 'p' }))
}));

import { POST } from '../../src/routes/api/sites/[site]/opslaan/+server';

const good = {
	path: 'docs/a.md',
	body: 'x',
	frontmatter: {},
	changedKeys: [],
	baseSha: null,
	branch: null,
	prNumber: null,
	images: []
};
function call(opts: { user?: boolean; site?: string; body?: unknown }) {
	const request = new Request('http://x', { method: 'POST', body: JSON.stringify(opts.body ?? good) });
	return POST({
		request,
		params: { site: opts.site ?? 'digi' },
		locals: { user: opts.user === false ? null : { session: {}, prefs: {} } }
	} as never);
}

describe('POST /api/sites/[site]/opslaan', () => {
	it('401 without user', async () => expect((await call({ user: false })).status).toBe(401));
	it('404 on unknown site', async () => expect((await call({ site: 'onbekend' })).status).toBe(404));
	it('400 on bad body', async () => expect((await call({ body: { path: 1 } })).status).toBe(400));
	it('200 on success', async () => expect((await call({})).status).toBe(200));
});
