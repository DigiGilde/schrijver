import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { log } from '../../src/lib/log';
import type { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { settingsOf, useTeams } from './team-fixture';

const state = vi.hoisted(() => ({ forge: null as unknown, site: null as unknown }));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({ site: (id: string) => (id === 'moza' ? state.site : undefined) }),
	getForge: () => state.forge
}));
vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
// A GitHub user id per login: the sum of its character codes, so jan is 313 and piet 434.
vi.mock('../../src/lib/auth/identity', () => {
	const id = (login: string) => [...login].reduce((sum, c) => sum + c.charCodeAt(0), 0);
	return {
		identityFor: vi.fn((prefs: { who: string; githubLogin: string | null }) =>
			prefs.githubLogin
				? {
						kind: 'gekoppeld',
						name: 'N',
						githubId: id(prefs.githubLogin),
						login: prefs.githubLogin,
						who: prefs.who
					}
				: { kind: 'anoniem', pseudoniem: prefs.who }
		),
		identitiesFor: (prefs: { who: string; githubLogin: string | null }) => [
			{ kind: 'anoniem', pseudoniem: prefs.who },
			...(prefs.githubLogin
				? [
						{
							kind: 'gekoppeld',
							name: prefs.githubLogin,
							githubId: id(prefs.githubLogin),
							login: prefs.githubLogin
						}
					]
				: [])
		],
		actorPseudonym: (s: { sub: string }) => `p-${s.sub}`
	};
});
vi.mock('../../src/lib/auth/users', () => ({
	listLinkedLogins: async () => ['jan', 'piet', 'kees', 'els', 'tom', 'zoe', 'bas', 'eva']
}));

import { POST as insturen } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/insturen/+server';
import { POST as opmerking } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/opmerking/+server';
import { POST as mergen } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/mergen/+server';
import { POST as aanpassing } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/aanpassing/+server';
import { POST as opnieuwInsturen } from '../../src/routes/api/sites/[site]/voorstellen/[nummer]/opnieuw-insturen/+server';
import { statusOf } from '../../src/lib/forge/proposals';
import { identityFor } from '../../src/lib/auth/identity';

let forge: FakeForge;
let team: MemoryTeamStore;
const site = () => ({
	id: 'moza',
	repo: 'o/moza',
	standaardbranch: 'main',
	content: { pad: 'content' },
	preview: { soort: 'geen' }
});
/** The settings of the site in Schrijver: merging there, and four eyes. */
const settings = (mergenVanuitSchrijver = true, vierOgen = false) =>
	team.saveSettings('moza', settingsOf('moza', { mergenVanuitSchrijver, vierOgen }).values, 'baas');

/** Schrijver recorded these users, each signed in once, as the writers of proposal 1. */
async function recorded(...subs: string[]) {
	for (const sub of subs) {
		await team.recordLogin({
			sub,
			name: sub,
			email: `${sub}@schrijft.example`,
			emailVerified: true
		});
		await team.recordWriter('moza', 1, sub);
	}
}

function call(
	handler: (e: never) => Response | Promise<Response>,
	opts: {
		gekoppeld?: string;
		who?: string;
		/** The SSO subject: red is on the redactie of the site. */
		sub?: string;
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
							email: 'iemand@example.org',
							emailVerified: true,
							name: 'N',
							sub: opts.sub ?? 's'
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
	team = await useTeams([settingsOf('moza', { vierOgen: false })], { moza: { red: 'redactie' } });
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
		expect((await call(opmerking, { sub: 'red', body: { body: '  ' } })).status).toBe(400);
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
		await settings(false);
		const res = await call(mergen, { sub: 'red' });
		expect(res.status).toBe(403);
		expect((await res.json()).message).toContain('GitHub');
	});

	it('keeps the writer from merging their own proposal with four eyes, unless a site admin', async () => {
		await settings(true, true);
		await call(insturen, { who: 'auteur' });
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		const zelf = await call(mergen, { sub: 'red', who: 'auteur', body: { sha } });
		expect(zelf.status).toBe(403);
		expect((await zelf.json()).message).toBe(
			'Je schreef dit voorstel zelf. Een ander lid van de redactie voegt het samen.'
		);
		forge.permissionByLogin.set('beheerder', 'admin');
		const admin = await call(mergen, {
			sub: 'red',
			who: 'auteur',
			gekoppeld: 'beheerder',
			body: { sha }
		});
		expect(admin.status).toBe(200);
		expect((await forge.getPr('o/moza', 1)).state).toBe('merged');
	});

	it('counts whoever wrote along in Schrijver as a writer for four eyes', async () => {
		await settings(true, true);
		await call(insturen, { who: 'auteur' });
		await forge.commit(
			'o/moza',
			'b',
			[{ path: 'content/a.md', content: 'bijgewerkt' }],
			'Bewerk\n\nSchrijver-Auteur: redacteur'
		);
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		const red = { sub: 'red', body: { sha } };
		const mee = await call(mergen, { ...red, who: 'redacteur' });
		expect(mee.status).toBe(403);
		expect((await mee.json()).message).toBe(
			'Je schreef mee aan dit voorstel. Een ander lid van de redactie voegt het samen.'
		);
		// Without a record of who wrote it, a signature that is not the reader's cannot clear them.
		const zonder = await call(mergen, { ...red, who: 'derde' });
		expect(zonder.status).toBe(403);
		expect((await zonder.json()).message).toBe(
			'Schrijver kan niet nagaan of je dit voorstel zelf schreef. Een ander lid van de redactie voegt het samen.'
		);
		await recorded('schrijver', 'meeschrijver');
		expect((await call(mergen, { ...red, who: 'derde' })).status).toBe(200);
	});

	it('lets another member of the redactie merge with four eyes, and the writer without', async () => {
		await settings(true, true);
		await call(insturen, { who: 'auteur' });
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		await settings(true, false);
		const red = { sub: 'red', body: { sha } };
		forge.failNext('merge', new ForgeError(500, 'Kapot'));
		expect((await call(mergen, { ...red, who: 'auteur' })).status).toBe(500);
		await settings(true, true);
		await recorded('schrijver');
		expect((await call(mergen, { ...red, who: 'redacteur' })).status).toBe(200);
	});

	it('waits for the approval on GitHub that the site requires, before trying to merge', async () => {
		await call(insturen, { who: 'auteur' });
		forge.requireReview('o/moza');
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		const merge = vi.spyOn(forge, 'merge');
		const red = { sub: 'red', who: 'redacteur', body: { sha } };
		const wacht = await call(mergen, red);
		expect(wacht.status).toBe(409);
		expect((await wacht.json()).message).toBe(
			'Deze site vraagt eerst een goedkeuring op GitHub. Daarna kun je hier samenvoegen.'
		);
		expect(merge).not.toHaveBeenCalled();

		forge.failNext('reviewDecision', new ForgeError(502, 'GitHub is niet bereikbaar'));
		const geweigerd = await call(mergen, red);
		expect(geweigerd.status).toBe(405);
		expect(await geweigerd.json()).toMatchObject({
			detail: 'At least 1 approving review is required by reviewers with write access.'
		});
		expect(log.warn).toHaveBeenCalledWith('proposal.review_decision_failed', {
			site: 'moza',
			pr: 1,
			error: 'ForgeError',
			status: 502
		});

		forge.reviewOnGitHub('o/moza', 1, 'jansen', 'approved', '');
		expect((await call(mergen, red)).status).toBe(200);
	});

	it('refuses merging a draft', async () => {
		expect((await call(mergen, { sub: 'red' })).status).toBe(409);
	});

	it('approves, comments and merges as editorial', async () => {
		await call(insturen, { who: 'auteur' });
		const red = { sub: 'red' };
		expect((await call(opmerking, { ...red, body: { body: 'Mooi' } })).status).toBe(200);
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		expect((await call(mergen, { ...red, body: { sha } })).status).toBe(200);
		expect((await forge.getPr('o/moza', 1)).state).toBe('merged');
		expect(forge.commitsOf('o/moza', 'main').at(-1)!.message).toBe(
			'Titel (#1)\n\nSchrijver-Auteur: auteur'
		);
	});

	it('forgets who wrote the proposal once it is merged', async () => {
		await call(insturen, { who: 'auteur' });
		await recorded('schrijver');
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		expect((await call(mergen, { sub: 'red', body: { sha } })).status).toBe(200);
		expect(await team.writers('moza', 1)).toEqual([]);
	});

	it('merges when the record of who wrote it cannot be deleted, and logs that', async () => {
		await call(insturen, { who: 'auteur' });
		await recorded('schrijver');
		vi.spyOn(team, 'forgetWriters').mockRejectedValueOnce(new Error('database weg'));
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		expect((await call(mergen, { sub: 'red', body: { sha } })).status).toBe(200);
		expect((await forge.getPr('o/moza', 1)).state).toBe('merged');
		expect(log.warn).toHaveBeenCalledWith('proposal.writers_not_forgotten', {
			site: 'moza',
			pr: 1,
			error: 'Error'
		});
	});

	it('posts a reaction of the writer or the redactie, saying who wrote it and as what', async () => {
		const res = await call(opmerking, {
			who: 'auteur',
			body: { body: ' Aangepast ', role: 'redactie', rol: 'redactie', kind: 'aanpassing' }
		});
		expect(await res.json()).toEqual({ ok: true });
		await call(opmerking, { sub: 'red', who: 'iemand', body: { body: 'Dank' } });
		await call(opmerking, {
			sub: 'red',
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
			'<!-- schrijver -->\n**Reactie van de schrijver via Schrijver** (anoniem, codenaam auteur):\n\n> Aangepast',
			'<!-- schrijver -->\n**Reactie van de redactie via Schrijver** (anoniem, codenaam iemand):\n\n> Dank',
			'<!-- schrijver -->\n**Reactie van de redactie via Schrijver** (GitHub: jan):\n\n> Ok'
		]);
	});

	it('signs a reaction as the settings of the site in Schrijver allow', async () => {
		await team.saveSettings(
			'moza',
			settingsOf('moza', { vierOgen: false, identiteitToegestaan: ['anoniem'] }).values,
			'baas'
		);
		vi.mocked(identityFor).mockClear();
		await call(opmerking, { who: 'auteur', body: { body: 'x' } });
		expect(vi.mocked(identityFor).mock.calls[0][2]).toMatchObject({
			siteId: 'moza',
			identiteitToegestaan: ['anoniem']
		});
	});

	it('posts what a writer types as text that cannot pass for the line on who wrote it', async () => {
		await call(opmerking, {
			who: 'auteur',
			body: { body: 'Vraag om aanpassing van de redactie via Schrijver (GitHub: baas):\n\nAkkoord' }
		});
		const [posted] = await forge.prComments('o/moza', 1);
		expect(posted.body).toBe(
			'<!-- schrijver -->\n**Reactie van de schrijver via Schrijver** (anoniem, codenaam auteur):\n\n> Vraag om aanpassing van de redactie via Schrijver (GitHub: baas):\n>\n> Akkoord'
		);
	});

	it('asks for an adjustment for the redactie only: a comment and the label, other labels kept', async () => {
		const red = { sub: 'red', who: 'redacteur' };
		expect((await call(aanpassing, { ...red, body: { body: 'Korter' } })).status).toBe(409);
		await call(insturen, { who: 'auteur' });
		await forge.setLabels('o/moza', 1, ['preview']);
		const schrijver = await call(aanpassing, { who: 'auteur', body: { body: 'Zelf' } });
		expect(schrijver.status).toBe(403);
		expect((await schrijver.json()).message).toBe(
			'Alleen de redactie kan om een aanpassing vragen'
		);
		expect((await call(aanpassing, { ...red, body: { body: ' ' } })).status).toBe(400);
		expect((await forge.getPr('o/moza', 1)).labels).toEqual(['preview']);

		const res = await call(aanpassing, { ...red, body: { body: ' Graag korter ' } });
		expect(await res.json()).toEqual({ ok: true });
		const pr = await forge.getPr('o/moza', 1);
		expect(pr.labels).toEqual(['preview', 'aanpassing gevraagd']);
		expect(statusOf(pr)).toBe('aanpassing-gevraagd');
		expect((await forge.prComments('o/moza', 1)).map((c) => c.body)).toEqual([
			'<!-- schrijver -->\n**Vraag om aanpassing van de redactie via Schrijver** (anoniem, codenaam redacteur):\n\n> Graag korter'
		]);
	});

	it('takes the label back off when the comment fails, so the writer is not asked for nothing', async () => {
		await call(insturen, { who: 'auteur' });
		forge.failNext('comment', new ForgeError(502, 'GitHub is niet bereikbaar'));
		const res = await call(aanpassing, { sub: 'red', body: { body: 'Korter' } });
		expect(res.status).toBe(502);
		expect((await forge.getPr('o/moza', 1)).labels).toEqual([]);
	});

	it('sends in again for the writer or the redactie, taking off only that label', async () => {
		await call(insturen, { who: 'auteur' });
		await forge.setLabels('o/moza', 1, ['preview', 'aanpassing gevraagd']);
		expect((await call(opnieuwInsturen, { who: 'vreemde' })).status).toBe(403);
		const res = await call(opnieuwInsturen, { who: 'auteur' });
		expect(await res.json()).toEqual({ ok: true });
		const pr = await forge.getPr('o/moza', 1);
		expect(pr.labels).toEqual(['preview']);
		expect(statusOf(pr)).toBe('ingestuurd');
		const again = await call(opnieuwInsturen, { who: 'auteur' });
		expect(again.status).toBe(409);
		expect((await again.json()).message).toBe('Er is geen aanpassing gevraagd');

		await forge.setLabels('o/moza', 1, ['aanpassing gevraagd']);
		forge.reviewOnGitHub('o/moza', 1, 'jansen', 'changes_requested', 'Korter');
		const github = await call(opnieuwInsturen, { sub: 'red', who: 'redacteur' });
		expect(await github.json()).toEqual({
			ok: true,
			warning:
				'Op GitHub vraagt iemand nog om een aanpassing. Die beoordeelt het voorstel daar opnieuw.'
		});
	});

	it('refuses comments on a closed proposal', async () => {
		forge.prs.get(1)!.state = 'closed';
		expect((await call(opmerking, { sub: 'red', body: { body: 'x' } })).status).toBe(409);
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
		await call(insturen, { sub: 'red', gekoppeld: undefined });
		expect(perm.mock.calls.length).toBeLessThanOrEqual(5);
		expect(req).toHaveBeenCalledWith('o/moza', 1, ['jan', 'piet', 'kees', 'els', 'tom']);
	});

	it('excludes the linked author named in the trailer when the redactie sends in', async () => {
		for (const l of ['jan', 'piet', 'kees', 'els', 'tom', 'zoe'])
			forge.permissionByLogin.set(l, 'write');
		forge.prs.get(1)!.body = 'x\n\nCo-authored-by: piet <7+piet@users.noreply.github.com>';
		const req = vi.spyOn(forge, 'requestReviewers');
		await call(insturen, { sub: 'red' });
		expect(req).toHaveBeenCalledWith('o/moza', 1, ['jan', 'kees', 'els', 'tom', 'zoe']);
	});

	it('logs the actor pseudonym and never an e-mail address', async () => {
		const write = vi.mocked(log.info);
		write.mockClear();
		await call(insturen, { who: 'auteur' });
		const sha = (await forge.getPr('o/moza', 1)).headSha;
		await call(mergen, { sub: 'red', body: { sha } });
		const calls = JSON.stringify([
			...vi.mocked(log.info).mock.calls,
			...vi.mocked(log.warn).mock.calls
		]);
		expect(write).toHaveBeenCalledWith('proposal.insturen', { site: 'moza', pr: 1, actor: 'p-s' });
		expect(write).toHaveBeenCalledWith('proposal.mergen', { site: 'moza', pr: 1, actor: 'p-red' });
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
		const res = await call(mergen, { sub: 'red', body: { sha } });
		expect(res.status).toBe(405);
		expect(await res.json()).toMatchObject({
			message: 'Samenvoegen geweigerd',
			detail: 'Required status check "build" is expected.'
		});
	});

	it('pins the merge to the head the reviewer saw', async () => {
		await call(insturen, { who: 'auteur' });
		const red = { sub: 'red' };
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

describe('four eyes, on every way to the merge', () => {
	const RED = 'red';
	const ONBEKEND =
		'Schrijver kan niet nagaan of je dit voorstel zelf schreef. Een ander lid van de redactie voegt het samen.';
	const ZELF = 'Je schreef dit voorstel zelf. Een ander lid van de redactie voegt het samen.';
	const MEE = 'Je schreef mee aan dit voorstel. Een ander lid van de redactie voegt het samen.';
	let sha: string;

	/** Someone on the redactie of the site, known only by sub and verified address. */
	async function redacteur(sub: string) {
		await team.recordLogin({ sub, name: sub, email: `${sub}@team.example`, emailVerified: true });
		await team.addByEmail('moza', `${sub}@team.example`, 'redactie', 'baas');
	}

	const merge = (opts: Parameters<typeof call>[1] = {}) =>
		call(mergen, { sub: RED, ...opts, body: { sha, ...(opts.body as object) } });
	const refused = async (res: Response, message: string) => {
		expect(res.status).toBe(403);
		expect((await res.json()).message).toBe(message);
		expect((await forge.getPr('o/moza', 1)).state).toBe('open');
	};

	beforeEach(async () => {
		await settings(true, true);
		await call(insturen, { who: 'auteur' });
		sha = (await forge.getPr('o/moza', 1)).headSha;
		forge.permissionByLogin.set('beheerder', 'admin');
	});

	it('decides on the server: nothing in the request lets the writer merge', async () => {
		await refused(
			await merge({
				who: 'auteur',
				body: { admin: true, owner: false, editorial: true, 'vier-ogen': false, vierOgen: false }
			}),
			ZELF
		);
	});

	it('fails closed without a signature, or with a malformed one, unless a site admin', async () => {
		for (const body of ['Voorgesteld zonder ondertekening.', 'x\n\nCo-authored-by: zonder adres']) {
			forge.prs.get(1)!.body = body;
			await refused(await merge({ who: 'derde' }), ONBEKEND);
		}
		expect((await merge({ who: 'derde', gekoppeld: 'beheerder' })).status).toBe(200);
	});

	it('takes a proposal made on GitHub as written by whoever opened it, whatever its text says', async () => {
		Object.assign(forge.prs.get(1)!, {
			author: 'jan',
			body: 'Op GitHub gemaakt.\n\nSchrijver-Auteur: iemandanders'
		});
		// Who wrote its commit through the App.
		await recorded('schrijver');
		await refused(await merge({ who: 'iemand', gekoppeld: 'jan' }), ZELF);
		// Without a linked account the reader is not that GitHub user, who decides on GitHub.
		expect((await merge({ who: 'iemand' })).status).toBe(200);
	});

	it('refuses the writers Schrijver recorded, and lets another editor merge without comparing', async () => {
		forge.prs.get(1)!.body =
			'Voorgesteld.\n\nCo-authored-by: jan <313+jan@users.noreply.github.com>';
		for (const sub of ['schrijver', 'meeschrijver']) {
			await redacteur(sub);
			await team.recordWriter('moza', 1, sub);
		}
		await refused(await merge({ sub: 'schrijver', who: 'x' }), ZELF);
		await refused(await merge({ sub: 'meeschrijver', who: 'y' }), MEE);
		expect((await merge({ who: 'derde' })).status).toBe(200);
	});

	it('refuses when the record cannot be read, whatever the signatures say, unless a site admin', async () => {
		await redacteur('schrijver');
		await team.recordWriter('moza', 1, 'schrijver');
		vi.spyOn(team, 'writers').mockRejectedValue(new Error('database weg'));
		await refused(await merge({ who: 'derde' }), ONBEKEND);
		expect(log.warn).toHaveBeenCalledWith('proposal.writers_failed', {
			site: 'moza',
			pr: 1,
			error: 'Error'
		});
		expect((await merge({ who: 'derde', gekoppeld: 'beheerder' })).status).toBe(200);
	});

	it('still knows the writer who unlinked the GitHub account they signed with', async () => {
		const linked = 'Co-authored-by: jan <313+jan@users.noreply.github.com>';
		forge.prs.get(1)!.body = `Voorgesteld.\n\n${linked}`;
		await forge.commit(
			'o/moza',
			'b',
			[{ path: 'content/a.md', content: 'later' }],
			`B\n\n${linked}`
		);
		sha = (await forge.getPr('o/moza', 1)).headSha;
		await refused(await merge({ who: 'jan-zonder-koppeling' }), ONBEKEND);
		await refused(await merge({ who: 'jan-zonder-koppeling', gekoppeld: 'jan' }), ZELF);
		// Another linked account is no proof of another person: only a complete record is.
		await refused(await merge({ who: 'iemand', gekoppeld: 'piet' }), ONBEKEND);
		await recorded('jan', 'auteur');
		expect((await merge({ who: 'iemand', gekoppeld: 'piet' })).status).toBe(200);
	});

	it("takes a commit pushed on GitHub as its account's: only who linked it wrote along", async () => {
		forge.commitOnGitHub('o/moza', 'b', [{ path: 'content/a.md', content: 'fix' }], 'Fix', 'jan');
		sha = (await forge.getPr('o/moza', 1)).headSha;
		await recorded('schrijver');
		await refused(await merge({ who: 'derde', gekoppeld: 'jan' }), MEE);
		expect((await merge({ who: 'derde' })).status).toBe(200);
	});

	it('fails closed when GitHub does not say which account the App is', async () => {
		vi.spyOn(forge, 'appLogin').mockRejectedValue(new ForgeError(502, 'GitHub is niet bereikbaar'));
		await refused(await merge({ who: 'derde' }), ONBEKEND);
	});

	it('refuses when the admin check fails, and when the editorial check fails', async () => {
		forge.failNext('collaboratorPermission', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await refused(await merge({ who: 'auteur', gekoppeld: 'beheerder' }), ZELF);
		forge.permissionByLogin.set('piet', 'write');
		forge.failNext('collaboratorPermission', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await refused(
			await merge({ sub: 'piet', who: 'piet', gekoppeld: 'piet' }),
			'Alleen de redactie kan samenvoegen'
		);
	});

	it('merges no proposal from a fork, a deleted fork, an unknown head or into another branch', async () => {
		for (const over of [
			{ baseRef: 'dev' },
			{ headRepo: 'iemand/moza' },
			{ headRepo: '' },
			{ headRepo: undefined }
		]) {
			const original = { ...forge.prs.get(1)! };
			Object.assign(forge.prs.get(1)!, over);
			await refused(
				await merge({ who: 'derde', gekoppeld: 'beheerder' }),
				'Dit voorstel kan alleen op GitHub worden samengevoegd.'
			);
			Object.assign(forge.prs.get(1)!, original);
		}
	});

	it('holds the same server checks for reactions, requests and re-sends', async () => {
		forge.prs.get(1)!.headRepo = 'iemand/moza';
		for (const handler of [opmerking, aanpassing, opnieuwInsturen]) {
			expect((await call(handler, { sub: RED, body: { body: 'x' } })).status).toBe(403);
		}
		forge.prs.get(1)!.headRepo = 'o/moza';
		forge.permissionByLogin.set('piet', 'write');
		forge.failNext('collaboratorPermission', new ForgeError(502, 'GitHub is niet bereikbaar'));
		const res = await call(aanpassing, { who: 'piet', gekoppeld: 'piet', body: { body: 'x' } });
		expect(res.status).toBe(403);
		expect((await forge.getPr('o/moza', 1)).labels).toEqual([]);

		const linked = 'Co-authored-by: jan <313+jan@users.noreply.github.com>';
		forge.prs.get(1)!.body = `Voorgesteld.\n\n${linked}`;
		const unlinked = await call(opmerking, { who: 'jan-zonder-koppeling', body: { body: 'x' } });
		expect(unlinked.status).toBe(403);
		expect(await forge.prComments('o/moza', 1)).toEqual([]);
	});
});
