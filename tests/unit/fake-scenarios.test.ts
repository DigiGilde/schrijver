import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SiteConfig } from '../../src/lib/config/types';
import type { FakeForge } from '../../src/lib/forge/fake';
import { pseudonym } from '../../src/lib/forge/trailers';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices, seedScenarios } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/sites/[site]/voorstellen/[nummer]/+page.server';
import { useTeams } from './team-fixture';

type SiteId = 'digi-handboek' | 'moza-site';
/** The reader, lezer, wrote the seeded proposals of the test user; on the redactie of the site or not. */
const EDITOR = true;
const ANYONE = false;

let forge: FakeForge;
let sites: SiteConfig[];
let mergeInSchrijver = true;

async function numberOf(repo: string, title: string): Promise<number> {
	const pr = (await forge.listPrs(repo, 'all')).find((p) => p.title === title);
	if (!pr) throw new Error(`Geen voorstel ${title}`);
	return pr.number;
}

async function sentence(site: SiteId, title: string, redactie: boolean): Promise<string> {
	const repo = site === 'digi-handboek' ? 'DigiGilde/handboek' : 'MinBZK/moza-site';
	const nummer = await numberOf(repo, title);
	await useTeams(sites, redactie ? { [site]: { lezer: 'redactie' } } : {});
	const data = (await load({
		params: { site, nummer: String(nummer) },
		url: new URL(`http://x/sites/${site}/voorstellen/${nummer}`),
		locals: {
			user: {
				session: {
					sub: 'lezer',
					name: 'Lezer',
					email: 'lezer@example.org',
					emailVerified: true,
					organisation: null,
					iat: 0,
					exp: Date.now() + 60_000
				},
				prefs: {
					sub: 'lezer',
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
	await seedScenarios(fake, pseudonym(process.env.PSEUDONYM_SECRET, 'lezer'));
	forge = fake;
	const site = store.site.bind(store);
	store.site = (id: string): SiteConfig | undefined => {
		const found = site(id);
		return found && id === 'moza-site'
			? { ...found, review: { ...found.review, 'mergen-vanuit-schrijver': mergeInSchrijver } }
			: found;
	};
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
			]
		];
		for (const [site, title, redactie, expected] of rows) {
			const reader = redactie ? 'de redactie' : 'een ander';
			expect(await sentence(site, title, redactie), `${title} voor ${reader}`).toMatch(expected);
		}
	});

	it('show the row for a site that merges on GitHub, with its setting turned off', async () => {
		mergeInSchrijver = false;
		expect(await sentence('moza-site', 'Weekly 23 september: de demo', EDITOR)).toBe(
			'Bij deze site gebeurt samenvoegen op GitHub.'
		);
		mergeInSchrijver = true;
	});

	it('leave out the proposals of the test user when there is none', async () => {
		const { forge: fake } = await buildFakeServices();
		await seedScenarios(fake, null);
		const titles = (await fake.listPrs('DigiGilde/handboek', 'all')).map((p) => p.title);
		expect(titles).not.toContain('Onboarding: begin bij je buddy');
		expect(titles).toContain('Kennis: het team stelt zich voor');
	});
});
