import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';

const state = vi.hoisted(() => ({ forge: null as unknown, site: null as unknown }));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({ site: (id: string) => (id === 'moza' ? state.site : undefined) }),
	getForge: () => state.forge
}));
vi.mock('../../src/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/lib/auth/identity', () => ({
	identityFor: (prefs: { who: string }) => ({ kind: 'anoniem', pseudoniem: prefs.who })
}));
vi.mock('../../src/lib/auth/users', () => ({ listLinkedLogins: async () => ['jan', 'piet'] }));

import { POST as insturen } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/insturen/+server';
import { POST as goedkeuren } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/goedkeuren/+server';
import { POST as opmerking } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/opmerking/+server';
import { POST as mergen } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/mergen/+server';

let forge: FakeForge;
const site = (mergeFromSchrijver = true) => ({
	id: 'moza',
	repo: 'o/moza',
	content: { pad: 'content' },
	review: { 'mergen-vanuit-schrijver': mergeFromSchrijver, redactie: ['red@example.org'] },
	preview: { soort: 'geen' }
});

function call(
	handler: (e: never) => Response | Promise<Response>,
	opts: { who?: string; email?: string; nummer?: string; siteId?: string; body?: unknown; anon?: boolean } = {}
) {
	return handler({
		request: new Request('http://x', { method: 'POST', body: JSON.stringify(opts.body ?? {}) }),
		params: { site: opts.siteId ?? 'moza', nummer: opts.nummer ?? '1' },
		locals: {
			user: opts.anon
				? null
				: {
						session: { email: opts.email ?? 'iemand@example.org', emailVerified: true, name: 'N', sub: 's' },
						prefs: { who: opts.who ?? 'auteur', githubLogin: null }
					}
		}
	} as never);
}

beforeEach(async () => {
	forge = new FakeForge();
	state.forge = forge;
	state.site = site();
	forge.seedRepo('o/moza', 'main', { 'content/a.md': 'oud' });
	await forge.createBranch('o/moza', 'main', 'b');
	await forge.commit('o/moza', 'b', [{ path: 'content/a.md', content: 'nieuw' }], 'Bewerk\n\nSchrijver-Auteur: auteur');
	await forge.openDraftPr('o/moza', 'b', 'main', 'Titel', 'Voorgesteld.\n\nSchrijver-Auteur: auteur');
});

describe('proposal endpoints', () => {
	it('401, 404 and 400', async () => {
		expect((await call(insturen, { anon: true })).status).toBe(401);
		expect((await call(insturen, { siteId: 'x' })).status).toBe(404);
		expect((await call(insturen, { nummer: '99' })).status).toBe(404);
		expect((await call(opmerking, { email: 'red@example.org', body: { body: '  ' } })).status).toBe(400);
	});

	it('lets the owner send in, but not goedkeuren or merge', async () => {
		expect((await call(goedkeuren, { who: 'auteur' })).status).toBe(403);
		expect((await call(mergen, { who: 'auteur' })).status).toBe(403);
		expect((await call(insturen, { who: 'vreemde' })).status).toBe(403);
		expect((await call(insturen, { who: 'auteur' })).status).toBe(200);
		expect((await forge.getPr('o/moza', 1)).draft).toBe(false);
		expect((await call(insturen, { who: 'auteur' })).status).toBe(409);
	});

	it('refuses merging for non-editorial users and when merging from Schrijver is off', async () => {
		await call(insturen, { who: 'auteur' });
		expect((await call(mergen, { who: 'vreemde' })).status).toBe(403);
		state.site = site(false);
		const res = await call(mergen, { email: 'red@example.org' });
		expect(res.status).toBe(403);
		expect((await res.json()).message).toContain('GitHub');
	});

	it('refuses merging a draft', async () => {
		expect((await call(mergen, { email: 'red@example.org' })).status).toBe(409);
	});

	it('approves, comments and merges as editorial', async () => {
		await call(insturen, { who: 'auteur' });
		const red = { email: 'red@example.org' };
		expect((await call(goedkeuren, red)).status).toBe(200);
		expect((await call(opmerking, { ...red, body: { body: 'Mooi' } })).status).toBe(200);
		expect((await call(mergen, red)).status).toBe(200);
		expect((await forge.getPr('o/moza', 1)).state).toBe('merged');
		expect(forge.commitsOf('o/moza', 'main').at(-1)!.message).toBe('Titel (#1)\n\nSchrijver-Auteur: auteur');
	});

	it('shows a refused merge verbatim with its status', async () => {
		await call(insturen, { who: 'auteur' });
		forge.failNext('merge', new ForgeError(405, 'Samenvoegen geweigerd', 'Required status check "build" is expected.'));
		const res = await call(mergen, { email: 'red@example.org' });
		expect(res.status).toBe(405);
		expect(await res.json()).toMatchObject({
			message: 'Samenvoegen geweigerd',
			detail: 'Required status check "build" is expected.'
		});
	});
});
