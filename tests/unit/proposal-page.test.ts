import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { identityTrailer } from '../../src/lib/forge/trailers';
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
