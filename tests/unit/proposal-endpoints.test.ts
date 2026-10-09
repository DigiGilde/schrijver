import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { log } from '../../src/lib/log';

const state = vi.hoisted(() => ({ forge: null as unknown, site: null as unknown }));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({ site: (id: string) => (id === 'moza' ? state.site : undefined) }),
	getForge: () => state.forge
}));
vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../src/lib/auth/identity', () => ({
	identityFor: (prefs: { who: string; githubLogin: string | null }) =>
		prefs.githubLogin
			? { kind: 'gekoppeld', name: 'N', githubId: 1, login: prefs.githubLogin, who: prefs.who }
			: { kind: 'anoniem', pseudoniem: prefs.who },
	identitiesFor: (prefs: { who: string; githubLogin: string | null }) => [
		{ kind: 'anoniem', pseudoniem: prefs.who },
		...(prefs.githubLogin
			? [{ kind: 'gekoppeld', name: prefs.githubLogin, githubId: 1, login: prefs.githubLogin }]
			: [])
	],
	actorPseudonym: (s: { sub: string }) => `p-${s.sub}`
}));
vi.mock('../../src/lib/auth/users', () => ({
	listLinkedLogins: async () => ['jan', 'piet', 'kees', 'els', 'tom', 'zoe', 'bas', 'eva']
}));

import { POST as insturen } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/insturen/+server';
import { POST as opmerking } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/opmerking/+server';
import { POST as mergen } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/mergen/+server';

let forge: FakeForge;
const site = (mergeFromSchrijver = true) => ({
	id: 'moza',
	repo: 'o/moza',
	standaardbranch: 'main',
	content: { pad: 'content' },
	review: { 'mergen-vanuit-schrijver': mergeFromSchrijver, redactie: ['red@example.org'] },
	preview: { soort: 'geen' }
});

function call(
	handler: (e: never) => Response | Promise<Response>,
	opts: {
		gekoppeld?: string;
		who?: string;
		email?: string;
		nummer?: string;
		siteId?: string;
		body?: unknown;
		anon?: boolean;
	} = {}
) {
	return handler({
		request: new Request('http://x', { method: 'POST', body: JSON.stringify(opts.body ?? {}) }),
		params: { site: opts.siteId ?? 'moza', nummer: opts.nummer ?? '1' },
		locals: {
			user: opts.anon
				? null
				: {
						session: {
							email: opts.email ?? 'iemand@example.org',
							emailVerified: true,
							name: 'N',
							sub: 's'
						},
						prefs: { who: opts.who ?? 'auteur', githubLogin: opts.gekoppeld ?? null }
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
	await forge.commit(
		'o/moza',
		'b',
		[{ path: 'content/a.md', content: 'nieuw' }],
		'Bewerk\n\nSchrijver-Auteur: auteur'
	);
	await forge.openDraftPr(
		'o/moza',
		'b',
		'main',
		'Titel',
		'Voorgesteld.\n\nSchrijver-Auteur: auteur'
	);
});

describe('proposal endpoints', () => {
	it('401, 404 and 400', async () => {
		expect((await call(insturen, { anon: true })).status).toBe(401);
		expect((await call(insturen, { siteId: 'x' })).status).toBe(404);
		expect((await call(insturen, { nummer: '99' })).status).toBe(404);
		expect((await call(opmerking, { email: 'red@example.org', body: { body: '  ' } })).status).toBe(
			400
		);
	});

	it('lets the owner send in and react, but not merge', async () => {
		expect((await call(opmerking, { who: 'auteur', body: { body: 'x' } })).status).toBe(200);
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
		expect((await call(opmerking, { ...red, body: { body: 'Mooi' } })).status).toBe(200);
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		expect((await call(mergen, { ...red, body: { sha } })).status).toBe(200);
		expect((await forge.getPr('o/moza', 1)).state).toBe('merged');
		expect(forge.commitsOf('o/moza', 'main').at(-1)!.message).toBe(
			'Titel (#1)\n\nSchrijver-Auteur: auteur'
		);
	});

	it('posts a reaction of the writer or the redactie, saying who wrote it and as what', async () => {
		const res = await call(opmerking, { who: 'auteur', body: { body: ' Aangepast ' } });
		expect(await res.json()).toEqual({ ok: true });
		await call(opmerking, { email: 'red@example.org', who: 'iemand', body: { body: 'Dank' } });
		await call(opmerking, {
			email: 'red@example.org',
			who: 'jan',
			gekoppeld: 'jan',
			body: { body: 'Ok' }
		});
		const vreemd = await call(opmerking, { who: 'vreemde', body: { body: 'Ik ook' } });
		expect(vreemd.status).toBe(403);
		expect((await vreemd.json()).message).toBe(
			'Alleen de schrijver en de redactie kunnen hier reageren'
		);
		expect((await forge.prComments('o/moza', 1)).map((c) => c.body)).toEqual([
			'Reactie van de schrijver via Schrijver (anoniem, codenaam auteur):\n\nAangepast',
			'Reactie van de redactie via Schrijver (anoniem, codenaam iemand):\n\nDank',
			'Reactie van de redactie via Schrijver (GitHub: jan):\n\nOk'
		]);
	});

	it('refuses comments on a closed proposal', async () => {
		forge.prs.get(1)!.state = 'closed';
		expect((await call(opmerking, { email: 'red@example.org', body: { body: 'x' } })).status).toBe(
			409
		);
	});

	it('requests no reviewers at all for an anonymous author', async () => {
		for (const l of ['jan', 'piet', 'kees', 'els', 'tom', 'zoe', 'bas', 'eva'])
			forge.permissionByLogin.set(l, 'write');
		const perm = vi.spyOn(forge, 'collaboratorPermission');
		const req = vi.spyOn(forge, 'requestReviewers');
		expect((await call(insturen, { who: 'auteur' })).status).toBe(200);
		expect(perm).not.toHaveBeenCalled();
		expect(req).not.toHaveBeenCalled();
		expect(log.info).toHaveBeenCalledWith('proposal.reviewers_skipped_anonymous', {
			site: 'moza',
			pr: 1
		});
	});

	it('requests at most five permission checks and excludes nobody for a named author', async () => {
		for (const l of ['jan', 'piet', 'kees', 'els', 'tom', 'zoe', 'bas', 'eva'])
			forge.permissionByLogin.set(l, 'write');
		forge.prs.get(1)!.body = 'x\n\nCo-authored-by: Jan Jansen <jan@example.org>';
		const perm = vi.spyOn(forge, 'collaboratorPermission');
		const req = vi.spyOn(forge, 'requestReviewers');
		await call(insturen, { email: 'red@example.org', gekoppeld: undefined });
		expect(perm.mock.calls.length).toBeLessThanOrEqual(5);
		expect(req).toHaveBeenCalledWith('o/moza', 1, ['jan', 'piet', 'kees', 'els', 'tom']);
	});

	it('excludes the linked author named in the trailer when the redactie sends in', async () => {
		for (const l of ['jan', 'piet', 'kees', 'els', 'tom', 'zoe'])
			forge.permissionByLogin.set(l, 'write');
		forge.prs.get(1)!.body = 'x\n\nCo-authored-by: piet <7+piet@users.noreply.github.com>';
		const req = vi.spyOn(forge, 'requestReviewers');
		await call(insturen, { email: 'red@example.org' });
		expect(req).toHaveBeenCalledWith('o/moza', 1, ['jan', 'kees', 'els', 'tom', 'zoe']);
	});

	it('logs the actor pseudonym and never an e-mail address', async () => {
		const write = vi.mocked(log.info);
		write.mockClear();
		await call(insturen, { who: 'auteur' });
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		await call(mergen, { email: 'red@example.org', body: { sha } });
		const calls = JSON.stringify([
			...vi.mocked(log.info).mock.calls,
			...vi.mocked(log.warn).mock.calls
		]);
		expect(write).toHaveBeenCalledWith('proposal.insturen', { site: 'moza', pr: 1, actor: 'p-s' });
		expect(write).toHaveBeenCalledWith('proposal.mergen', { site: 'moza', pr: 1, actor: 'p-s' });
		expect(calls).not.toContain('@');
	});

	it('excludes a linked author from the reviewers', async () => {
		for (const l of ['jan', 'piet', 'kees', 'els', 'tom', 'zoe'])
			forge.permissionByLogin.set(l, 'write');
		forge.prs.get(1)!.body = 'x\n\nCo-authored-by: N <1+jan@users.noreply.github.com>';
		const req = vi.spyOn(forge, 'requestReviewers');
		await call(insturen, { who: 'x', gekoppeld: 'jan' });
		expect(req).toHaveBeenCalledWith('o/moza', 1, ['piet', 'kees', 'els', 'tom', 'zoe']);
	});

	it('shows a refused merge verbatim with its status', async () => {
		await call(insturen, { who: 'auteur' });
		forge.failNext(
			'merge',
			new ForgeError(405, 'Samenvoegen geweigerd', 'Required status check "build" is expected.')
		);
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		const res = await call(mergen, { email: 'red@example.org', body: { sha } });
		expect(res.status).toBe(405);
		expect(await res.json()).toMatchObject({
			message: 'Samenvoegen geweigerd',
			detail: 'Required status check "build" is expected.'
		});
	});

	it('pins the merge to the head the reviewer saw', async () => {
		await call(insturen, { who: 'auteur' });
		const red = { email: 'red@example.org' };
		const seen = (await forge.getPr('o/moza', 1)).headSha;
		await forge.commit(
			'o/moza',
			'b',
			[{ path: 'content/a.md', content: 'later' }],
			'Bewerk\n\nSchrijver-Auteur: auteur'
		);

		expect((await call(mergen, red)).status).toBe(400);
		const res = await call(mergen, { ...red, body: { sha: seen } });
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({
			message: expect.stringContaining('nieuwe versie'),
			detail: 'Head branch was modified. Review and try the merge again.'
		});
		expect((await forge.getPr('o/moza', 1)).state).toBe('open');
	});
});
