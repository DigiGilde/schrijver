import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { identityTrailer, pseudonym } from '../../src/lib/forge/trailers';
import type { FakeForge } from '../../src/lib/forge/fake';
import type { Proposal } from '../../src/lib/forge/proposals';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/sites/[site]/+page.server';

const REPO = 'DigiGilde/handboek';
let forge: FakeForge;

const session = (email: string): Session => ({
	sub: 'lezer',
	name: 'Lezer',
	email,
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
});
const prefs: UserPrefs = {
	sub: 'lezer',
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true
};

interface Data {
	editorial: boolean;
	teBeoordelen: Proposal[];
	tab: string;
	pages: { path: string; verderBewerken: string | null }[];
}
async function visit(email: string, query = ''): Promise<Data> {
	return (await load({
		params: { site: 'digi-handboek' },
		url: new URL(`http://x/sites/digi-handboek${query}`),
		locals: { user: { session: session(email), prefs } }
	} as never)) as Data;
}

async function proposal(slug: string, opts: { sent: boolean; mine?: boolean }) {
	const branch = `schrijver/digi-handboek/${slug}`;
	await forge.createBranch(REPO, 'main', branch);
	await forge.commit(REPO, branch, [{ path: 'docs/index.md', content: `# ${slug}\n` }], slug);
	const who = opts.mine ? pseudonym(process.env.PSEUDONYM_SECRET!, 'lezer') : 'iemandanders';
	const pr = await forge.openDraftPr(
		REPO,
		branch,
		'main',
		slug,
		identityTrailer({ kind: 'anoniem', pseudoniem: who })
	);
	if (opts.sent) await forge.markReady(REPO, pr.number);
	return pr.number;
}

let sentIn: number;
let concept: number;
let own: number;

beforeAll(async () => {
	process.env.PSEUDONYM_SECRET = 'site-page-test-secret';
	const services = await buildFakeServices();
	forge = services.forge;
	setForge(forge);
	setConfigStore(services.store);
	sentIn = await proposal('ingestuurd-aaaa', { sent: true });
	concept = await proposal('concept-bbbb', { sent: false });
	own = await proposal('eigen-cccc', { sent: false, mine: true });
});

describe('site page', () => {
	it('gives editorial users a to-do of sent-in proposals', async () => {
		const data = await visit('test@example.org');
		expect(data.editorial).toBe(true);
		const numbers = data.teBeoordelen.map((p) => p.number);
		expect(numbers).toContain(sentIn);
		expect(numbers).not.toContain(concept);
		expect((await visit('test@example.org', '?tab=beoordelen')).tab).toBe('beoordelen');
	});

	it('shows no to-do and no review filter to other users', async () => {
		const data = await visit('iemand@example.org', '?tab=beoordelen');
		expect(data.editorial).toBe(false);
		expect(data.teBeoordelen).toEqual([]);
		expect(data.tab).toBe('mijn');
	});

	it('links a page to the own open proposal', async () => {
		const data = await visit('iemand@example.org');
		const index = data.pages.find((p) => p.path === 'index.md')!;
		expect(index.verderBewerken).toBe(
			`/sites/digi-handboek/bewerken/index.md?branch=schrijver%2Fdigi-handboek%2Feigen-cccc&pr=${own}`
		);
	});
});
