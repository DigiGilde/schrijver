import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	canAct,
	cleanComment,
	commentProposal,
	mergeProposal,
	pickReviewers,
	sendIn
} from '../../src/lib/forge/proposal-actions';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { isSentIn } from '../../src/lib/forge/proposals';
import { identityTrailer, trailersFromMessage } from '../../src/lib/forge/trailers';
import type { SiteConfig } from '../../src/lib/config/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
import { log } from '../../src/lib/log';

const site = (over: Partial<SiteConfig> & { label?: boolean } = {}): SiteConfig =>
	({
		id: 'moza',
		repo: 'o/moza',
		standaardbranch: 'main',
		content: { pad: 'content' },
		review: {
			model: 'goedkeuring',
			'mergen-vanuit-schrijver': true,
			redactie: ['red@example.org']
		},
		preview: { soort: 'bij-label', label: 'preview', url: 'https://p/{nummer}' },
		...over
	}) as unknown as SiteConfig;

const trailer = identityTrailer({ kind: 'anoniem', pseudoniem: 'abc' });
let forge: FakeForge;
async function draft(repo = 'o/moza', path = 'content/a.md') {
	forge.seedRepo(repo, 'main', { [path]: 'oud' });
	await forge.createBranch(repo, 'main', 'b');
	await forge.commit(repo, 'b', [{ path, content: 'nieuw' }], `Bewerk\n\n${trailer}`);
	return forge.openDraftPr(repo, 'b', 'main', 'Titel', `Voorgesteld.\n\n${trailer}`);
}

beforeEach(() => {
	forge = new FakeForge();
	vi.clearAllMocks();
});

describe('sendIn', () => {
	it('marks ready, labels bij-label sites, lists pages and requests reviewers', async () => {
		const pr = await draft();
		const spy = vi.spyOn(forge, 'requestReviewers');
		await sendIn(forge, site(), pr, { reviewers: ['jan'], filesAdded: false });
		const after = await forge.getPr('o/moza', pr.number);
		expect(after.draft).toBe(false);
		expect(after.labels).toEqual(['preview']);
		expect(after.body).toContain("Pagina's:\n- content/a.md");
		expect(after.body).not.toContain('Menu bijwerken');
		expect(spy).toHaveBeenCalledWith('o/moza', pr.number, ['jan']);
		expect(log.info).toHaveBeenCalledWith('proposal.sent', { site: 'moza', pr: pr.number });
	});

	it('keeps existing labels and does not label bij-push sites', async () => {
		const pr = await draft('o/handboek', 'docs/a.md');
		await forge.setLabels('o/handboek', pr.number, ['x']);
		const digi = site({
			id: 'digi',
			repo: 'o/handboek',
			content: { pad: 'docs' },
			preview: { soort: 'bij-push', url: 'https://p/{nummer}' }
		} as never);
		await sendIn(forge, digi, { ...pr, labels: ['x'] }, { reviewers: [], filesAdded: false });
		expect((await forge.getPr('o/handboek', pr.number)).labels).toEqual(['x']);
	});

	it('adds the menu line when a file was added and skips empty reviewers', async () => {
		const pr = await draft();
		const spy = vi.spyOn(forge, 'requestReviewers');
		await sendIn(forge, site(), pr, { reviewers: [], filesAdded: true });
		expect((await forge.getPr('o/moza', pr.number)).body).toContain(
			'Menu bijwerken: deze wijziging voegt'
		);
		expect(spy).not.toHaveBeenCalled();
	});

	it('falls back to a comment when markReady is refused with 403', async () => {
		const pr = await draft();
		forge.failNext('markReady', new ForgeError(403, 'Geen rechten'));
		const comment = vi.spyOn(forge, 'comment');
		await sendIn(forge, site(), pr, { reviewers: [], filesAdded: false });
		expect(comment).toHaveBeenCalledWith('o/moza', pr.number, 'Klaar voor beoordeling');
		expect(log.warn).toHaveBeenCalledWith('proposal.markready_fallback', {
			site: 'moza',
			pr: pr.number
		});
		const after = await forge.getPr('o/moza', pr.number);
		expect(after.body).toContain('Schrijver-Status: ingestuurd');
		expect(isSentIn(after)).toBe(true);
	});

	it('is idempotent: a second send-in does not duplicate sections', async () => {
		const pr = await draft();
		forge.failNext('markReady', new ForgeError(403, 'Geen rechten'));
		await sendIn(forge, site(), pr, { reviewers: [], filesAdded: true });
		const once = await forge.getPr('o/moza', pr.number);
		forge.failNext('markReady', new ForgeError(403, 'Geen rechten'));
		await sendIn(forge, site(), once, { reviewers: [], filesAdded: true });
		const twice = await forge.getPr('o/moza', pr.number);
		expect(twice.body).toBe(once.body);
		expect(twice.body.match(/Pagina's:/g)).toHaveLength(1);
		expect(twice.body.match(/Menu bijwerken/g)).toHaveLength(1);
	});

	it('marks ready last and survives a failing reviewer request', async () => {
		const pr = await draft();
		const order: string[] = [];
		for (const op of ['setLabels', 'updatePr', 'requestReviewers', 'markReady'] as const) {
			const orig = forge[op].bind(forge) as (...a: unknown[]) => Promise<void>;
			(forge as unknown as Record<string, unknown>)[op] = async (...a: unknown[]) => {
				order.push(op);
				return orig(...a);
			};
		}
		forge.failNext('requestReviewers', new ForgeError(422, 'Geen reviewer'));
		await sendIn(forge, site(), pr, { reviewers: ['jan'], filesAdded: false });
		expect(order).toEqual(['setLabels', 'updatePr', 'requestReviewers', 'markReady']);
		expect((await forge.getPr('o/moza', pr.number)).draft).toBe(false);
	});

	it('warns when the proposal is not mergeable', async () => {
		const pr = await draft();
		forge.mergeableByPr.set(pr.number, false);
		const fresh = await forge.getPr('o/moza', pr.number);
		expect(
			(await sendIn(forge, site(), fresh, { reviewers: [], filesAdded: false })).warning
		).toContain('niet automatisch');
	});

	it('rethrows other markReady errors', async () => {
		const pr = await draft();
		forge.failNext('markReady', new ForgeError(500, 'Kapot'));
		await expect(sendIn(forge, site(), pr, { reviewers: [], filesAdded: false })).rejects.toThrow(
			'Kapot'
		);
	});
});

describe('approve, comment, merge', () => {
	it('validates comments', async () => {
		expect(cleanComment('  hoi ')).toBe('hoi');
		expect(cleanComment('   ')).toBeNull();
		expect(cleanComment('x'.repeat(5001))).toBeNull();
		expect(cleanComment(3)).toBeNull();
		const pr = await draft();
		await expect(commentProposal(forge, site(), pr.number, ' ')).rejects.toThrow();
		const spy = vi.spyOn(forge, 'comment');
		await commentProposal(forge, site(), pr.number, ' Mooi ');
		expect(spy).toHaveBeenCalledWith(
			'o/moza',
			pr.number,
			'Opmerking van de redactie via Schrijver:\n\nMooi'
		);
	});

	it('squashes with the title, number and distinct trailers', async () => {
		const pr = await draft();
		const other = 'Co-authored-by: Jan <1+jan@users.noreply.github.com>';
		await mergeProposal(forge, site(), pr, [trailer, other, trailer]);
		const merged = forge.commitsOf('o/moza', 'main').at(-1)!.message;
		expect(merged).toBe(`Titel (#${pr.number})\n\n${trailer}\n${other}`);
		expect((await forge.getPr('o/moza', pr.number)).state).toBe('merged');
	});

	it('extracts trailers from a commit message', async () => {
		const pr = await draft();
		const commits = await forge.prCommits('o/moza', pr.number);
		expect(commits.flatMap((c) => trailersFromMessage(c.message))).toEqual([trailer]);
	});

	it('surfaces a refused merge as a ForgeError with detail', async () => {
		const pr = await draft();
		forge.failNext(
			'merge',
			new ForgeError(405, 'Samenvoegen geweigerd', 'Required status check "build" is expected.')
		);
		await expect(mergeProposal(forge, site(), pr, [])).rejects.toMatchObject({
			status: 405,
			detail: 'Required status check "build" is expected.'
		});
	});
});

describe('merge and removed images', () => {
	const X = 'content/images/x.png';
	const red = (message: string) => ({ status: 422, message });
	let p: Awaited<ReturnType<typeof forge.openDraftPr>>;

	beforeEach(async () => {
		forge.seedRepo('o/moza', 'main', {
			'content/a.md': '# A\n\n![X](images/x.png)\n',
			[X]: 'png'
		});
		await forge.createBranch('o/moza', 'main', 'p');
		await forge.commit(
			'o/moza',
			'p',
			[
				{ path: 'content/a.md', content: '# A\n' },
				{ path: X, deleted: true }
			],
			`Bewerk\n\n${trailer}`
		);
		p = await forge.openDraftPr('o/moza', 'p', 'main', 'P', `Voorgesteld.\n\n${trailer}`);
	});

	it('merges a proposal whose removed image no page shows any more', async () => {
		await mergeProposal(forge, site(), p, [trailer]);
		expect(forge.fileText('o/moza', 'main', X)).toBeNull();
		expect(forge.fileText('o/moza', 'main', 'content/a.md')).toBe('# A\n');
	});

	it('refuses while a page merged into the base since shows the image, and names it', async () => {
		await forge.createBranch('o/moza', 'main', 'q');
		await forge.commit(
			'o/moza',
			'q',
			[{ path: 'content/b.md', content: '![X](images/x.png)\n' }],
			'q'
		);
		const q = await forge.openDraftPr('o/moza', 'q', 'main', 'Q', '');
		await mergeProposal(forge, site(), q, []);
		await expect(mergeProposal(forge, site(), p, [trailer])).rejects.toMatchObject(
			red(
				'Niet samengevoegd: dit voorstel verwijdert x.png, maar die afbeelding staat nog op content/b.md.'
			)
		);
		expect(forge.fileText('o/moza', 'main', X)).toBe('png');
		expect((await forge.getPr('o/moza', p.number)).state).toBe('open');
	});

	it('refuses while a page the proposal changes still shows the image', async () => {
		await forge.commit(
			'o/moza',
			'p',
			[{ path: 'content/a.md', content: '![X](images/x.png)\n' }],
			'weer'
		);
		await expect(mergeProposal(forge, site(), p, [trailer])).rejects.toMatchObject(
			red(
				'Niet samengevoegd: dit voorstel verwijdert x.png, maar die afbeelding staat nog op content/a.md.'
			)
		);
	});

	it('counts the old path of a renamed image as removed', async () => {
		await forge.commit('o/moza', 'main', [{ path: 'content/c.md', content: 'Zie x.png.\n' }], 'c');
		vi.spyOn(forge, 'prFiles').mockResolvedValue([
			{ path: 'content/a.md', status: 'modified' },
			{ path: 'content/images/y.png', status: 'modified', previous: X }
		]);
		await expect(mergeProposal(forge, site(), p, [trailer])).rejects.toMatchObject(
			red(
				'Niet samengevoegd: dit voorstel verwijdert x.png, maar die afbeelding wordt mogelijk gebruikt op content/c.md.'
			)
		);
	});

	it('merges a removal while another page shows its own image of the same name', async () => {
		await forge.commit(
			'o/moza',
			'main',
			[
				{ path: 'content/b/images/x.png', content: 'eigen png' },
				{ path: 'content/b/index.md', content: '# B\n\n![X](images/x.png)\n' }
			],
			'b'
		);
		await mergeProposal(forge, site(), p, [trailer]);
		expect(forge.fileText('o/moza', 'main', X)).toBeNull();
		expect(forge.fileText('o/moza', 'main', 'content/b/images/x.png')).toBe('eigen png');
	});

	it('merges a proposal of more files than GitHub lists on one page', async () => {
		await forge.createBranch('o/moza', 'main', 'groot');
		await forge.commit(
			'o/moza',
			'groot',
			Array.from({ length: 150 }, (_, i) => ({ path: `content/${i}.md`, content: `# ${i}\n` })),
			'groot'
		);
		const groot = await forge.openDraftPr('o/moza', 'groot', 'main', 'Groot', '');
		await mergeProposal(forge, site(), groot, []);
		expect(forge.fileText('o/moza', 'main', 'content/149.md')).toBe('# 149\n');
	});

	it('refuses a proposal of more files than GitHub lists at all', async () => {
		await forge.createBranch('o/moza', 'main', 'enorm');
		await forge.commit(
			'o/moza',
			'enorm',
			Array.from({ length: 3001 }, (_, i) => ({ path: `content/${i}.md`, content: `# ${i}\n` })),
			'enorm'
		);
		const enorm = await forge.openDraftPr('o/moza', 'enorm', 'main', 'Enorm', '');
		await expect(mergeProposal(forge, site(), enorm, [])).rejects.toMatchObject(
			red(
				'Niet samengevoegd: Schrijver kan niet nagaan of een afbeelding die dit voorstel verwijdert nog op een pagina staat. Voeg samen op GitHub.'
			)
		);
		expect(forge.fileText('o/moza', 'main', 'content/0.md')).toBeNull();
	});

	it('refuses when it cannot see every file the proposal changes or every page', async () => {
		const unchecked =
			'Niet samengevoegd: Schrijver kan niet nagaan of een afbeelding die dit voorstel verwijdert nog op een pagina staat. Voeg samen op GitHub.';
		const prFiles = vi.spyOn(forge, 'prFiles').mockResolvedValueOnce(
			Array.from({ length: 3000 }, (_, i) => ({
				path: `content/${i}.md`,
				status: 'added' as const
			}))
		);
		await expect(mergeProposal(forge, site(), p, [trailer])).rejects.toMatchObject(red(unchecked));
		prFiles.mockRestore();
		const readTree = forge.readTree.bind(forge);
		vi.spyOn(forge, 'readTree').mockImplementation(async (...args) =>
			Object.assign(await readTree(...args), { truncated: true as const })
		);
		await expect(mergeProposal(forge, site(), p, [trailer])).rejects.toMatchObject(red(unchecked));
		expect(forge.fileText('o/moza', 'main', X)).toBe('png');
	});
});

describe('pickReviewers', () => {
	it('checks at most five logins, excludes the actor and keeps writers', async () => {
		for (const l of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) forge.permissionByLogin.set(l, 'write');
		forge.permissionByLogin.set('c', 'read');
		const spy = vi.spyOn(forge, 'collaboratorPermission');
		const picked = await pickReviewers(forge, site(), ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'a');
		expect(spy).toHaveBeenCalledTimes(5);
		expect(picked).toEqual(['b', 'd', 'e', 'f']);
	});

	it('keeps everyone when nothing is excluded and skips failing lookups', async () => {
		forge.permissionByLogin.set('a', 'admin');
		forge.permissionByLogin.set('b', 'write');
		forge.failNext('collaboratorPermission', new ForgeError(500, 'Kapot'));
		expect(await pickReviewers(forge, site(), ['a', 'b'], null)).toEqual(['b']);
	});
});

describe('canAct', () => {
	it('detects owner and editorial', async () => {
		const pr = await draft();
		const user = {
			identities: [{ kind: 'anoniem' as const, pseudoniem: 'abc' }],
			email: 'red@example.org',
			emailVerified: true,
			githubLogin: null,
			identityKind: 'anoniem' as const
		};
		expect(await canAct(user, site(), pr, forge)).toEqual({ owner: true, editorial: true });
		const fork = { ...pr, headRepo: 'fork/moza' };
		expect(await canAct(user, site(), { ...pr, headRepo: 'O/MOZA' }, forge)).toMatchObject({
			owner: true
		});
		expect(await canAct(user, site(), fork, forge)).toEqual({ owner: false, editorial: false });
		expect(await canAct(user, site(), { ...pr, baseRef: 'dev' }, forge)).toEqual({
			owner: false,
			editorial: false
		});
		expect(await canAct({ ...user, identities: [], email: 'a@b.nl' }, site(), pr, forge)).toEqual({
			owner: false,
			editorial: false
		});
	});
});
