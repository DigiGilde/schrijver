import { beforeEach, describe, expect, it, vi } from 'vitest';

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
	identityFor: vi.fn(() => ({ kind: 'anoniem', pseudoniem: 'x' })),
	identitiesFor: () => [{ kind: 'anoniem', pseudoniem: 'x' }],
	actorPseudonym: (s: { sub: string }) => `p-${s.sub}`
}));
vi.mock('../../src/lib/forge/save', () => ({
	save: vi.fn(async () => ({ ok: true, branch: 'b', prNumber: 3, sha: 's', url: 'u', path: 'p' }))
}));

import { POST } from '../../src/routes/api/sites/[site]/opslaan/+server';
import { log } from '../../src/lib/log';
import { save } from '../../src/lib/forge/save';
import { identityFor } from '../../src/lib/auth/identity';
import type { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { settingsOf, useTeams } from './team-fixture';

let team: MemoryTeamStore;
beforeEach(async () => {
	team = await useTeams([settingsOf('digi', { identiteitToegestaan: ['anoniem', 'gekoppeld'] })]);
});

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
	it('signs as the settings of the site in Schrijver allow', async () => {
		vi.mocked(identityFor).mockClear();
		await call({});
		expect(vi.mocked(identityFor).mock.calls[0][2]).toMatchObject({
			siteId: 'digi',
			identiteitToegestaan: ['anoniem', 'gekoppeld']
		});
	});
	it('logs the actor pseudonym and no e-mail address', async () => {
		vi.mocked(log.info).mockClear();
		await call({ sub: 'jan' });
		expect(log.info).toHaveBeenCalledWith('save.ok', {
			site: 'digi',
			pr: 3,
			branch: 'b',
			deleted: 0,
			actor: 'p-jan'
		});
		expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain('@');
	});

	it('records who writes in the proposal, at the save that opens it and every later one', async () => {
		for (const sub of ['jan', 'piet'])
			await team.recordLogin({ sub, name: sub, email: `${sub}@example.org`, emailVerified: true });
		await call({ sub: 'jan' });
		await call({ sub: 'piet', body: { ...good, branch: 'schrijver/x', prNumber: 3 } });
		await call({ sub: 'jan', body: { ...good, branch: 'schrijver/x', prNumber: 3 } });
		expect(await team.writers('digi', 3)).toEqual(['jan', 'piet']);
	});

	it('records nobody for a save that did not happen', async () => {
		await team.recordLogin({
			sub: 'jan',
			name: 'Jan',
			email: 'jan@example.org',
			emailVerified: true
		});
		vi.mocked(save).mockResolvedValueOnce({ ok: false, error: { message: 'Nee' }, status: 409 });
		await call({ sub: 'jan' });
		expect(await team.writers('digi', 3)).toEqual([]);
	});

	it('keeps a save when its writer cannot be recorded, and logs that without the person', async () => {
		vi.mocked(log.warn).mockClear();
		const res = await call({ sub: 'zonder-profiel' });
		expect(res.status).toBe(200);
		expect(log.warn).toHaveBeenCalledWith('proposal.writer_not_recorded', {
			site: 'digi',
			pr: 3,
			error: 'Error'
		});
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain('zonder-profiel');
	});

	it('logs how many files a save deleted', async () => {
		vi.mocked(log.info).mockClear();
		const kat = 'docs/afbeeldingen/a/kat.png';
		const hond = 'docs/afbeeldingen/a/hond.png';
		await call({ sub: 'jan', body: { ...good, deletions: [kat, hond, kat] } });
		expect(log.info).toHaveBeenCalledWith('save.ok', expect.objectContaining({ deleted: 2 }));
		expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain('kat.png');
	});

	it('logs a refused deletion with its reason and the actor, never a path', async () => {
		vi.mocked(log.warn).mockClear();
		const kat = 'docs/afbeeldingen/a/kat.png';
		vi.mocked(save).mockResolvedValueOnce({
			ok: false,
			error: { message: 'Niet bewaard: de afbeelding staat nog op een andere pagina', detail: kat },
			status: 409,
			deletionRefused: 'in_use'
		});
		const res = await call({ sub: 'jan', body: { ...good, deletions: [kat] } });
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			ok: false,
			error: { message: 'Niet bewaard: de afbeelding staat nog op een andere pagina', detail: kat }
		});
		expect(log.warn).toHaveBeenCalledWith('save.deletion_refused', {
			site: 'digi',
			reason: 'in_use',
			actor: 'p-jan'
		});
		expect(log.warn).not.toHaveBeenCalledWith('save.failed', expect.anything());
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain('kat.png');
	});

	it('refuses images that together exceed 10 MB with a Dutch message', async () => {
		const fourMb = 'A'.repeat(Math.ceil((4 * 1024 * 1024) / 3) * 4);
		const images = [1, 2, 3].map((n) => ({ path: `docs/afb/${n}.png`, base64: fourMb }));
		const res = await call({ body: { ...good, images } });
		expect(res.status).toBe(413);
		expect((await res.json()).error.message).toBe(
			'De afbeeldingen op deze pagina zijn samen groter dan 10 MB; verwijder er een paar of maak ze kleiner'
		);
		expect((await call({ body: { ...good, images: images.slice(0, 2) } })).status).toBe(200);
	});

	it('refuses a 2,000,000-character body quickly with a Dutch message', async () => {
		const start = performance.now();
		const res = await call({ body: { ...good, body: '!['.repeat(1_000_000) } });
		expect(performance.now() - start).toBeLessThan(200);
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toBe(
			'De tekst is te lang om te bewaren (maximaal 500.000 tekens)'
		);
	});

	it('passes deletions on to save, up to 20', async () => {
		vi.mocked(save).mockClear();
		const kat = 'docs/afbeeldingen/a/kat.png';
		expect((await call({ body: { ...good, deletions: [kat] } })).status).toBe(200);
		expect(vi.mocked(save).mock.calls[0][4]).toMatchObject({ deletions: [kat] });
		const many = Array.from({ length: 21 }, (_, i) => `docs/afbeeldingen/a/${i}.png`);
		expect((await call({ body: { ...good, deletions: many } })).status).toBe(400);
	});

	it('refuses a save that deletes once the hourly budget of image scans is spent', async () => {
		const deletions = ['docs/afbeeldingen/a/kat.png'];
		const branch = { ...good, branch: 'schrijver/x', prNumber: 1 };
		for (let i = 0; i < 60; i++)
			expect((await call({ sub: 'wisser', body: { ...branch, deletions } })).status).toBe(200);
		vi.mocked(save).mockClear();
		const spent = await call({ sub: 'wisser', body: { ...branch, deletions } });
		expect(spent.status).toBe(429);
		expect((await spent.json()).error.message).toBe(
			'Je hebt het afgelopen uur veel afbeeldingen laten nagaan; probeer het later opnieuw'
		);
		expect(save).not.toHaveBeenCalled();
		expect(log.warn).toHaveBeenCalledWith('save.deletion_refused', {
			site: 'digi',
			reason: 'limit',
			actor: 'p-wisser'
		});
		expect((await call({ sub: 'wisser', body: branch })).status).toBe(200);
	});

	it('refuses deeply nested frontmatter', async () => {
		let deep: unknown = 'x';
		for (let i = 0; i < 50; i++) deep = { a: deep };
		const res = await call({ body: { ...good, frontmatter: { description: deep } } });
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toBe(
			'De eigenschappen van de pagina zijn te groot of te diep genest'
		);
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
