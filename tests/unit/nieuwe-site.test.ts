import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';
import type { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError, type RepoInfo } from '../../src/lib/forge/types';
import { log } from '../../src/lib/log';
import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { getConfigStore, setConfigStore, setForge } from '../../src/lib/server/services';
import { actions, load } from '../../src/routes/instellingen/sites/nieuw/+page.server';
import {
	parseNewSite,
	repositoryName,
	suggestedId,
	suggestion
} from '../../src/routes/instellingen/sites/nieuw/nieuwe-site';

describe('repositoryName', () => {
	it('reads owner/name, or the address of the repository on GitHub', () => {
		expect(repositoryName('DigiGilde/handboek')).toBe('DigiGilde/handboek');
		expect(repositoryName('  https://github.com/DigiGilde/handboek.git ')).toBe(
			'DigiGilde/handboek'
		);
		expect(repositoryName('https://github.com/MinBZK/moza-site/')).toBe('MinBZK/moza-site');
		expect(repositoryName('o/site.nl')).toBe('o/site.nl');
	});

	it('refuses anything else', () => {
		for (const typed of [
			'',
			'handboek',
			'a/b/c',
			'https://evil.example/o/r',
			'https://github.com/o/r/tree/main',
			'o/..',
			'o/.',
			'-o/r',
			'o r/x',
			'o/r?x=1'
		]) {
			expect(repositoryName(typed), typed).toBeNull();
		}
	});
});

describe('the suggestion for step 2', () => {
	const repo = (over: Partial<RepoInfo> = {}): RepoInfo => ({
		id: 1,
		fullName: 'DigiGilde/Kennis_Bank',
		defaultBranch: 'main',
		description: 'Wat we weten.',
		homepage: 'https://kennis.example/',
		isPublic: true,
		...over
	});

	it('takes an id from the repository name that no site has', () => {
		expect(suggestedId('DigiGilde/Kennis_Bank', new Set())).toBe('kennis-bank');
		expect(suggestedId('o/Kennis-Bank', new Set(['kennis-bank', 'kennis-bank-2']))).toBe(
			'kennis-bank-3'
		);
		expect(suggestedId('o/nieuw', new Set())).toBe('nieuw-2');
		expect(suggestedId('o/Één.site', new Set())).toBe('een-site');
		expect(suggestedId('o/___', new Set())).toBe('site');
	});

	it('takes the name, description and address from GitHub, an address only on the web', () => {
		expect(suggestion(repo(), new Set())).toEqual({
			id: 'kennis-bank',
			naam: 'Kennis Bank',
			omschrijving: 'Wat we weten.',
			adres: 'https://kennis.example/',
			beheerder: 'ik',
			email: '',
			zichtbaarheid: 'iedereen'
		});
		expect(suggestion(repo({ homepage: 'javascript:alert(1)' }), new Set()).adres).toBe('');
		expect(
			suggestion(repo({ description: 'x'.repeat(400), homepage: null }), new Set())
		).toMatchObject({ omschrijving: 'x'.repeat(300), adres: '' });
	});

	it('lets only the team see a site whose repository is not public', () => {
		expect(suggestion(repo({ isPublic: false }), new Set()).zichtbaarheid).toBe('team');
	});
});

describe('parseNewSite', () => {
	const form = (fields: Record<string, string>) => {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.append(k, v);
		return body;
	};
	const VALID = {
		id: 'kennisbank',
		naam: 'Kennisbank',
		omschrijving: '',
		adres: '',
		zichtbaarheid: 'iedereen'
	};

	it('gives the starting settings, who sees the site, and the first beheerder', () => {
		expect(parseNewSite(form({ ...VALID, beheerder: 'ik' }), new Set(), true)).toEqual({
			ok: true,
			id: 'kennisbank',
			values: {
				naam: 'Kennisbank',
				omschrijving: null,
				adres: null,
				mergenVanuitSchrijver: true,
				vierOgen: true,
				identiteitToegestaan: ['anoniem', 'gekoppeld', 'op-naam'],
				zichtbaarheid: 'iedereen'
			},
			admin: 'ik'
		});
		expect(
			parseNewSite(
				form({ ...VALID, beheerder: 'collega', email: ' Naam@Example.org ' }),
				new Set(),
				true
			)
		).toMatchObject({ ok: true, admin: { email: 'naam@example.org' } });
		expect(
			parseNewSite(form({ ...VALID, zichtbaarheid: 'team', beheerder: 'ik' }), new Set(), true)
		).toMatchObject({ ok: true, values: { zichtbaarheid: 'team' } });
	});

	it('lets only the team see a private repository, whatever the form says', () => {
		for (const zichtbaarheid of ['iedereen', 'team', 'iets anders']) {
			expect(
				parseNewSite(form({ ...VALID, zichtbaarheid, beheerder: 'ik' }), new Set(), false)
			).toMatchObject({ ok: true, values: { zichtbaarheid: 'team' } });
		}
		expect(parseNewSite(form({ ...VALID, beheerder: 'ik' }), new Set(), false)).toMatchObject({
			ok: true,
			values: { zichtbaarheid: 'team' }
		});
	});

	it('says in Dutch what is wrong with each field, and keeps what was typed', () => {
		const cases: [Record<string, string>, Record<string, string>][] = [
			[{ id: '' }, { id: 'Een naam in het adres is nodig.' }],
			[{ id: 'x'.repeat(51) }, { id: 'Een naam in het adres heeft hoogstens 50 tekens.' }],
			[
				{ id: 'Kennis_Bank' },
				{
					id: 'Een naam in het adres heeft kleine letters en cijfers, met streepjes ertussen, zoals kennisbank.'
				}
			],
			[
				{ id: '-kennis' },
				{ id: expect.stringMatching(/^Een naam in het adres heeft kleine letters/) }
			],
			[{ id: 'nieuw' }, { id: 'Deze naam in het adres gebruikt Schrijver zelf. Kies een andere.' }],
			[
				{ id: 'digi-handboek' },
				{ id: 'Er is al een site met deze naam in het adres. Kies een andere.' }
			],
			[{ naam: ' ' }, { naam: 'Een naam is nodig.' }],
			[{ adres: 'ftp://x' }, { adres: expect.stringMatching(/^Een adres begint met https/) }],
			[{ beheerder: 'collega', email: '' }, { email: 'Een e-mailadres is nodig.' }],
			[
				{ beheerder: 'collega', email: 'geen adres' },
				{ email: 'Een e-mailadres heeft de vorm naam@organisatie.nl.' }
			],
			[{ zichtbaarheid: 'niemand' }, { zichtbaarheid: 'Kies wie de site ziet.' }]
		];
		for (const [fields, fouten] of cases) {
			const parsed = parseNewSite(form({ ...VALID, ...fields }), new Set(['digi-handboek']), true);
			expect(parsed, JSON.stringify(fields)).toMatchObject({ ok: false, fouten });
		}
		expect(
			parseNewSite(
				form({ ...VALID, id: 'Fout!', beheerder: 'collega', email: 'x', zichtbaarheid: 'team' }),
				new Set(),
				true
			)
		).toMatchObject({
			waarden: { id: 'Fout!', beheerder: 'collega', email: 'x', zichtbaarheid: 'team' }
		});
	});
});

const session = (sub: string): Session => ({
	sub,
	name: `Naam ${sub}`,
	email: `${sub}@example.org`,
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
});

function event(sub: string | null, query = '', fields: Record<string, string> = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.append(k, v);
	return {
		url: new URL(`http://x/instellingen/sites/nieuw${query}`),
		locals: {
			user: sub && {
				session: session(sub),
				prefs: { sub, identity: 'anoniem', githubLogin: null, githubId: null, onboarded: true }
			}
		},
		request: new Request(`http://x/instellingen/sites/nieuw${query}`, { method: 'POST', body })
	} as never;
}

const step = (sub: string, repo?: string) =>
	load(event(sub, repo === undefined ? '' : `?repo=${encodeURIComponent(repo)}`)) as Promise<
		Record<string, unknown>
	>;
const add = (sub: string, fields: Record<string, string>) =>
	(actions.toevoegen as (e: never) => Promise<unknown>)(event(sub, '', fields));
const thrown = (p: Promise<unknown>) =>
	p.then(
		() => null,
		(e: unknown) => e
	);

let forge: FakeForge;
let team: MemoryTeamStore;

beforeEach(async () => {
	process.env.SCHRIJVER_BEHEERDERS = 'platform';
	process.env.PSEUDONYM_SECRET = 'nieuwe-site-test-secret';
	team = new MemoryTeamStore();
	useTeamStore(team);
	const services = await buildFakeServices(team);
	forge = services.forge;
	setForge(forge);
	setConfigStore(services.store);
	for (const sub of ['platform', 'baas']) {
		await team.recordLogin({
			sub,
			name: `Naam ${sub}`,
			email: `${sub}@example.org`,
			emailVerified: true
		});
	}
	await team.addByEmail('digi-handboek', 'baas@example.org', 'beheerder', 'platform');
	vi.clearAllMocks();
});
afterAll(() => {
	delete process.env.SCHRIJVER_BEHEERDERS;
	useTeamStore(undefined);
});

const KENNISBANK = {
	repo: 'DigiGilde/kennisbank',
	id: 'kennisbank',
	naam: 'Kennisbank',
	omschrijving: 'Wat het Digi Gilde weet.',
	adres: 'https://kennisbank.example.org/',
	zichtbaarheid: 'iedereen',
	beheerder: 'ik'
};

describe('who may add a site', () => {
	it('is a platform admin: a site admin and anyone else get the page that does not exist', async () => {
		for (const sub of ['baas', 'iemand']) {
			expect(await thrown(step(sub)), sub).toMatchObject({ status: 404 });
			expect(await thrown(step(sub, 'DigiGilde/kennisbank')), sub).toMatchObject({
				status: 404
			});
			expect(await thrown(add(sub, KENNISBANK)), sub).toMatchObject({ status: 404 });
		}
		expect(await thrown(load(event(null)) as Promise<unknown>)).toMatchObject({
			status: 303,
			location: '/login'
		});
		expect((await team.sites()).map((s) => s.id)).not.toContain('kennisbank');
	});

	it('refuses more than 30 posts a minute from one user; checking a repository does not count', async () => {
		for (let i = 0; i < 31; i++) await thrown(step('veel', 'DigiGilde/kennisbank'));
		for (let i = 0; i < 30; i++) {
			expect(await thrown(add('veel', KENNISBANK))).toMatchObject({ status: 404 });
		}
		expect(await thrown(add('veel', KENNISBANK))).toMatchObject({
			status: 429,
			body: { message: 'Te veel aanvragen, probeer het zo opnieuw' }
		});
	});

	it('logs every refused load and action by pseudonym, never with an address or a sub', async () => {
		await thrown(step('baas', 'DigiGilde/kennisbank'));
		await thrown(add('baas', KENNISBANK));
		const actor = expect.stringMatching(/^[0-9a-f]{12}$/);
		expect(vi.mocked(log.warn).mock.calls).toEqual([
			['beheer.refused', { page: 'site-toevoegen', action: 'load', actor }],
			['beheer.refused', { page: 'site-toevoegen', action: 'toevoegen', actor }]
		]);
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toMatch(/@|"baas"/);
	});
});

describe('step 1', () => {
	it('starts empty', async () => {
		expect(await step('platform')).toEqual({ stap: 1, repo: '', weigering: null });
	});

	it('refuses what is no repository name', async () => {
		expect(await step('platform', 'kennisbank')).toEqual({
			stap: 1,
			repo: 'kennisbank',
			weigering: { soort: 'vorm' }
		});
	});

	it('says the App is not installed, with where to install it', async () => {
		expect((await step('platform', 'MinBZK/elders')).weigering).toEqual({
			soort: 'niet-geinstalleerd',
			repo: 'MinBZK/elders',
			installeren: 'https://github.com/apps/schrijver/installations/new'
		});
		expect((await step('platform', 'MinBZK/bestaat-niet')).weigering).toMatchObject({
			soort: 'niet-geinstalleerd'
		});
	});

	it('says GitHub cannot be reached, and logs no more than the kind of error', async () => {
		forge.failNext('repository', new ForgeError(502, 'GitHub is niet bereikbaar'));
		expect((await step('platform', 'DigiGilde/kennisbank')).weigering).toEqual({
			soort: 'onbereikbaar'
		});
		expect(log.warn).toHaveBeenCalledWith('site.add_check_failed', {
			error: 'ForgeError',
			status: 502
		});
	});

	it('knows a repository that is a site already by its id, whatever its name', async () => {
		const taken = {
			soort: 'al-aangesloten',
			repo: 'DigiGilde/handboek',
			site: { id: 'digi-handboek', naam: 'Digi Handboek' }
		};
		expect((await step('platform', 'digigilde/HANDBOEK')).weigering).toEqual(taken);
		forge.renameRepo('DigiGilde/handboek', 'DigiGilde/handboek-nieuw');
		expect((await step('platform', 'DigiGilde/handboek-nieuw')).weigering).toEqual({
			...taken,
			repo: 'DigiGilde/handboek-nieuw'
		});
	});

	it('leads a private repository to step 2, where only its team sees the site', async () => {
		expect(await step('platform', 'digigilde/besloten')).toMatchObject({
			stap: 2,
			repo: 'DigiGilde/besloten',
			openbaar: false,
			voorstel: { id: 'besloten', zichtbaarheid: 'team' }
		});
	});

	it('names what is wrong with .schrijver, or that it is not there', async () => {
		expect((await step('platform', 'DigiGilde/intranet')).weigering).toEqual({
			soort: 'klopt-niet',
			repo: 'DigiGilde/intranet',
			fouten: [
				'.schrijver/site.yaml: preview.label: is nodig bij soort: bij-label',
				'.schrijver/site.yaml: preview.url: moet {nummer} bevatten',
				'.schrijver/schema.yaml: velden.kleur.type: moet een van deze waarden zijn: tekst, getal, ja-nee, datum, paginaverwijzing'
			],
			zonderMap: false
		});
		expect((await step('platform', 'DigiGilde/nieuwsbrief')).weigering).toMatchObject({
			soort: 'klopt-niet',
			zonderMap: true
		});
	});

	it('leads a repository that can be a site to step 2, with a suggestion from GitHub', async () => {
		expect(await step('platform', 'https://github.com/digigilde/kennisbank')).toEqual({
			stap: 2,
			repo: 'DigiGilde/kennisbank',
			branch: 'main',
			openbaar: true,
			voorstel: {
				id: 'kennisbank',
				naam: 'Kennisbank',
				omschrijving: 'Wat het Digi Gilde weet over werken bij de overheid.',
				adres: 'https://kennisbank.example.org/',
				beheerder: 'ik',
				email: '',
				zichtbaarheid: 'iedereen'
			}
		});
	});
});

describe('step 2', () => {
	it('adds the site with its first beheerder, writes it down and makes it available', async () => {
		expect(await thrown(add('platform', KENNISBANK))).toMatchObject({
			status: 303,
			location: '/instellingen/sites/kennisbank?toegevoegd=1'
		});
		expect((await team.sites()).find((s) => s.id === 'kennisbank')).toMatchObject({
			repoId: 4103,
			repo: 'DigiGilde/kennisbank',
			standaardbranch: 'main',
			createdBy: 'platform'
		});
		expect(await team.settings('kennisbank')).toMatchObject({
			naam: 'Kennisbank',
			omschrijving: 'Wat het Digi Gilde weet.',
			adres: 'https://kennisbank.example.org/',
			mergenVanuitSchrijver: true,
			vierOgen: true,
			identiteitToegestaan: ['anoniem', 'gekoppeld', 'op-naam']
		});
		expect(await team.role('kennisbank', 'platform')).toBe('beheerder');
		expect((await team.audit('kennisbank')).map((a) => a.action).sort()).toEqual([
			'member.added',
			'site.added'
		]);
		expect(getConfigStore().site('kennisbank')?.content.pad).toBe('inhoud');
		expect(log.info).toHaveBeenCalledWith('site.added', {
			site: 'kennisbank',
			admin: 'added',
			actor: expect.any(String)
		});
		expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toMatch(/platform|@/);
	});

	it('invites a colleague as first beheerder, without an address in the logs', async () => {
		await thrown(
			add('platform', { ...KENNISBANK, beheerder: 'collega', email: 'Nieuw@Example.org' })
		);
		expect((await team.invitations('kennisbank')).map((i) => [i.email, i.role])).toEqual([
			['nieuw@example.org', 'beheerder']
		]);
		expect(await team.members('kennisbank')).toEqual([]);
		expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain('@');
	});

	it('checks the repository again: what changed since step 1 refuses', async () => {
		forge.setInstalled('DigiGilde/kennisbank', false);
		expect(await add('platform', KENNISBANK)).toMatchObject({
			status: 409,
			data: { weigering: { soort: 'niet-geinstalleerd' } }
		});
		forge.setInstalled('DigiGilde/kennisbank', true);
		await forge.commit(
			'DigiGilde/kennisbank',
			'main',
			[{ path: '.schrijver/site.yaml', content: 'naam: Kennisbank\n' }],
			'm'
		);
		expect(await add('platform', KENNISBANK)).toMatchObject({
			status: 409,
			data: { weigering: { soort: 'klopt-niet' } }
		});
		expect(await add('platform', { ...KENNISBANK, repo: 'digigilde/handboek' })).toMatchObject({
			status: 409,
			data: { weigering: { soort: 'al-aangesloten' } }
		});
		expect((await team.sites()).map((s) => s.id)).not.toContain('kennisbank');
	});

	it('adds a private repository that only its team sees, with its first beheerder', async () => {
		forge.setPublic('DigiGilde/kennisbank', false);
		expect(
			await thrown(add('platform', { ...KENNISBANK, zichtbaarheid: 'iedereen' }))
		).toMatchObject({ status: 303 });
		expect(await team.settings('kennisbank')).toMatchObject({ zichtbaarheid: 'team' });
		expect(await team.role('kennisbank', 'platform')).toBe('beheerder');
		expect(getConfigStore().status('kennisbank')).toMatchObject({
			available: true,
			isPublic: false
		});
	});

	it('lets the platform admin choose who sees a site whose repository is public', async () => {
		await thrown(add('platform', { ...KENNISBANK, zichtbaarheid: 'team' }));
		expect(await team.settings('kennisbank')).toMatchObject({ zichtbaarheid: 'team' });
	});

	it('refuses fields that are not right, and an id that is taken', async () => {
		expect(await add('platform', { ...KENNISBANK, id: 'moza-site', naam: '' })).toMatchObject({
			status: 400,
			data: {
				fouten: {
					id: 'Er is al een site met deze naam in het adres. Kies een andere.',
					naam: 'Een naam is nodig.'
				},
				waarden: { id: 'moza-site', naam: '' }
			}
		});
		expect((await team.sites()).map((s) => s.id)).not.toContain('kennisbank');
	});

	it('refuses an id another platform admin took a moment ago', async () => {
		const taken = vi
			.spyOn(team, 'addSite')
			.mockResolvedValueOnce({ ok: false, reason: 'id-taken' });
		expect(await add('platform', KENNISBANK)).toMatchObject({
			status: 400,
			data: { fouten: { id: 'Er is al een site met deze naam in het adres. Kies een andere.' } }
		});
		expect(taken).toHaveBeenCalledOnce();
	});
});
