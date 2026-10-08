import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { identityTrailer, pseudonym } from '../../src/lib/forge/trailers';
import type { FakeForge } from '../../src/lib/forge/fake';
import type { Proposal } from '../../src/lib/forge/proposals';
import { ForgeError } from '../../src/lib/forge/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load as loadPages } from '../../src/routes/sites/[site]/+page.server';
import { load as loadProposals } from '../../src/routes/sites/[site]/voorstellen/+page.server';
import { load as loadAbout } from '../../src/routes/sites/[site]/over/+page.server';

const REPO = 'DigiGilde/handboek';
const EDITOR = 'test@example.org';
const WRITER = 'iemand@example.org';
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

const event = (email: string, site: string, path: string) => ({
	params: { site },
	url: new URL(`http://x/sites/${site}${path}`),
	locals: { user: { session: session(email), prefs } }
});

interface PagesData {
	site: Record<string, unknown>;
	wachtend: number | null;
	pages: { path: string; verderBewerken: string | null }[];
}
interface ProposalsData {
	proposals: Proposal[];
	proposalsError: boolean;
	editorial: boolean;
	wachtend: number | null;
	filter: string;
}
interface AboutData {
	wachtend: number | null;
	redactie: string[];
	ondertekenen: string[];
	conceptenOpenbaar: boolean;
	voorbeeld: string;
	repoUrl: string;
	configuratie: string | null;
	mergenVanuitSchrijver: boolean;
}

const pages = async (email: string, query = '') =>
	(await loadPages(event(email, 'digi-handboek', query) as never)) as PagesData;
const proposals = async (email: string, query = '') =>
	(await loadProposals(
		event(email, 'digi-handboek', `/voorstellen${query}`) as never
	)) as ProposalsData;
const about = async (email: string, site = 'digi-handboek') =>
	(await loadAbout(event(email, site, '/over') as never)) as AboutData;

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
	process.env.GITHUB_CONFIG_REPO = 'example/config@main';
	const services = await buildFakeServices();
	forge = services.forge;
	setForge(forge);
	setConfigStore(services.store);
	sentIn = await proposal('ingestuurd-aaaa', { sent: true });
	concept = await proposal('concept-bbbb', { sent: false });
	own = await proposal('eigen-cccc', { sent: false, mine: true });
});

describe('pages tab', () => {
	it('shows the description and public address of the site, not its repository', async () => {
		const data = await pages(WRITER);
		expect(data.site).toEqual({
			id: 'digi-handboek',
			naam: 'Digi Handboek',
			omschrijving: 'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.',
			adres: 'https://digihandboek.rijks.app/'
		});
	});

	it('counts the proposals that wait for editorial members only', async () => {
		expect((await pages(EDITOR)).wachtend).toBe(1);
		expect((await pages(WRITER)).wachtend).toBeNull();
	});

	it('links a page to the own open proposal', async () => {
		const data = await pages(WRITER);
		const index = data.pages.find((p) => p.path === 'index.md')!;
		expect(index.verderBewerken).toBe(
			`/sites/digi-handboek/bewerken/index.md?branch=schrijver%2Fdigi-handboek%2Feigen-cccc&pr=${own}`
		);
	});

	it('sends an old ?tab= link on to the proposals tab', async () => {
		await expect(pages(EDITOR, '?tab=beoordelen')).rejects.toMatchObject({
			status: 308,
			location: '/sites/digi-handboek/voorstellen?filter=beoordelen'
		});
		await expect(pages(WRITER, '?map=kennis&tab=alle')).rejects.toMatchObject({
			status: 308,
			location: '/sites/digi-handboek/voorstellen?filter=alle'
		});
	});
});

describe('pages tab without the App installed', () => {
	it('answers 404 with a reason instead of a server error', async () => {
		const original = forge.readTree.bind(forge);
		forge.readTree = async () => {
			throw new ForgeError(404, 'Niet gevonden op GitHub', 'Not Found');
		};
		try {
			await expect(pages(WRITER)).rejects.toMatchObject({
				status: 404,
				body: { message: expect.stringContaining('Schrijver-app') }
			});
		} finally {
			forge.readTree = original;
		}
	});
});

describe('proposals tab', () => {
	it('gives editorial members Te beoordelen and the count of what waits', async () => {
		const data = await proposals(EDITOR, '?filter=beoordelen');
		expect(data.editorial).toBe(true);
		expect(data.filter).toBe('beoordelen');
		expect(data.wachtend).toBe(1);
		const numbers = data.proposals.map((p) => p.number);
		expect(numbers).toEqual(expect.arrayContaining([sentIn, concept, own]));
	});

	it('falls back to the own proposals for anyone else', async () => {
		const data = await proposals(WRITER, '?filter=beoordelen');
		expect(data.editorial).toBe(false);
		expect(data.filter).toBe('mijn');
		expect(data.wachtend).toBeNull();
		expect(data.proposals.find((p) => p.number === own)?.mine).toBe(true);
	});

	it('says so when the proposals cannot be read, and shows no count', async () => {
		forge.failNext('listPrs', new ForgeError(502, 'GitHub is niet bereikbaar'));
		const data = await proposals(EDITOR);
		expect(data.proposalsError).toBe(true);
		expect(data.proposals).toEqual([]);
		expect(data.wachtend).toBeNull();
	});
});

describe('about tab', () => {
	it('names the editors, the signing choices, the preview and the repository', async () => {
		const data = await about(WRITER);
		expect(data.redactie).toEqual(['naam@rijksoverheid.nl', 'test@example.org']);
		expect(data.ondertekenen).toEqual(['anoniem', 'gekoppeld', 'op-naam']);
		expect(data.voorbeeld).toBe('bij-push');
		expect(data.mergenVanuitSchrijver).toBe(true);
		expect(data.repoUrl).toBe('https://github.com/DigiGilde/handboek/tree/main');
		expect(data.configuratie).toBe('example/config');
		expect(data.wachtend).toBeNull();
	});

	it('offers only the choices the site allows, anoniem always among them', async () => {
		const data = await about(WRITER, 'moza-site');
		expect(data.redactie).toEqual(['redactie@example.org']);
		expect(data.ondertekenen).toEqual(['anoniem', 'gekoppeld']);
		expect(data.voorbeeld).toBe('bij-label');
	});

	it('says drafts are public only when the repository is', async () => {
		expect((await about(WRITER)).conceptenOpenbaar).toBe(true);
		forge.setPublic(REPO, false);
		try {
			expect((await about(WRITER)).conceptenOpenbaar).toBe(false);
		} finally {
			forge.setPublic(REPO, true);
		}
	});

	it('counts what waits for an editorial member', async () => {
		expect((await about(EDITOR)).wachtend).toBe(1);
	});
});
