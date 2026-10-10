import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { commentBody } from '../../src/lib/forge/conversation';
import { dateText } from '../../src/lib/forge/status';
import { identityTrailer, pseudonym } from '../../src/lib/forge/trailers';
import type { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/sites/[site]/voorstellen/[nummer]/+page.server';

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

// Editorial on digi-handboek only: the fake services add this address to its redactie.
const EDITOR = 'test@example.org';

async function visit(nummer: number, { query = '', email = session.email } = {}): Promise<Data> {
	return (await load({
		params: { site: 'digi-handboek', nummer: String(nummer) },
		url: new URL(`http://x/sites/digi-handboek/voorstellen/${nummer}${query}`),
		locals: { user: { session: { ...session, email }, prefs } }
	} as never)) as Data;
}

beforeAll(async () => {
	process.env.PSEUDONYM_SECRET = 'proposal-page-test-secret';
	const services = await buildFakeServices();
	forge = services.forge;
	setForge(forge);
	setConfigStore(services.store);
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

describe('the way back from a proposal', () => {
	const LIST = '/sites/digi-handboek/voorstellen';
	let nummer: number;

	beforeAll(async () => {
		nummer = await proposal('terug-cccc', { 'docs/terug.md': '# Terug\n' });
	});

	it('returns to the list in the filter that the proposal was opened from', async () => {
		expect((await visit(nummer, { query: '?filter=alle' })).terug).toBe(`${LIST}?filter=alle`);
		expect((await visit(nummer, { query: '?filter=mijn' })).terug).toBe(`${LIST}?filter=mijn`);
		expect((await visit(nummer, { query: '?filter=beoordelen', email: EDITOR })).terug).toBe(
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
		expect((await visit(nummer, { email: EDITOR })).terug, 'nothing waits yet').toBe(LIST);
		await forge.markReady(REPO, nummer);
		expect((await visit(nummer, { email: EDITOR })).terug).toBe(`${LIST}?filter=beoordelen`);
		expect((await visit(nummer)).terug).toBe(LIST);
	});

	it('does the same for a proposal from a fork, which editors review as well', async () => {
		const fork = await proposal('fork-dddd', { 'docs/fork.md': '# Fork\n' });
		await forge.markReady(REPO, fork);
		forge.prs.get(fork)!.headRepo = 'iemand/handboek';
		expect((await visit(fork, { query: '?filter=beoordelen', email: EDITOR })).terug).toBe(
			`${LIST}?filter=beoordelen`
		);
		expect((await visit(fork, { email: EDITOR })).terug).toBe(`${LIST}?filter=beoordelen`);
	});

	it('still opens the plain list when the forge cannot tell what waits', async () => {
		forge.failNext('listPrs', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect((await visit(nummer, { email: EDITOR })).terug).toBe(LIST);
	});
});

type SiteId = 'digi-handboek' | 'moza-site';
const REPOS: Record<SiteId, string> = {
	'digi-handboek': REPO,
	'moza-site': 'MinBZK/moza-site'
};
// Editorial on the MOZa site, which asks for four eyes and, in the fake, an approval on GitHub.
const MOZA_EDITOR = 'redactie@example.org';

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
}

let made = 0;
/** A proposal on a site, by the reader (`mijn`) or someone else, with the given body text. */
async function make(
	site: SiteId,
	files: Record<string, string>,
	{ mijn = false, sent = false, body }: { mijn?: boolean; sent?: boolean; body?: string } = {}
): Promise<number> {
	const repo = REPOS[site];
	const branch = `schrijver/${site}/test-${++made}`;
	await forge.createBranch(repo, 'main', branch);
	const who = mijn ? pseudonym(process.env.PSEUDONYM_SECRET!, 'lezer') : 'iemandanders';
	const trailer = identityTrailer({ kind: 'anoniem', pseudoniem: who });
	await forge.commit(
		repo,
		branch,
		Object.entries(files).map(([path, content]) => ({ path, content })),
		`Bewerk\n\n${trailer}`
	);
	const pr = await forge.openDraftPr(repo, branch, 'main', `Test ${made}`, body ?? trailer);
	if (sent) await forge.markReady(repo, pr.number);
	return pr.number;
}

async function open(
	site: SiteId,
	nummer: number,
	{ email = session.email, githubLogin = null as string | null } = {}
): Promise<Page> {
	return (await load({
		params: { site, nummer: String(nummer) },
		url: new URL(`http://x/sites/${site}/voorstellen/${nummer}`),
		locals: { user: { session: { ...session, email }, prefs: { ...prefs, githubLogin } } }
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
			{ mijn: true }
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
		const page = await open('digi-handboek', nummer, { email: EDITOR });
		expect(page.stap).toBe('Ingestuurd');
		expect(page.watNu).toMatchObject({
			actions: ['samenvoegen', 'vraag-om-aanpassing'],
			primary: 'samenvoegen'
		});
		expect(page.watNu.sentence).toMatch(/^Jij beslist\./);
	});

	it('asks for the approval on GitHub first where the site requires one', async () => {
		const nummer = await make('moza-site', { 'content/vijf.md': 'Vijf\n' }, { sent: true });
		expect((await open('moza-site', nummer, { email: MOZA_EDITOR })).watNu).toMatchObject({
			sentence: 'Deze site vraagt eerst een goedkeuring op GitHub. Daarna kun je hier samenvoegen.',
			actions: ['goedkeuren-op-github', 'vraag-om-aanpassing']
		});
		forge.reviewOnGitHub('MinBZK/moza-site', nummer, 'jansen', 'approved', '');
		expect((await open('moza-site', nummer, { email: MOZA_EDITOR })).watNu.actions).toEqual([
			'samenvoegen',
			'vraag-om-aanpassing'
		]);
	});

	it('offers the merge when GitHub cannot say whether an approval is missing', async () => {
		const nummer = await make('moza-site', { 'content/zes.md': 'Zes\n' }, { sent: true });
		forge.failNext('reviewDecision', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect((await open('moza-site', nummer, { email: MOZA_EDITOR })).watNu.actions).toEqual([
			'samenvoegen',
			'vraag-om-aanpassing'
		]);
	});

	it('leaves the decision on an own proposal to another editor where four eyes hold', async () => {
		const nummer = await make(
			'moza-site',
			{ 'content/zeven.md': 'Zeven\n' },
			{ mijn: true, sent: true }
		);
		expect((await open('moza-site', nummer, { email: MOZA_EDITOR })).watNu).toEqual({
			sentence: 'Je schreef dit voorstel zelf. Een ander lid van de redactie beslist.',
			actions: ['verder-bewerken'],
			primary: null
		});
		expect((await open('moza-site', nummer)).watNu.sentence).toBe(
			'De redactie beoordeelt je voorstel. Je hoeft nu niets te doen.'
		);
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
		const page = await open('digi-handboek', nummer, { email: EDITOR });
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
			{ mijn: true }
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
