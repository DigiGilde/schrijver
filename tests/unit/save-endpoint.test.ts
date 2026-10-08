import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({
		site: (id: string) => (id === 'onbekend' ? undefined : { id }),
		schema: () => ({})
	}),
	getForge: () => ({})
}));
vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../src/lib/auth/identity', () => ({
	identityFor: () => ({ kind: 'anoniem', pseudoniem: 'x' }),
	identitiesFor: () => [{ kind: 'anoniem', pseudoniem: 'x' }],
	actorPseudonym: (s: { sub: string }) => `p-${s.sub}`
}));
vi.mock('../../src/lib/forge/save', () => ({
	save: vi.fn(async () => ({ ok: true, branch: 'b', prNumber: 3, sha: 's', url: 'u', path: 'p' }))
}));

import { POST } from '../../src/routes/api/sites/[site]/opslaan/+server';
import { log } from '../../src/lib/log';

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
function call(opts: { user?: boolean; site?: string; body?: unknown; sub?: string }) {
	const request = new Request('http://x', {
		method: 'POST',
		body: JSON.stringify(opts.body ?? good)
	});
	return POST({
		request,
		params: { site: opts.site ?? 'digi' },
		locals: {
			user:
				opts.user === false
					? null
					: {
							session: { sub: opts.sub ?? 's', email: 'jan@example.org', emailVerified: true },
							prefs: {}
						}
		}
	} as never);
}

describe('POST /api/sites/[site]/opslaan', () => {
	it('401 without user', async () => expect((await call({ user: false })).status).toBe(401));
	it('404 on unknown site', async () =>
		expect((await call({ site: 'onbekend' })).status).toBe(404));
	it('400 on bad body', async () => expect((await call({ body: { path: 1 } })).status).toBe(400));
	it('200 on success', async () => expect((await call({})).status).toBe(200));
	it('logs the actor pseudonym and no e-mail address', async () => {
		vi.mocked(log.info).mockClear();
		await call({ sub: 'jan' });
		expect(log.info).toHaveBeenCalledWith('save.ok', {
			site: 'digi',
			pr: 3,
			branch: 'b',
			actor: 'p-jan'
		});
		expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain('@');
	});

	it('refuses images that together exceed 10 MB with a Dutch message', async () => {
		const fourMb = 'A'.repeat(Math.ceil((4 * 1024 * 1024) / 3) * 4);
		const images = [1, 2, 3].map((n) => ({ path: `docs/afb/${n}.png`, base64: fourMb }));
		const res = await call({ body: { ...good, images } });
		expect(res.status).toBe(413);
		expect((await res.json()).error.message).toBe(
			'De afbeeldingen in dit concept zijn samen groter dan 10 MB; verwijder er een paar of maak ze kleiner'
		);
		expect((await call({ body: { ...good, images: images.slice(0, 2) } })).status).toBe(200);
	});

	it('refuses a 2,000,000-character body quickly with a Dutch message', async () => {
		const start = performance.now();
		const res = await call({ body: { ...good, body: '!['.repeat(1_000_000) } });
		expect(performance.now() - start).toBeLessThan(200);
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain('te lang');
	});

	it('refuses deeply nested frontmatter', async () => {
		let deep: unknown = 'x';
		for (let i = 0; i < 50; i++) deep = { a: deep };
		const res = await call({ body: { ...good, frontmatter: { description: deep } } });
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain('te diep');
	});

	it('caps new proposals per user per hour', async () => {
		const statuses: number[] = [];
		for (let i = 0; i < 21; i++) statuses.push((await call({ sub: 'veelschrijver' })).status);
		expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
		expect(statuses[20]).toBe(429);
		expect(
			(await call({ sub: 'veelschrijver', body: { ...good, branch: 'schrijver/x', prNumber: 1 } }))
				.status
		).toBe(200);
	});
});
