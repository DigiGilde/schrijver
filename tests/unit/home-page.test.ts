import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { ConfigStore } from '../../src/lib/config/load';
import type { FakeForge } from '../../src/lib/forge/fake';
import { identityTrailer, pseudonym } from '../../src/lib/forge/trailers';
import { ForgeError } from '../../src/lib/forge/types';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { log } from '../../src/lib/log';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';
import { buildFakeServices, PREVIEW_SITES } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/+page.server';
import { digi, moza } from './sites-fixture';
import { useTeams } from './team-fixture';

/** A store over a registry with these sites, or one that cannot be read. */
const storeOf = (sites: (typeof digi)[] | 'kapot') =>
	new ConfigStore(
		{
			sites: async () => {
				if (sites === 'kapot') throw new Error('database down');
				return sites.map((s) => ({ ...s, createdAt: new Date(0), createdBy: null }));
			},
			moveSite: async () => []
		},
		() => forge
	);

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

interface Data {
	configNotLoaded: boolean;
	sites: { id: string; naam: string; omschrijving?: string; adres?: string; status: string[] }[];
}
const OTHER = 'lezer';
// On the redactie of digi-handboek only.
const EDITOR = 'redacteur';

const visit = (sub: string | null = OTHER) =>
	load({
		locals: { user: sub === null ? null : { session: session(sub), prefs: { ...prefs, sub } } }
	} as never) as Promise<Data>;

async function statusOf(site: string, sub: string | null = OTHER) {
	return (await visit(sub)).sites.find((s) => s.id === site)!.status;
}

let forge: FakeForge;
let store: ConfigStore;

type SiteId = 'digi-handboek' | 'moza-site';

/** A proposal signed by the user `door`, or by someone else. */
async function proposal(site: SiteId, slug: string, opts: { door?: string; sent?: boolean } = {}) {
	const repo = site === 'digi-handboek' ? digi.repo : moza.repo;
	const file = site === 'digi-handboek' ? 'docs/index.md' : 'content/contact.md';
	const branch = `schrijver/${site}/${slug}`;
	await forge.createBranch(repo, 'main', branch);
	await forge.commit(repo, branch, [{ path: file, content: `# ${slug}\n` }], slug);
	const who = opts.door ? pseudonym(process.env.PSEUDONYM_SECRET!, opts.door) : 'iemandanders';
	const pr = await forge.openDraftPr(
		repo,
		branch,
		'main',
		slug,
		identityTrailer({ kind: 'anoniem', pseudoniem: who })
	);
	if (opts.sent) await forge.markReady(repo, pr.number);
	return pr;
}

beforeEach(async () => {
	process.env.PSEUDONYM_SECRET = 'home-page-test-secret';
	const services = await buildFakeServices();
	forge = services.forge;
	store = services.store;
	setForge(forge);
	setConfigStore(services.store);
	await useTeams(services.store.sites(), { 'digi-handboek': { [EDITOR]: 'redactie' } });
});

afterEach(() => {
	setConfigStore(null);
	setForge(null);
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('home page', () => {
	it('reports a configuration that could not be loaded', async () => {
		const failing = storeOf('kapot');
		await failing.load().catch(() => {});
		setConfigStore(failing);
		expect(await visit()).toEqual({ configNotLoaded: true, sites: [] });
	});

	it('says nothing before a first load was attempted', async () => {
		setConfigStore(storeOf([digi]));
		expect((await visit()).configNotLoaded).toBe(false);
	});

	it('still lists a single site', async () => {
		const single = storeOf([digi]);
		await single.load();
		setConfigStore(single);
		expect((await visit()).sites.map((s) => s.id)).toEqual(['digi-handboek']);
	});

	it('writes an address with a path, a query and a fragment as the site header does', async () => {
		const team = await useTeams([digi]);
		const settings = (await team.settings('digi-handboek'))!;
		await team.saveSettings(
			'digi-handboek',
			{ ...settings, adres: 'https://digihandboek.rijks.app/team/?utm=1#top' },
			'baas'
		);
		const single = storeOf([digi]);
		await single.load();
		setConfigStore(single);
		expect((await visit()).sites.map((s) => s.adres)).toEqual(['digihandboek.rijks.app/team']);
	});

	it('describes each site by its name, description and address without the scheme', async () => {
		const { sites } = await visit();
		expect(
			sites.map(({ id, naam, omschrijving, adres }) => [id, naam, omschrijving, adres])
		).toEqual([
			[
				'digi-handboek',
				'Digi Handboek',
				'De centrale plek met de informatie die je bij het Digi Gilde nodig hebt.',
				'digihandboek.rijks.app'
			],
			[
				'moza-site',
				'MijnOverheid Zakelijk',
				'Een overheidsbrede samenwerking om de dienstverlening voor ondernemers te verbeteren.',
				'mijnoverheidzakelijk.nl'
			]
		]);
	});

	it('takes the name, description and address from the site settings, not the configuration', async () => {
		const team = await useTeams([digi, moza]);
		await team.saveSettings(
			'moza-site',
			{
				...(await team.settings('moza-site'))!,
				naam: 'MOZa',
				omschrijving: null,
				adres: 'https://moza.example/'
			},
			'baas'
		);
		const moz = (await visit()).sites.find((s) => s.id === 'moza-site');
		expect(moz).toMatchObject({ naam: 'MOZa', omschrijving: null, adres: 'moza.example' });
	});
});

describe('home page status lines', () => {
	it('say nothing while nothing waits', async () => {
		// The seeded drafts are somebody else's concepts.
		expect(await statusOf('digi-handboek')).toEqual([]);
		expect(await statusOf('moza-site')).toEqual([]);
	});

	it('count the open proposals of the user, in the singular and the plural', async () => {
		await proposal('digi-handboek', 'eigen-aaaa', { door: OTHER });
		expect(await statusOf('digi-handboek')).toEqual(['Je hebt 1 open voorstel']);
		await proposal('digi-handboek', 'eigen-bbbb', { door: OTHER });
		expect(await statusOf('digi-handboek')).toEqual(['Je hebt 2 open voorstellen']);
		expect(await statusOf('moza-site')).toEqual([]);
	});

	it('leave out the proposals of others and the ones that are no longer open', async () => {
		await proposal('digi-handboek', 'ander-aaaa');
		const done = await proposal('digi-handboek', 'eigen-cccc', { door: OTHER });
		await forge.merge(digi.repo, done.number, 'samengevoegd');
		expect(await statusOf('digi-handboek')).toEqual([]);
	});

	it('tell editorial members how many proposals wait for review', async () => {
		await proposal('digi-handboek', 'ingestuurd-aaaa', { sent: true });
		expect(await statusOf('digi-handboek', EDITOR)).toEqual(['1 voorstel wacht op beoordeling']);
		await proposal('digi-handboek', 'ingestuurd-bbbb', { sent: true });
		await proposal('digi-handboek', 'concept-cccc');
		expect(await statusOf('digi-handboek', EDITOR)).toEqual([
			'2 voorstellen wachten op beoordeling'
		]);
	});

	it('count what "Te beoordelen" counts: sent in or approved, not an asked adjustment', async () => {
		await proposal('digi-handboek', 'ingestuurd-hhhh', { sent: true });
		const gevraagd = await proposal('digi-handboek', 'gevraagd-iiii', { sent: true });
		const gelabeld = await proposal('digi-handboek', 'gelabeld-kkkk', { sent: true });
		const goed = await proposal('digi-handboek', 'goed-jjjj', { sent: true });
		forge.prs.get(gevraagd.number)!.reviewState = 'changes_requested';
		await forge.setLabels(digi.repo, gelabeld.number, ['aanpassing gevraagd']);
		await forge.approve(digi.repo, goed.number, 'Akkoord');
		expect(await statusOf('digi-handboek', EDITOR)).toEqual([
			'2 voorstellen wachten op beoordeling'
		]);
	});

	it('give an editorial member with an own proposal both lines', async () => {
		await proposal('digi-handboek', 'eigen-dddd', { door: EDITOR, sent: true });
		await proposal('digi-handboek', 'ander-eeee', { sent: true });
		expect(await statusOf('digi-handboek', EDITOR)).toEqual([
			'Je hebt 1 open voorstel',
			'2 voorstellen wachten op beoordeling'
		]);
	});

	it('keep the review line from everybody else', async () => {
		await proposal('digi-handboek', 'ingestuurd-ffff', { sent: true });
		await proposal('moza-site', 'ingestuurd-gggg', { sent: true });
		expect(await statusOf('digi-handboek', OTHER)).toEqual([]);
		expect(await statusOf('moza-site', EDITOR)).toEqual([]);
	});

	it('are left out, quietly, when the forge cannot be reached', async () => {
		await proposal('digi-handboek', 'eigen-hhhh', { door: OTHER });
		forge.listPrs = async () => {
			throw new ForgeError(503, 'GitHub is niet bereikbaar');
		};
		const { sites } = await visit();
		expect(sites.map((s) => s.status)).toEqual([[], []]);
		expect(sites.map((s) => s.naam)).toEqual(['Digi Handboek', 'MijnOverheid Zakelijk']);
		expect(log.warn).toHaveBeenCalledWith('home.status_failed', {
			site: 'digi-handboek',
			error: 'ForgeError',
			status: 503
		});
	});

	it('do not hold the page up for a forge that never answers', async () => {
		vi.useFakeTimers();
		forge.listPrs = () => new Promise(() => {});
		const result = visit();
		await vi.advanceTimersByTimeAsync(2000);
		const { sites } = await result;
		expect(sites.map((s) => s.status)).toEqual([[], []]);
		expect(log.warn).toHaveBeenCalledWith('home.status_timeout', { site: 'moza-site' });
		expect(vi.getTimerCount()).toBe(0);
	});

	it('are left out without a signed-in user, and the forge is not asked', async () => {
		const listPrs = vi.spyOn(forge, 'listPrs');
		expect((await visit(null)).sites.map((s) => s.status)).toEqual([[], []]);
		expect(listPrs).not.toHaveBeenCalled();
	});
});

describe('home page for the admins of a site with a problem', () => {
	const ADMIN = 'baas';
	let team: MemoryTeamStore;

	beforeEach(async () => {
		process.env.SCHRIJVER_BEHEERDERS = 'platform';
		team = new MemoryTeamStore();
		for (const { site, settings } of PREVIEW_SITES) await team.addSite(site, settings, null, null);
		await team.recordLogin({
			sub: ADMIN,
			name: 'Baas',
			email: 'baas@example.org',
			emailVerified: true
		});
		await team.addByEmail('moza-site', 'baas@example.org', 'beheerder', 'platform');
		useTeamStore(team);
	});
	afterEach(() => {
		delete process.env.SCHRIJVER_BEHEERDERS;
	});

	const card = async (sub: string, site: string) =>
		(await visit(sub)).sites.find((s) => s.id === site) as
			(Data['sites'][number] & { beschikbaar: boolean; klopNiet: boolean }) | undefined;

	it('shows a site nobody can edit to its admins only, with what is wrong', async () => {
		expect(await card('platform', 'oude-site')).toEqual({
			id: 'oude-site',
			naam: 'Oude site',
			omschrijving: 'Een site die nog de oude opzet heeft.',
			adres: undefined,
			status: [],
			beschikbaar: false,
			klopNiet: true
		});
		expect(await card(OTHER, 'oude-site')).toBeUndefined();
		expect(await card(ADMIN, 'oude-site')).toBeUndefined();
		await team.addByEmail('oude-site', 'baas@example.org', 'beheerder', 'platform');
		expect(await card(ADMIN, 'oude-site')).toMatchObject({ beschikbaar: false, klopNiet: true });
	});

	it('tells the admins of a site, not the others, when a later change to its files is not valid', async () => {
		await forge.commit(
			'MinBZK/moza-site',
			'main',
			[{ path: '.schrijver/site.yaml', content: 'naam: MOZa\n' }],
			'm'
		);
		await store.reload('moza-site');
		expect(await card(ADMIN, 'moza-site')).toMatchObject({ beschikbaar: true, klopNiet: true });
		expect(await card('platform', 'moza-site')).toMatchObject({ klopNiet: true });
		expect(await card(OTHER, 'moza-site')).toMatchObject({ beschikbaar: true, klopNiet: false });
		expect(await card(ADMIN, 'digi-handboek')).toMatchObject({ klopNiet: false });
	});
});
