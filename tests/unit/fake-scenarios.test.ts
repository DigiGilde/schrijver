import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SiteConfig } from '../../src/lib/config/types';
import type { FakeForge } from '../../src/lib/forge/fake';
import { pseudonym } from '../../src/lib/forge/trailers';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import {
	buildFakeServices,
	seedScenarios,
	seedWriters,
	type WrittenProposal
} from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/sites/[site]/voorstellen/[nummer]/+page.server';
import { useTeams } from './team-fixture';

type SiteId = 'digi-handboek' | 'moza-site';
/** The reader, lezer, wrote the seeded proposals of the test user; on the redactie of the site or not. */
const EDITOR = true;
const ANYONE = false;

let forge: FakeForge;
let sites: SiteConfig[];
let written: WrittenProposal[];

async function numberOf(repo: string, title: string): Promise<number> {
	const pr = (await forge.listPrs(repo, 'all')).find((p) => p.title === title);
	if (!pr) throw new Error(`Geen voorstel ${title}`);
	return pr.number;
}

async function sentence(
	site: SiteId,
	title: string,
	redactie: boolean,
	{ mergenVanuitSchrijver = true, sub = 'lezer' } = {}
): Promise<string> {
	const repo = site === 'digi-handboek' ? 'DigiGilde/handboek' : 'MinBZK/moza-site';
	const nummer = await numberOf(repo, title);
	const team = await useTeams(sites, redactie ? { [site]: { [sub]: 'redactie' } } : {});
	await team.recordLogin({
		sub: 'lezer',
		name: 'Lezer',
		email: 'lezer@example.org',
		emailVerified: true
	});
	await seedWriters(team, written, 'lezer');
	const settings = (await team.settings(site))!;
	await team.saveSettings(site, { ...settings, mergenVanuitSchrijver }, 'baas');
	const data = (await load({
		params: { site, nummer: String(nummer) },
		url: new URL(`http://x/sites/${site}/voorstellen/${nummer}`),
		locals: {
			user: {
				session: {
					sub,
					name: 'Lezer',
					email: 'lezer@example.org',
					emailVerified: true,
					organisation: null,
					iat: 0,
					exp: Date.now() + 60_000
				},
				prefs: {
					sub,
					identity: 'anoniem',
					githubLogin: null,
					githubId: null,
					onboarded: true
				}
			}
		}
	} as never)) as { watNu: { sentence: string } };
	return data.watNu.sentence;
}

beforeAll(async () => {
	process.env.PSEUDONYM_SECRET = 'fake-scenarios-test-secret';
	const { forge: fake, store } = await buildFakeServices();
	written = await seedScenarios(fake, pseudonym(process.env.PSEUDONYM_SECRET, 'lezer'));
	forge = fake;
	setForge(forge);
	setConfigStore(store);
	sites = store.sites();
});

describe('the fake fixtures of the local preview', () => {
	it('hold a proposal for every row of what now', async () => {
		const rows: [SiteId, string, boolean, RegExp][] = [
			[
				'digi-handboek',
				'Onboarding: begin bij je buddy',
				EDITOR,
				/^Je voorstel is nog een concept\./
			],
			[
				'moza-site',
				'Toegankelijkheid: wie je kunt mailen',
				ANYONE,
				/^De redactie beoordeelt je voorstel\./
			],
			[
				'digi-handboek',
				'Over het handboek: wie de redactie is',
				EDITOR,
				/^De redactie vraagt je iets aan te passen\./
			],
			['digi-handboek', 'Kennis: het team stelt zich voor', EDITOR, /^Jij beslist\./],
			[
				'moza-site',
				'Weekly 23 september: de demo',
				EDITOR,
				/^Deze site vraagt eerst een goedkeuring op GitHub\./
			],
			[
				'moza-site',
				'Toegankelijkheid: wie je kunt mailen',
				EDITOR,
				/^Je schreef dit voorstel zelf\./
			],
			[
				'moza-site',
				'Weekly 23 september: de demo',
				ANYONE,
				/^De redactie beoordeelt dit voorstel\.$/
			],
			['digi-handboek', 'Offboarding: laptop inleveren', ANYONE, /^Samengevoegd op /],
			[
				'digi-handboek',
				'Principes: oude versie terugzetten',
				ANYONE,
				/^Gesloten zonder samenvoegen\./
			],
			[
				'moza-site',
				'Weekly 10 september: de agenda',
				EDITOR,
				/^De pagina is intussen op de site veranderd\. Daardoor kan dit voorstel /
			],
			[
				'moza-site',
				'Weekly 3 september: de terugblik',
				ANYONE,
				/^De pagina is intussen op de site veranderd\. Daardoor kan je voorstel /
			],
			[
				'moza-site',
				'Facilitaire diensten: wie je belt',
				ANYONE,
				/^De redactie vraagt je iets aan te passen\. .* het op GitHub opnieuw\.$/
			]
		];
		for (const [site, title, redactie, expected] of rows) {
			const reader = redactie ? 'de redactie' : 'een ander';
			expect(await sentence(site, title, redactie), `${title} voor ${reader}`).toMatch(expected);
		}
	});

	it('let another editor merge the approved proposal of the test user', async () => {
		expect(
			await sentence('moza-site', 'Toegankelijkheid: wie je kunt mailen', EDITOR, { sub: 'derde' })
		).toMatch(/^Jij beslist\./);
	});

	it('show the row for a site that merges on GitHub, with its setting turned off', async () => {
		expect(
			await sentence('moza-site', 'Weekly 23 september: de demo', EDITOR, {
				mergenVanuitSchrijver: false
			})
		).toBe(
			'Bij deze site gebeurt samenvoegen op GitHub. Iemand met rechten op GitHub voegt het voorstel daar samen. Moet er iets anders, vraag dan om een aanpassing.'
		);
	});

	it('name the open proposals for the record of who wrote them, not the merged or closed ones', async () => {
		const repo = (siteId: string) =>
			({
				'digi-handboek': 'DigiGilde/handboek',
				'moza-site': 'MinBZK/moza-site',
				werkplaats: 'DigiGilde/intern'
			})[siteId]!;
		const titles = await Promise.all(
			written.map(async (w) => [(await forge.getPr(repo(w.siteId), w.number)).title, w.mine])
		);
		expect(titles).toEqual([
			['Onboarding: begin bij je buddy', true],
			['Over het handboek: wie de redactie is', true],
			['Toegankelijkheid: wie je kunt mailen', true],
			['Kennis: het team stelt zich voor', false],
			['Weekly 23 september: de demo', false],
			['Weekly 10 september: de agenda', false],
			['Weekly 3 september: de terugblik', true],
			['Facilitaire diensten: wie je belt', true],
			['Werkplaats: het rooster van de week', false]
		]);
	});

	it('leave out the proposals of the test user when there is none', async () => {
		const { forge: fake } = await buildFakeServices();
		await seedScenarios(fake, null);
		const titles = (await fake.listPrs('DigiGilde/handboek', 'all')).map((p) => p.title);
		expect(titles).not.toContain('Onboarding: begin bij je buddy');
		expect(titles).toContain('Kennis: het team stelt zich voor');
	});
});
