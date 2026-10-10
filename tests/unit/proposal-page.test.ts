import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { commentBody } from '../../src/lib/forge/conversation';
import { dateText } from '../../src/lib/forge/status';
import { identityTrailer, pseudonym } from '../../src/lib/forge/trailers';
import type { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError, MAX_PR_COMMITS } from '../../src/lib/forge/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/sites/[site]/voorstellen/[nummer]/+page.server';
import type { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeams } from './team-fixture';

const REPO = 'DigiGilde/handboek';
let forge: FakeForge;

const session: Session = {
	sub: 'lezer',
	name: 'Lezer',
	email: 'iemand@example.org',
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
};
const prefs: UserPrefs = {
	sub: 'lezer',
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true
};

interface Diff {
	path: string;
	teGroot: boolean;
	before: string | null;
	after: string | null;
	source: { kind: string; text?: string }[];
}
interface Data {
	diffs: Diff[];
	nietVergeleken: number;
	terug: string;
}

async function proposal(slug: string, files: Record<string, string>): Promise<number> {
	const branch = `schrijver/digi-handboek/${slug}`;
	await forge.createBranch(REPO, 'main', branch);
	await forge.commit(
		REPO,
		branch,
		Object.entries(files).map(([path, content]) => ({ path, content })),
		slug
	);
	const pr = await forge.openDraftPr(
		REPO,
		branch,
		'main',
		slug,
		identityTrailer({ kind: 'anoniem', pseudoniem: 'iemandanders' })
	);
	return pr.number;
}

// On the redactie of digi-handboek only.
const EDITOR = 'redacteur';
// On the redactie of the MOZa site, which asks for four eyes and, in the fake, an approval on GitHub.
const MOZA_EDITOR = 'moza-redacteur';
const MOZA_OTHER_EDITOR = 'moza-redacteur-2';
let team: MemoryTeamStore;

async function visit(nummer: number, { query = '', sub = session.sub } = {}): Promise<Data> {
	return (await load({
		params: { site: 'digi-handboek', nummer: String(nummer) },
		url: new URL(`http://x/sites/digi-handboek/voorstellen/${nummer}${query}`),
		locals: { user: { session: { ...session, sub }, prefs: { ...prefs, sub } } }
	} as never)) as Data;
}

beforeAll(async () => {
	process.env.PSEUDONYM_SECRET = 'proposal-page-test-secret';
	const services = await buildFakeServices();
	forge = services.forge;
	setForge(forge);
	setConfigStore(services.store);
	team = await useTeams(services.store.sites(), {
		'digi-handboek': { [EDITOR]: 'redactie' },
		'moza-site': { [MOZA_EDITOR]: 'redactie', [MOZA_OTHER_EDITOR]: 'redactie' }
	});
});

describe('the fake forge of the local preview', () => {
	it('asks for an approval on GitHub on the MOZa site and not on Digi Handboek', async () => {
		expect(await forge.reviewDecision('MinBZK/moza-site', 2)).toBe('review_required');
		expect(await forge.reviewDecision(REPO, 1)).toBeNull();
	});
});

describe('proposal page load', () => {
	it('compares at most 20 pages and counts the rest', async () => {
		const files: Record<string, string> = {};
		for (let i = 0; i < 25; i++)
			files[`docs/veel/pagina-${String(i).padStart(2, '0')}.md`] = `# ${i}\n`;
		const data = await visit(await proposal('veel-aaaa', files));
		expect(data.diffs).toHaveLength(20);
		expect(data.nietVergeleken).toBe(5);
	});

	it('does not fetch or send a page above the size limit', async () => {
		const data = await visit(
			await proposal('groot-bbbb', { 'docs/groot.md': `# Groot\n\n${'x'.repeat(600_000)}\n` })
		);
		expect(data.diffs).toEqual([
			expect.objectContaining({ path: 'docs/groot.md', teGroot: true, before: null, after: null })
		]);
		expect(data.nietVergeleken).toBe(0);
	});
});

describe('what the comparison starts from', () => {
	// The images follow: the page asks for them by the proposal's number, see bestand.test.ts.
	const LICENTIE = 'docs/over/licentie.md';
	const own = (text: string) => `${text}\nEen zin van het voorstel.\n`;
	const site = (text: string) => `${text}\nEen zin die intussen op de site kwam.\n`;

	it('is the page as the proposal found it, whatever the site changed since', async () => {
		const original = forge.fileText(REPO, 'main', LICENTIE)!;
		const nummer = await proposal('begin-eeee', { [LICENTIE]: own(original) });
		await forge.commit(REPO, 'main', [{ path: LICENTIE, content: site(original) }], 'Op de site');
		const [diff] = (await visit(nummer)).diffs;
		expect(diff.before).toBe(original);
		expect(diff.after).toBe(own(original));
		expect(diff.source.map((part) => part.kind)).not.toContain('removed');
		expect(diff.source.filter((part) => part.kind === 'added')).toEqual([
			{ kind: 'added', text: '\nEen zin van het voorstel.\n' }
		]);
		expect(JSON.stringify(diff)).not.toContain('intussen op de site');
	});

	it('is the page as the proposal found it for a page that the proposal removes', async () => {
		const original = forge.fileText(REPO, 'main', 'docs/over/privacy.md')!;
		const branch = 'schrijver/digi-handboek/weg-ffff';
		await forge.createBranch(REPO, 'main', branch);
		await forge.commit(REPO, branch, [{ path: 'docs/over/privacy.md', deleted: true }], 'Weg');
		const nummer = (
			await forge.openDraftPr(
				REPO,
				branch,
				'main',
				'Weg',
				identityTrailer({ kind: 'anoniem', pseudoniem: 'iemandanders' })
			)
		).number;
		await forge.commit(
			REPO,
			'main',
			[{ path: 'docs/over/privacy.md', content: site(original) }],
			'Op de site'
		);
		const [diff] = (await visit(nummer)).diffs;
		expect(diff).toMatchObject({ before: original, after: null });
	});

	it('is the page as the proposal found it for a merged proposal, whose change the base branch holds now', async () => {
		const original = forge.fileText(REPO, 'main', 'docs/over/index.md')!;
		const nummer = await proposal('samengevoegd-jjjj', { 'docs/over/index.md': own(original) });
		await forge.markReady(REPO, nummer);
		await forge.merge(REPO, nummer, 'Samengevoegd');
		expect(forge.fileText(REPO, 'main', 'docs/over/index.md')).toBe(own(original));
		const [diff] = (await visit(nummer)).diffs;
		expect(diff).toMatchObject({ before: original, after: own(original) });
		expect(diff.source.map((part) => part.kind)).toContain('added');
	});

	it('is the page as the proposal found it after a merge on GitHub, in any of its three ways', async () => {
		for (const [how, page] of [
			['merge', 'docs/werkwijze/principes.md'],
			['squash', 'docs/werkwijze/code-review.md'],
			['rebase', 'docs/werkwijze/beslissingen-logboek.md']
		] as const) {
			const original = forge.fileText(REPO, 'main', page)!;
			const nummer = await proposal(`op-github-${how}`, { [page]: own(original) });
			await forge.markReady(REPO, nummer);
			forge.mergeOnGitHub(REPO, nummer, how);
			expect(forge.fileText(REPO, 'main', page), how).toBe(own(original));
			const [diff] = (await visit(nummer)).diffs;
			expect(diff, how).toMatchObject({ before: original, after: own(original) });
			expect(
				diff.source.map((part) => part.kind),
				how
			).toContain('added');
			expect(
				diff.source.map((part) => part.kind),
				how
			).not.toContain('removed');
		}
	});

	it('is not looked for when the proposal only adds pages', async () => {
		const nummer = await proposal('nieuw-gggg', { 'docs/nieuw-begin.md': '# Nieuw\n' });
		const mergeBase = vi.spyOn(forge, 'mergeBase');
		const [diff] = (await visit(nummer)).diffs;
		expect(diff).toMatchObject({ before: null, after: '# Nieuw\n' });
		expect(mergeBase).not.toHaveBeenCalled();
		mergeBase.mockRestore();
	});

	it('is asked once for all the pages, from the base branch and the commit of the head', async () => {
		const nummer = await proposal('twee-hhhh', {
			'docs/over/licentie.md': 'Een\n',
			'docs/over/kwetsbaarheid.md': 'Twee\n'
		});
		const mergeBase = vi.spyOn(forge, 'mergeBase');
		expect((await visit(nummer)).diffs).toHaveLength(2);
		expect(mergeBase).toHaveBeenCalledTimes(1);
		expect(mergeBase).toHaveBeenCalledWith(
			REPO,
			'main',
			(await forge.prHead(REPO, nummer)).headSha
		);
		mergeBase.mockRestore();
	});

	it('is not guessed from the base branch when the forge cannot tell', async () => {
		const nummer = await proposal('onbekend-iiii', { 'docs/over/licentie.md': 'Een\n' });
		forge.failNext('mergeBase', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await expect(visit(nummer)).rejects.toMatchObject({ status: 502 });
	});
});

describe('the way back from a proposal', () => {
	const LIST = '/sites/digi-handboek/voorstellen';
	let nummer: number;

	beforeAll(async () => {
		nummer = await proposal('terug-cccc', { 'docs/terug.md': '# Terug\n' });
	});

	it('returns to the list in the filter that the proposal was opened from', async () => {
		expect((await visit(nummer, { query: '?filter=alle' })).terug).toBe(`${LIST}?filter=alle`);
		expect((await visit(nummer, { query: '?filter=mijn' })).terug).toBe(`${LIST}?filter=mijn`);
		expect((await visit(nummer, { query: '?filter=beoordelen', sub: EDITOR })).terug).toBe(
			`${LIST}?filter=beoordelen`
		);
	});

	it('leaves it to the list to refuse a filter, and drops one that does not exist', async () => {
		expect((await visit(nummer, { query: '?filter=beoordelen' })).terug).toBe(
			`${LIST}?filter=beoordelen`
		);
		expect((await visit(nummer, { query: '?filter=iets' })).terug).toBe(LIST);
	});

	it('goes as the Voorstellen tab goes without a filter: to what waits, for editors only', async () => {
		expect((await visit(nummer, { sub: EDITOR })).terug, 'nothing waits yet').toBe(LIST);
		await forge.markReady(REPO, nummer);
		expect((await visit(nummer, { sub: EDITOR })).terug).toBe(`${LIST}?filter=beoordelen`);
		expect((await visit(nummer)).terug).toBe(LIST);
	});

	it('does the same for a proposal from a fork, which editors review as well', async () => {
		const fork = await proposal('fork-dddd', { 'docs/fork.md': '# Fork\n' });
		await forge.markReady(REPO, fork);
		forge.prs.get(fork)!.headRepo = 'iemand/handboek';
		expect((await visit(fork, { query: '?filter=beoordelen', sub: EDITOR })).terug).toBe(
			`${LIST}?filter=beoordelen`
		);
		expect((await visit(fork, { sub: EDITOR })).terug).toBe(`${LIST}?filter=beoordelen`);
	});

	it('still opens the plain list when the forge cannot tell what waits', async () => {
		forge.failNext('listPrs', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect((await visit(nummer, { sub: EDITOR })).terug).toBe(LIST);
	});
});

type SiteId = 'digi-handboek' | 'moza-site';
const REPOS: Record<SiteId, string> = {
	'digi-handboek': REPO,
	'moza-site': 'MinBZK/moza-site'
};

interface Page {
	ondertitel: string;
	stap: string | null;
	watNu: { sentence: string; actions: string[]; primary: string | null };
	voorbeeld: { url: string; stand: string } | null;
	diffs: { path: string; titel: string }[];
	andereBestanden: { soort: string; naam: string; status: string }[];
	nogMeerBestanden: number;
	gesprek: { items: { who: string; as: string; text: string }[]; volledig: boolean } | null;
	kanReageren: boolean;
	opnieuwBewerken: { page: string; titel: string; href: string }[];
}

let made = 0;
/**
 * A proposal on a site, signed by the user `door` or by someone else, or with the given signature,
 * and with the given body text. With `writer`, Schrijver recorded that user as its writer.
 */
async function make(
	site: SiteId,
	files: Record<string, string>,
	{
		door,
		sent = false,
		body,
		signature,
		writer
	}: { door?: string; sent?: boolean; body?: string; signature?: string; writer?: string } = {}
): Promise<number> {
	const repo = REPOS[site];
	const branch = `schrijver/${site}/test-${++made}`;
	await forge.createBranch(repo, 'main', branch);
	const who = door ? pseudonym(process.env.PSEUDONYM_SECRET!, door) : 'iemandanders';
	const trailer = signature ?? identityTrailer({ kind: 'anoniem', pseudoniem: who });
	await forge.commit(
		repo,
		branch,
		Object.entries(files).map(([path, content]) => ({ path, content })),
		`Bewerk\n\n${trailer}`
	);
	const pr = await forge.openDraftPr(repo, branch, 'main', `Test ${made}`, body ?? trailer);
	if (sent) await forge.markReady(repo, pr.number);
	if (writer) {
		const email = `${writer}@schrijft.example`;
		await team.recordLogin({ sub: writer, name: writer, email, emailVerified: true });
		await team.recordWriter(site, pr.number, writer);
	}
	return pr.number;
}

async function open(
	site: SiteId,
	nummer: number,
	{ sub = session.sub, githubLogin = null as string | null } = {}
): Promise<Page> {
	return (await load({
		params: { site, nummer: String(nummer) },
		url: new URL(`http://x/sites/${site}/voorstellen/${nummer}`),
		locals: { user: { session: { ...session, sub }, prefs: { ...prefs, sub, githubLogin } } }
	} as never)) as Page;
}

describe('the line under the title', () => {
	it('says for which page, by whom and when it was last brought up to date', async () => {
		const nummer = await make('digi-handboek', { 'docs/kennis/nieuw.md': '# Nieuwe kennis\n' });
		const day = dateText((await forge.getPr(REPO, nummer)).updatedAt);
		expect((await open('digi-handboek', nummer)).ondertitel).toBe(
			`Voor de pagina Nieuwe kennis · van een anonieme collega · bijgewerkt ${day}`
		);
	});

	it('says jou to the writer, counts several pages, and names who opened it on GitHub', async () => {
		const mijn = await make(
			'digi-handboek',
			{ 'docs/kennis/een.md': '# Een\n', 'docs/kennis/twee.md': '# Twee\n' },
			{ door: 'lezer' }
		);
		expect((await open('digi-handboek', mijn)).ondertitel).toMatch(
			/^Voor 2 pagina's · van jou · bijgewerkt /
		);
		const github = await make('digi-handboek', { 'docs/kennis/drie.md': '# Drie\n' }, { body: '' });
		forge.prs.get(github)!.author = 'jansen';
		expect((await open('digi-handboek', github)).ondertitel).toMatch(
			/^Voor de pagina Drie · van jansen · /
		);
	});
});

describe('what now', () => {
	it('lets an editor of a site without four eyes decide on a sent-in proposal', async () => {
		const nummer = await make(
			'digi-handboek',
			{ 'docs/kennis/vier.md': '# Vier\n' },
			{ sent: true }
		);
		const page = await open('digi-handboek', nummer, { sub: EDITOR });
		expect(page.stap).toBe('Ingestuurd');
		expect(page.watNu).toMatchObject({
			actions: ['samenvoegen', 'vraag-om-aanpassing'],
			primary: 'samenvoegen'
		});
		expect(page.watNu.sentence).toMatch(/^Jij beslist\./);
	});

	it('asks for the approval on GitHub first where the site requires one', async () => {
		const nummer = await make(
			'moza-site',
			{ 'content/vijf.md': 'Vijf\n' },
			{ sent: true, writer: 'schrijver' }
		);
		const linked = { sub: MOZA_EDITOR, githubLogin: 'octo' };
		expect((await open('moza-site', nummer, linked)).watNu).toMatchObject({
			sentence: 'Deze site vraagt eerst een goedkeuring op GitHub. Daarna kun je hier samenvoegen.',
			actions: ['goedkeuren-op-github', 'vraag-om-aanpassing']
		});
		expect(
			(await open('moza-site', nummer, { sub: MOZA_EDITOR })).watNu,
			'without a GitHub account, someone with rights there approves'
		).toEqual({
			sentence:
				'Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed; daarna kun je hier samenvoegen. Moet er iets anders, vraag dan om een aanpassing.',
			actions: ['vraag-om-aanpassing'],
			primary: 'vraag-om-aanpassing'
		});
		forge.reviewOnGitHub('MinBZK/moza-site', nummer, 'jansen', 'approved', '');
		expect((await open('moza-site', nummer, { sub: MOZA_EDITOR })).watNu.actions).toEqual([
			'samenvoegen',
			'vraag-om-aanpassing'
		]);
	});

	it('offers the merge when GitHub cannot say whether an approval is missing', async () => {
		const nummer = await make(
			'moza-site',
			{ 'content/zes.md': 'Zes\n' },
			{ sent: true, writer: 'schrijver' }
		);
		forge.failNext('reviewDecision', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect((await open('moza-site', nummer, { sub: MOZA_EDITOR })).watNu.actions).toEqual([
			'samenvoegen',
			'vraag-om-aanpassing'
		]);
	});

	it('leaves the decision on an own proposal to another editor where four eyes hold', async () => {
		const eigen = await make(
			'moza-site',
			{ 'content/zeven.md': 'Zeven\n' },
			{ door: MOZA_EDITOR, sent: true }
		);
		expect((await open('moza-site', eigen, { sub: MOZA_EDITOR })).watNu).toEqual({
			sentence: 'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.',
			actions: ['verder-bewerken'],
			primary: null
		});
		const lezer = await make(
			'moza-site',
			{ 'content/zeven-b.md': 'Zeven\n' },
			{ door: 'lezer', sent: true }
		);
		expect((await open('moza-site', lezer)).watNu.sentence).toBe(
			'De redactie beoordeelt je voorstel. Je hoeft nu niets te doen.'
		);
	});

	it('cannot tell, without a record, whether an editor wrote what someone else signed', async () => {
		const nummer = await make('moza-site', { 'content/zeven-f.md': 'Zeven\n' }, { sent: true });
		expect((await open('moza-site', nummer, { sub: MOZA_EDITOR })).watNu.sentence).toBe(
			'Schrijver kan niet nagaan of je dit voorstel zelf schreef. Een beheerder van de site voegt het samen, of iemand met rechten op GitHub.'
		);
		forge.permissionByLogin.set('octo', 'admin');
		try {
			expect(
				(await open('moza-site', nummer, { sub: MOZA_EDITOR, githubLogin: 'octo' })).watNu.sentence
			).toMatch(/^Deze site vraagt eerst een goedkeuring op GitHub\./);
		} finally {
			forge.permissionByLogin.delete('octo');
		}
	});

	it('knows the writer Schrijver recorded, where the signature cannot be compared', async () => {
		const nummer = await make(
			'moza-site',
			{ 'content/zeven-c.md': 'Zeven\n' },
			{ sent: true, signature: 'Co-authored-by: jan <313+jan@users.noreply.github.com>' }
		);
		const sentence = async (sub: string) =>
			(await open('moza-site', nummer, { sub })).watNu.sentence;
		expect(await sentence(MOZA_OTHER_EDITOR)).toMatch(/^Schrijver kan niet nagaan/);
		await team.recordWriter('moza-site', nummer, MOZA_EDITOR);
		expect(await sentence(MOZA_EDITOR)).toBe(
			'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.'
		);
		expect(await sentence(MOZA_OTHER_EDITOR)).toMatch(
			/^Deze site vraagt eerst een goedkeuring op GitHub\./
		);
	});

	it('blocks when the record of writers cannot be read, unless the reader is a site admin', async () => {
		const nummer = await make('moza-site', { 'content/zeven-e.md': 'Zeven\n' }, { sent: true });
		const writers = vi.spyOn(team, 'writers').mockRejectedValue(new Error('database weg'));
		try {
			expect((await open('moza-site', nummer, { sub: MOZA_OTHER_EDITOR })).watNu.sentence).toMatch(
				/^Schrijver kan niet nagaan/
			);
			forge.permissionByLogin.set('octo', 'admin');
			expect(
				(await open('moza-site', nummer, { sub: MOZA_OTHER_EDITOR, githubLogin: 'octo' })).watNu
					.sentence
			).toMatch(/^Deze site vraagt eerst een goedkeuring op GitHub\./);
		} finally {
			writers.mockRestore();
			forge.permissionByLogin.delete('octo');
		}
	});

	it('follows four eyes as the site settings have it', async () => {
		const nummer = await make(
			'moza-site',
			{ 'content/zeven-d.md': 'Zeven\n' },
			{ door: MOZA_EDITOR, sent: true }
		);
		const settings = (await team.settings('moza-site'))!;
		await team.saveSettings('moza-site', { ...settings, vierOgen: false }, 'baas');
		try {
			expect((await open('moza-site', nummer, { sub: MOZA_EDITOR })).watNu.sentence).toMatch(
				/^Deze site vraagt eerst een goedkeuring op GitHub\./
			);
		} finally {
			await team.saveSettings('moza-site', settings, 'baas');
		}
		expect((await open('moza-site', nummer, { sub: MOZA_EDITOR })).watNu.sentence).toMatch(
			/^Je schreef dit voorstel zelf\./
		);
	});

	it('lets a writer whom four eyes do not stop merge an own proposal, or edit it further', async () => {
		const eigen = await make(
			'digi-handboek',
			{ 'docs/kennis/eigen.md': '# Eigen\n' },
			{ door: EDITOR, sent: true }
		);
		expect((await open('digi-handboek', eigen, { sub: EDITOR })).watNu).toEqual({
			sentence:
				'Je schreef dit voorstel zelf en je mag het samenvoegen. Klopt alles, voeg het dan samen.',
			actions: ['samenvoegen', 'verder-bewerken'],
			primary: 'samenvoegen'
		});
	});

	it('says plainly that the page changed on the site, and what the reader can do', async () => {
		const nummer = await make(
			'digi-handboek',
			{ 'docs/kennis/botsing.md': '# Botsing\n' },
			{ sent: true }
		);
		forge.mergeableByPr.set(nummer, false);
		const page = await open('digi-handboek', nummer, { sub: EDITOR });
		expect(page.watNu).toEqual({
			sentence:
				'De pagina is intussen op de site veranderd. Daardoor kan dit voorstel niet worden samengevoegd. Vraag de schrijver om een aanpassing. De schrijver maakt de wijziging dan opnieuw in een nieuw voorstel.',
			actions: ['vraag-om-aanpassing'],
			primary: 'vraag-om-aanpassing'
		});
		expect(page, 'no banner of its own').not.toHaveProperty('notMergeable');
		expect(page.opnieuwBewerken).toEqual([]);

		// A new page that the site does not have: nothing to open again.
		const eigen = await make(
			'digi-handboek',
			{ 'docs/kennis/botsing-eigen.md': '# Botsing\n' },
			{ door: EDITOR, sent: true }
		);
		forge.mergeableByPr.set(eigen, false);
		const nieuw = await open('digi-handboek', eigen, { sub: EDITOR });
		expect(nieuw.watNu).toEqual({
			sentence:
				'De pagina is intussen op de site veranderd. Daardoor kan je voorstel niet worden samengevoegd, en Schrijver kan het niet bijwerken. Maak je wijziging nog een keer in een nieuw voorstel. Dit voorstel blijft open tot iemand het op GitHub sluit.',
			actions: [],
			primary: null
		});
		expect(nieuw.opnieuwBewerken).toEqual([]);
	});

	it('leads the writer of what GitHub cannot merge to the page as the site has it now', async () => {
		const eigen = await make(
			'digi-handboek',
			{ 'docs/onboarding/accounts.md': '# Accounts, opnieuw\n' },
			{ door: EDITOR, sent: true }
		);
		forge.mergeableByPr.set(eigen, false);
		const writer = await open('digi-handboek', eigen, { sub: EDITOR });
		expect(writer.opnieuwBewerken).toEqual([
			{
				page: 'docs/onboarding/accounts.md',
				titel: 'Accounts, opnieuw',
				href: '/sites/digi-handboek/bewerken/onboarding/accounts.md'
			}
		]);
		expect(writer.watNu).toEqual({
			sentence:
				'De pagina Accounts, opnieuw is intussen op de site veranderd. Daardoor kan je voorstel niet worden samengevoegd, en Schrijver kan het niet bijwerken. Kies "Pagina opnieuw bewerken" en maak je wijziging nog een keer in een nieuw voorstel. Dit voorstel blijft open tot iemand het op GitHub sluit.',
			actions: ['pagina-opnieuw-bewerken'],
			primary: 'pagina-opnieuw-bewerken'
		});
		const other = await open('digi-handboek', eigen, { sub: 'iemand' });
		expect(other.opnieuwBewerken).toEqual([]);
		forge.mergeableByPr.set(eigen, true);
		expect((await open('digi-handboek', eigen, { sub: EDITOR })).opnieuwBewerken).toEqual([]);
	});

	describe('a proposal with as many commits as GitHub lists', () => {
		const WHY =
			'Dit voorstel is zo vaak bewaard dat Schrijver niet alles kan nakijken. Samenvoegen gebeurt daarom op GitHub.';

		/** A sent-in proposal of `count` commits on a site that merges in Schrijver. */
		async function committed(site: SiteId, file: string, count: number): Promise<number> {
			const nummer = await make(site, { [file]: 'Veel\n' }, { sent: true, writer: 'schrijver' });
			const branch = `schrijver/${site}/test-${made}`;
			for (let n = 1; n < count; n++) await forge.commit(REPOS[site], branch, [], `Bewerk ${n}`);
			expect(await forge.prCommits(REPOS[site], nummer)).toHaveLength(count);
			return nummer;
		}

		it('has no merge in Schrijver, but the GitHub row, with the reason', async () => {
			const nummer = await committed('digi-handboek', 'docs/kennis/veel-a.md', MAX_PR_COMMITS);
			const octo = { sub: EDITOR, githubLogin: 'octo' };
			expect((await open('digi-handboek', nummer, octo)).watNu).toEqual({
				sentence: WHY,
				actions: ['beoordelen-op-github', 'vraag-om-aanpassing'],
				primary: 'beoordelen-op-github'
			});
			expect((await open('digi-handboek', nummer, { sub: EDITOR })).watNu).toEqual({
				sentence: `${WHY} Iemand met rechten op GitHub voegt het voorstel daar samen. Moet er iets anders, vraag dan om een aanpassing.`,
				actions: ['vraag-om-aanpassing'],
				primary: 'vraag-om-aanpassing'
			});
			expect((await open('digi-handboek', nummer)).watNu.sentence, 'for anyone else').toBe(
				'De redactie beoordeelt dit voorstel.'
			);
		});

		it('still merges in Schrijver with one commit fewer', async () => {
			const nummer = await committed('digi-handboek', 'docs/kennis/veel-b.md', MAX_PR_COMMITS - 1);
			expect((await open('digi-handboek', nummer, { sub: EDITOR })).watNu.actions).toEqual([
				'samenvoegen',
				'vraag-om-aanpassing'
			]);
		});

		it('does not ask GitHub for an approval that nothing will use', async () => {
			const decision = vi.spyOn(forge, 'reviewDecision');
			try {
				const few = await committed('digi-handboek', 'docs/kennis/veel-c.md', MAX_PR_COMMITS - 1);
				await open('digi-handboek', few, { sub: EDITOR });
				expect(decision).toHaveBeenCalledTimes(1);
				decision.mockClear();
				const many = await committed('digi-handboek', 'docs/kennis/veel-d.md', MAX_PR_COMMITS);
				await open('digi-handboek', many, { sub: EDITOR });
				expect(decision).not.toHaveBeenCalled();
			} finally {
				decision.mockRestore();
			}
		});

		it('keeps the answer of four eyes first, which cannot tell from a list that may be cut off', async () => {
			const nummer = await committed('moza-site', 'content/veel-f.md', MAX_PR_COMMITS);
			expect((await open('moza-site', nummer, { sub: MOZA_OTHER_EDITOR })).watNu.sentence).toBe(
				'Schrijver kan niet nagaan of je dit voorstel zelf schreef. Iemand met rechten op GitHub voegt het voorstel daar samen.'
			);
			forge.permissionByLogin.set('octo', 'admin');
			try {
				expect(
					(await open('moza-site', nummer, { sub: MOZA_OTHER_EDITOR, githubLogin: 'octo' })).watNu
						.sentence
				).toBe(WHY);
			} finally {
				forge.permissionByLogin.delete('octo');
			}
		});

		it('still loads when the list of commits cannot be read, and then leaves the merge as it is', async () => {
			const nummer = await committed('digi-handboek', 'docs/kennis/veel-e.md', MAX_PR_COMMITS);
			forge.failNext('prCommits', new ForgeError(502, 'GitHub is niet bereikbaar'));
			expect((await open('digi-handboek', nummer, { sub: EDITOR })).watNu.actions).toContain(
				'samenvoegen'
			);
		});
	});

	it('lets the writer send in again, also after a request on GitHub, and says where the redactie looks', async () => {
		const moza = await make(
			'moza-site',
			{ 'content/negen.md': 'Negen\n' },
			{ door: 'lezer', sent: true }
		);
		forge.reviewOnGitHub('MinBZK/moza-site', moza, 'jansen', 'changes_requested', 'Korter');
		expect((await open('moza-site', moza)).watNu).toEqual({
			sentence:
				'De redactie vraagt je iets aan te passen. Lees het gesprek hieronder. Klaar? Kies "Stuur opnieuw in", dan beoordeelt de redactie het op GitHub opnieuw.',
			actions: ['verder-bewerken', 'opnieuw-insturen'],
			primary: 'verder-bewerken'
		});

		const digi = await make(
			'digi-handboek',
			{ 'docs/kennis/tien.md': '# Tien\n' },
			{ door: 'lezer', sent: true }
		);
		await forge.addLabel(REPO, digi, 'aanpassing gevraagd');
		expect((await open('digi-handboek', digi)).watNu.sentence).toMatch(
			/Klaar\? Kies "Stuur opnieuw in", dan beoordeelt de redactie het opnieuw\.$/
		);
		expect(
			(await open('digi-handboek', digi, { sub: EDITOR })).watNu,
			'no button for the editors'
		).toEqual({
			sentence: 'De schrijver past dit voorstel aan. Daarna beoordeelt de redactie het opnieuw.',
			actions: [],
			primary: null
		});
	});

	it('tells anyone else that the editors decide', async () => {
		const nummer = await make('moza-site', { 'content/acht.md': 'Acht\n' }, { sent: true });
		expect((await open('moza-site', nummer)).watNu).toEqual({
			sentence: 'De redactie beoordeelt dit voorstel.',
			actions: [],
			primary: null
		});
	});

	it('offers the preview, or says it is being built or did not work', async () => {
		const nummer = await make('digi-handboek', { 'docs/kennis/negen.md': '# Negen\n' });
		const url = `https://plak.rijks.app/digigilde/handboek/_preview/pr-${nummer}/`;
		expect((await open('digi-handboek', nummer)).voorbeeld).toEqual({ url, stand: 'klaar' });
		forge.prs.get(nummer)!.checks = 'pending';
		expect((await open('digi-handboek', nummer)).voorbeeld?.stand).toBe('bezig');
		forge.prs.get(nummer)!.checks = 'failure';
		expect((await open('digi-handboek', nummer)).voorbeeld?.stand).toBe('mislukt');
	});
});

describe('what changes', () => {
	it('titles each page from the site schema and puts the other files in one line', async () => {
		const nummer = await make('moza-site', {
			'content/onderwerpen/tien.md': '---\ntitle: Tiende onderwerp\n---\nTekst\n',
			'content/onderwerpen/images/team.jpg': 'jpg',
			'content/documenten/x.pdf': 'pdf'
		});
		const page = await open('moza-site', nummer);
		expect(page.diffs.map((d) => [d.path, d.titel])).toEqual([
			['content/onderwerpen/tien.md', 'Tiende onderwerp']
		]);
		expect(page.andereBestanden).toEqual([
			{ soort: 'bestand', naam: 'x.pdf', status: 'toegevoegd' },
			{ soort: 'afbeelding', naam: 'team.jpg', status: 'toegevoegd' }
		]);
		expect(page.nogMeerBestanden).toBe(0);
	});
});

describe('the conversation', () => {
	it('shows comments and reviews in time order, and lets the writer and the editors react', async () => {
		const nummer = await make('digi-handboek', { 'docs/kennis/elf.md': '# Elf\n' }, { sent: true });
		forge.commentOnGitHub(REPO, nummer, 'jansen', 'Eerst op GitHub', '2026-01-01T10:00:00Z');
		await forge.comment(
			REPO,
			nummer,
			commentBody('Graag korter', {
				identity: { kind: 'anoniem', pseudoniem: '9f86d081884c' },
				role: 'redactie',
				kind: 'aanpassing'
			})
		);
		const page = await open('digi-handboek', nummer, { sub: EDITOR });
		expect(page.gesprek?.items.map((i) => [i.who, i.as, i.text])).toEqual([
			['jansen', 'github', 'Eerst op GitHub'],
			['Anoniem, codenaam 9f86d081884c', 'redactie', 'Graag korter']
		]);
		expect(page.gesprek?.volledig).toBe(true);
		expect(page.kanReageren).toBe(true);
		expect((await open('digi-handboek', nummer)).kanReageren).toBe(false);
		const mijn = await make(
			'digi-handboek',
			{ 'docs/kennis/twaalf.md': '# Twaalf\n' },
			{ door: 'lezer' }
		);
		expect((await open('digi-handboek', mijn)).kanReageren).toBe(true);
	});

	it('says when the conversation cannot be loaded, and shows the rest of the page', async () => {
		const nummer = await make('digi-handboek', { 'docs/kennis/dertien.md': '# Dertien\n' });
		forge.failNext('prComments', new ForgeError(502, 'GitHub is niet bereikbaar'));
		const page = await open('digi-handboek', nummer);
		expect(page.gesprek).toBeNull();
		expect(page.diffs).toHaveLength(1);
	});
});
