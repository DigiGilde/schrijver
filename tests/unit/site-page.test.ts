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
import type { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeams } from './team-fixture';

const REPO = 'DigiGilde/handboek';
// On the redactie of digi-handboek.
const EDITOR = 'redacteur';
const WRITER = 'lezer';
let forge: FakeForge;
let team: MemoryTeamStore;

const session = (sub: string): Session => ({
	sub,
	name: 'Lezer',
	email: `${sub}@example.org`,
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

const event = (sub: string, site: string, path: string, githubLogin: string | null = null) => ({
	params: { site },
	url: new URL(`http://x/sites/${site}${path}`),
	locals: { user: { session: session(sub), prefs: { ...prefs, sub, githubLogin } } }
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
	site: Record<string, unknown>;
	redactie: { naam: string | null; beheerder: boolean }[];
	kanBeheren: boolean;
	ondertekenen: string[];
	conceptenOpenbaar: boolean;
	voorbeeld: string;
	repo: string;
	branch: string;
	repoUrl: string;
	structuurUrl: string;
	mergenVanuitSchrijver: boolean;
}

const pages = async (sub: string, query = '') =>
	(await loadPages(event(sub, 'digi-handboek', query) as never)) as PagesData;
const proposals = async (sub: string, query = '') =>
	(await loadProposals(
		event(sub, 'digi-handboek', `/voorstellen${query}`) as never
	)) as ProposalsData;
const about = async (sub: string, site = 'digi-handboek', githubLogin: string | null = null) =>
	(await loadAbout(event(sub, site, '/over', githubLogin) as never)) as AboutData;

async function proposal(slug: string, opts: { sent: boolean; mine?: boolean }) {
	const branch = `schrijver/digi-handboek/${slug}`;
	await forge.createBranch(REPO, 'main', branch);
	await forge.commit(REPO, branch, [{ path: 'docs/index.md', content: `# ${slug}\n` }], slug);
	const who = opts.mine ? pseudonym(process.env.PSEUDONYM_SECRET!, WRITER) : 'iemandanders';
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
	team = await useTeams(services.store.sites(), { 'digi-handboek': { [EDITOR]: 'redactie' } });
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

describe('about page', () => {
	it('carries the description and public address for its opening, not the repository', async () => {
		const data = await about(WRITER);
		expect(data.site).toEqual({
			id: 'digi-handboek',
			naam: 'Digi Handboek',
			omschrijving: 'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.',
			adres: 'https://digihandboek.rijks.app/'
		});
	});

	it('names the team, the signing choices, the preview, the repository and its structure', async () => {
		const data = await about(WRITER);
		expect(data.redactie).toEqual([{ naam: 'Naam redacteur', beheerder: false }]);
		expect(data.ondertekenen).toEqual(['anoniem', 'gekoppeld', 'op-naam']);
		expect(data.voorbeeld).toBe('bij-push');
		expect(data.mergenVanuitSchrijver).toBe(true);
		expect(data.repo).toBe('DigiGilde/handboek');
		expect(data.branch).toBe('main');
		expect(data.repoUrl).toBe('https://github.com/DigiGilde/handboek/tree/main');
		expect(data.structuurUrl).toBe('https://github.com/DigiGilde/handboek/tree/main/.schrijver');
	});

	it('offers only the choices the site allows, anoniem always among them', async () => {
		const data = await about(WRITER, 'moza-site');
		expect(data.ondertekenen).toEqual(['anoniem', 'gekoppeld']);
		expect(data.voorbeeld).toBe('bij-label');
	});

	it('sends the team by name and role only: no address, sub or invitation reaches the browser', async () => {
		const platform = { sub: 'opzet', platformAdmin: true };
		await team.recordLogin({
			sub: 'sub-0001',
			name: 'Jan Jansen',
			email: 'jan@example.org',
			emailVerified: true
		});
		await team.recordLogin({
			sub: 'sub-0002',
			name: '',
			email: 'zonder-naam@example.org',
			emailVerified: true
		});
		await team.addByEmail('moza-site', 'jan@example.org', 'beheerder', 'opzet');
		await team.addByEmail('moza-site', 'zonder-naam@example.org', 'redactie', 'opzet');
		await team.addByEmail('moza-site', 'uitgenodigd@example.org', 'redactie', 'opzet');
		try {
			const data = await about(WRITER, 'moza-site');
			expect(data.redactie).toEqual([
				{ naam: 'Jan Jansen', beheerder: true },
				{ naam: null, beheerder: false }
			]);
			const sent = JSON.stringify(data);
			for (const hidden of ['@', 'sub-0001', 'sub-0002', 'uitgenodigd', 'zonder-naam'])
				expect(sent).not.toContain(hidden);
		} finally {
			await team.removeMember('moza-site', 'sub-0001', platform);
			await team.removeMember('moza-site', 'sub-0002', platform);
		}
	});

	it('offers the beheer page to the admins of the site only', async () => {
		expect((await about(WRITER)).kanBeheren).toBe(false);
		expect((await about(EDITOR)).kanBeheren).toBe(false);
		const platform = { sub: 'opzet', platformAdmin: true };
		await team.changeRole('digi-handboek', EDITOR, 'beheerder', platform);
		try {
			expect((await about(EDITOR)).kanBeheren).toBe(true);
			expect((await about(EDITOR, 'moza-site')).kanBeheren).toBe(false);
		} finally {
			await team.changeRole('digi-handboek', EDITOR, 'redactie', platform);
		}
		forge.permissionByLogin.set('octo', 'admin');
		try {
			expect((await about(WRITER, 'digi-handboek', 'octo')).kanBeheren).toBe(true);
		} finally {
			forge.permissionByLogin.delete('octo');
		}
		process.env.SCHRIJVER_BEHEERDERS = WRITER;
		try {
			expect((await about(WRITER, 'moza-site')).kanBeheren).toBe(true);
		} finally {
			delete process.env.SCHRIJVER_BEHEERDERS;
		}
	});

	it('reads the name, merging and the ways to sign from the site settings', async () => {
		const settings = (await team.settings('digi-handboek'))!;
		await team.saveSettings(
			'digi-handboek',
			{
				...settings,
				naam: 'Het Handboek',
				mergenVanuitSchrijver: false,
				identiteitToegestaan: ['op-naam']
			},
			'baas'
		);
		try {
			const data = await about(WRITER);
			expect(data.site).toMatchObject({ naam: 'Het Handboek' });
			expect(data.mergenVanuitSchrijver).toBe(false);
			expect(data.ondertekenen).toEqual(['anoniem', 'op-naam']);
		} finally {
			await team.saveSettings('digi-handboek', settings, 'baas');
		}
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

	it('carries nothing for the tabs and does not ask the forge for proposals', async () => {
		const listPrs = vi.spyOn(forge, 'listPrs');
		try {
			for (const sub of [EDITOR, WRITER]) expect(await about(sub)).not.toHaveProperty('wachtend');
			expect(listPrs).not.toHaveBeenCalled();
		} finally {
			listPrs.mockRestore();
		}
	});

	it('answers 404 for a site that does not exist', async () => {
		await expect(about(WRITER, 'bestaat-niet')).rejects.toMatchObject({ status: 404 });
	});
});
