import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { log } from '../../src/lib/log';
import { actorPseudonym } from '../../src/lib/auth/identity';
import type { TeamStore } from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';
import type { FakeForge } from '../../src/lib/forge/fake';
import { ConfigStore } from '../../src/lib/config/load';
import { buildFakeServices, PREVIEW_SITES } from '../../src/lib/server/fake-mode';
import { beheerPostLimit } from '../../src/lib/server/security';
import { getConfigStore, setConfigStore, setForge } from '../../src/lib/server/services';
import { actions, load } from '../../src/routes/instellingen/sites/[site]/+page.server';

const DH = 'digi-handboek';
const MOZA = 'moza-site';
let team: TeamStore;
let forge: FakeForge;

const session = (sub: string): Session => ({
	sub,
	name: `Naam ${sub}`,
	email: `${sub}@example.org`,
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
});
/** Octo linked the GitHub account octo. */
const prefs = (sub: string): UserPrefs => ({
	sub,
	identity: 'anoniem',
	githubLogin: sub === 'octo' ? 'octo' : null,
	githubId: null,
	onboarded: true
});

function event(
	sub: string,
	site: string,
	fields: Record<string, string | string[]> = {},
	query = ''
) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		for (const value of Array.isArray(v) ? v : [v]) body.append(k, value);
	}
	return {
		params: { site },
		url: new URL(`http://x/instellingen/sites/${site}${query}`),
		locals: { user: { session: session(sub), prefs: prefs(sub) } },
		request: new Request(`http://x/instellingen/sites/${site}`, { method: 'POST', body })
	} as never;
}

type Action = keyof typeof actions;
const act = (
	name: Action,
	sub: string,
	site: string,
	fields: Record<string, string | string[]> = {}
) => (actions[name] as (e: never) => Promise<unknown>)(event(sub, site, fields));

/** What SvelteKit's error() and redirect() throw. */
const thrown = (p: Promise<unknown>) =>
	p.then(
		() => null,
		(e: unknown) => e
	);

type Lid = { sleutel: string; naam: string | null; email: string | null };

/** The key the beheer page gives a member, which its forms send back. */
async function sleutel(site: string, sub: string): Promise<string> {
	const { leden } = (await load(event('platform', site))) as { leden: Lid[] };
	const naam = sub === 'collega' ? 'Tweede Collega' : `Naam ${sub}`;
	return leden.find((lid) => lid.naam === naam)!.sleutel;
}

const SETTINGS = {
	naam: 'Digi Handboek',
	omschrijving: 'Kort',
	adres: 'https://example.org/',
	mergen: 'aan',
	vierOgen: 'aan',
	ondertekenen: ['gekoppeld', 'op-naam']
};

beforeAll(async () => {
	process.env.PSEUDONYM_SECRET = 'test-pseudonym-secret';
	process.env.SCHRIJVER_BEHEERDERS = 'platform';
	const services = await buildFakeServices();
	forge = services.forge;
	setConfigStore(services.store);
	setForge(forge);
});
afterAll(() => {
	delete process.env.SCHRIJVER_BEHEERDERS;
	useTeamStore(undefined);
});

beforeEach(async () => {
	team = new MemoryTeamStore();
	useTeamStore(team);
	for (const { site, settings } of PREVIEW_SITES) await team.addSite(site, settings, null, null);
	await team.addByEmail(DH, 'naam@rijksoverheid.nl', 'redactie', 'platform');
	for (const sub of ['baas', 'red', 'collega', 'platform']) {
		await team.recordLogin({
			sub,
			name: sub === 'collega' ? 'Tweede Collega' : `Naam ${sub}`,
			email: `${sub}@example.org`,
			emailVerified: true
		});
	}
	await team.addByEmail(DH, 'baas@example.org', 'beheerder', 'platform');
	await team.addByEmail(DH, 'red@example.org', 'redactie', 'platform');
	vi.mocked(log.info).mockClear();
	// The limit on posts has a test of its own; the others post as often as they need.
	vi.spyOn(beheerPostLimit, 'take').mockReturnValue(true);
});

describe('who may manage a site', () => {
	it('answers 404 to a member of the redactie, a stranger and an unknown site', async () => {
		for (const [sub, site] of [
			['red', DH],
			['vreemd', DH],
			['baas', MOZA],
			['platform', 'bestaat-niet']
		]) {
			expect(await thrown(load(event(sub, site)) as Promise<unknown>)).toMatchObject({
				status: 404
			});
		}
	});

	it('logs every refused load and action by pseudonym, never with an address or a sub', async () => {
		vi.mocked(log.warn).mockClear();
		await thrown(load(event('red', DH)) as Promise<unknown>);
		await thrown(act('rol', 'red', DH, { rol: 'beheerder' }));
		await thrown(load(event('vreemd', 'iemand@example.org')) as Promise<unknown>);
		await act('verwijderSite', 'baas', DH);
		const actor = expect.stringMatching(/^[0-9a-f]{12}$/);
		expect(vi.mocked(log.warn).mock.calls).toEqual([
			['beheer.refused', { page: 'beheer', site: DH, action: 'load', actor }],
			['beheer.refused', { page: 'beheer', site: DH, action: 'rol', actor }],
			['beheer.refused', { page: 'beheer', site: null, action: 'load', actor }],
			['beheer.refused', { page: 'beheer', site: DH, action: 'verwijderSite', actor }]
		]);
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toMatch(/@|"red"|"baas"|vreemd/);
	});

	it('refuses more than 30 posts a minute from one user, also refused ones; loading does not count', async () => {
		vi.mocked(beheerPostLimit.take).mockRestore();
		for (let i = 0; i < 40; i++) await load(event('baas', DH));
		for (let i = 0; i < 30; i++) {
			expect(await thrown(act('rol', 'vreemd', DH, { rol: 'beheerder' }))).toMatchObject({
				status: 404
			});
		}
		for (const name of ['rol', 'instellingen'] as Action[]) {
			expect(await thrown(act(name, 'vreemd', DH))).toMatchObject({
				status: 429,
				body: { message: 'Te veel aanvragen, probeer het zo opnieuw' }
			});
		}
		expect(await act('instellingen', 'baas', DH, SETTINGS)).toMatchObject({
			actie: 'instellingen'
		});
	});

	it('checks every action, not only the page', async () => {
		for (const name of Object.keys(actions) as Action[]) {
			expect(
				await thrown(act(name, 'red', DH, { email: 'x@example.org', rol: 'beheerder' }))
			).toMatchObject({ status: 404 });
		}
		expect(await team.role(DH, 'red')).toBe('redactie');
	});

	it('shows the team, the invitations and the settings to a beheerder of the site', async () => {
		const data = (await load(event('baas', DH))) as Record<string, unknown>;
		expect(data.beheer).toEqual({ id: DH, naam: 'Digi Handboek' });
		const key = expect.stringMatching(/^[0-9a-f]{32}$/);
		expect(data.leden).toEqual([
			expect.objectContaining({ sleutel: key, naam: 'Naam baas', rol: 'beheerder', jij: true }),
			expect.objectContaining({
				sleutel: key,
				email: 'red@example.org',
				rol: 'redactie',
				jij: false
			})
		]);
		expect(data.uitnodigingen).toEqual([
			expect.objectContaining({ email: 'naam@rijksoverheid.nl', rol: 'redactie' })
		]);
		expect(data.instellingen).toMatchObject({ naam: 'Digi Handboek', vierOgen: false });
	});

	it('lets someone whose linked GitHub account has admin permission manage the site', async () => {
		forge.permissionByLogin.set('octo', 'admin');
		try {
			const data = (await load(event('octo', DH))) as { beheer: { naam: string } };
			expect(data.beheer.naam).toBe('Digi Handboek');
			forge.permissionByLogin.set('octo', 'write');
			expect(await thrown(load(event('octo', DH)) as Promise<unknown>)).toMatchObject({
				status: 404
			});
		} finally {
			forge.permissionByLogin.delete('octo');
		}
	});

	it('lets a platform admin manage any site', async () => {
		const data = (await load(event('platform', MOZA))) as { beheer: { naam: string } };
		expect(data.beheer.naam).toBe('MijnOverheid Zakelijk');
	});

	it('makes up no settings for a site that has none: a site gets them when it is added', async () => {
		const empty = new MemoryTeamStore();
		useTeamStore(empty);
		await expect(load(event('platform', MOZA))).rejects.toThrow('no settings for site moza-site');
		expect(await empty.settings(MOZA)).toBeNull();
		useTeamStore(team);
	});
});

describe('adding someone', () => {
	it('adds a known colleague at once and says no e-mail is sent', async () => {
		const result = await act('toevoegen', 'baas', DH, {
			email: ' Collega@Example.org ',
			rol: 'redactie'
		});
		expect(result).toEqual({
			actie: 'toevoegen',
			melding: 'Tweede Collega hoort nu bij het team, als lid van de redactie.',
			uitleg: 'Schrijver stuurt geen e-mail: laat het je collega zelf weten.'
		});
		expect(await team.role(DH, 'collega')).toBe('redactie');
	});

	it('invites an unknown address, for thirty days, without an e-mail', async () => {
		const result = (await act('toevoegen', 'baas', DH, {
			email: 'nieuw@example.org',
			rol: 'beheerder'
		})) as { melding: string; uitleg: string };
		expect(result.melding).toBe('nieuw@example.org is uitgenodigd als beheerder.');
		expect(result.uitleg).toContain('30 dagen');
		expect(result.uitleg).toContain('Schrijver stuurt geen e-mail');
		const again = (await act('toevoegen', 'baas', DH, {
			email: 'nieuw@example.org',
			rol: 'redactie'
		})) as { melding: string };
		expect(again.melding).toBe(
			'De uitnodiging voor nieuw@example.org is vernieuwd, als lid van de redactie.'
		);
	});

	it('says when someone is already on the team', async () => {
		const result = (await act('toevoegen', 'baas', DH, {
			email: 'red@example.org',
			rol: 'beheerder'
		})) as { melding: string };
		expect(result.melding).toBe('Naam red hoort al bij het team, als lid van de redactie.');
		expect(await team.role(DH, 'red')).toBe('redactie');
	});

	it('refuses an address that is not one, and a role that does not exist, in Dutch', async () => {
		expect(
			await act('toevoegen', 'baas', DH, { email: 'geen adres', rol: 'redactie' })
		).toMatchObject({
			status: 400,
			data: { actie: 'toevoegen', fout: 'Een e-mailadres heeft de vorm naam@organisatie.nl.' }
		});
		expect(await act('toevoegen', 'baas', DH, { email: '', rol: 'redactie' })).toMatchObject({
			data: { fout: 'Een e-mailadres is nodig.' }
		});
		expect(
			await act('toevoegen', 'baas', DH, { email: 'x@example.org', rol: 'baas' })
		).toMatchObject({ status: 400, data: { fout: 'Kies een rol.' } });
	});
});

describe('changing the team', () => {
	it('changes a role', async () => {
		const red = await sleutel(DH, 'red');
		expect(await act('rol', 'baas', DH, { sleutel: red, rol: 'beheerder' })).toEqual({
			actie: 'rol',
			sleutel: red,
			melding: 'Naam red is nu beheerder.'
		});
		expect(await team.role(DH, 'red')).toBe('beheerder');
	});

	it('refuses to leave the site without a beheerder, in one clear sentence', async () => {
		const baas = await sleutel(DH, 'baas');
		expect(await act('rol', 'baas', DH, { sleutel: baas, rol: 'redactie' })).toMatchObject({
			status: 409,
			data: {
				actie: 'rol',
				sleutel: baas,
				fout: 'Je bent de enige beheerder van Digi Handboek. Een site heeft altijd een beheerder: maak eerst iemand anders beheerder.'
			}
		});
		expect(await act('verwijderen', 'baas', DH, { sleutel: baas })).toMatchObject({
			status: 409
		});
		expect(await team.role(DH, 'baas')).toBe('beheerder');
	});

	it('names the last beheerder when a platform admin is not the one acting', async () => {
		await team.addByEmail(MOZA, 'collega@example.org', 'beheerder', 'platform');
		await team.addByEmail(MOZA, 'baas@example.org', 'beheerder', 'platform');
		await act('verwijderen', 'collega', MOZA, { sleutel: await sleutel(MOZA, 'baas') });
		const collega = await sleutel(MOZA, 'collega');
		expect(await act('rol', 'collega', MOZA, { sleutel: collega, rol: 'redactie' })).toMatchObject({
			data: {
				fout: 'Je bent de enige beheerder van MijnOverheid Zakelijk. Een site heeft altijd een beheerder: maak eerst iemand anders beheerder.'
			}
		});
	});

	it('lets a platform admin remove the last beheerder', async () => {
		const baas = await sleutel(DH, 'baas');
		expect(await act('verwijderen', 'platform', DH, { sleutel: baas })).toEqual({
			actie: 'verwijderen',
			sleutel: baas,
			melding: 'Naam baas hoort niet meer bij het team.'
		});
	});

	it('sends a beheerder who stepped down back to Instellingen', async () => {
		await team.addByEmail(DH, 'collega@example.org', 'beheerder', 'platform');
		const baas = await sleutel(DH, 'baas');
		expect(await thrown(act('rol', 'baas', DH, { sleutel: baas, rol: 'redactie' }))).toMatchObject({
			status: 303,
			location: '/instellingen'
		});
		expect(await team.role(DH, 'baas')).toBe('redactie');
	});

	it('says when someone is no longer on the team, and refuses an unknown role', async () => {
		expect(await act('verwijderen', 'baas', DH, { sleutel: 'f'.repeat(32) })).toMatchObject({
			status: 404,
			data: { fout: 'Deze persoon hoort niet meer bij het team.' }
		});
		const red = await sleutel(DH, 'red');
		expect(await act('rol', 'baas', DH, { sleutel: red, rol: 'eigenaar' })).toMatchObject({
			status: 400
		});
		await act('verwijderen', 'baas', DH, { sleutel: red });
		expect(await act('rol', 'baas', DH, { sleutel: red, rol: 'beheerder' })).toMatchObject({
			status: 404,
			data: { actie: 'rol', sleutel: red, fout: 'Deze persoon hoort niet meer bij het team.' }
		});
	});

	it('knows a member only by the key of the page: a sub, a pseudonym or a key of another site does nothing', async () => {
		await team.addByEmail(MOZA, 'red@example.org', 'redactie', 'platform');
		const tries: Record<string, string>[] = [
			{ sub: 'red' },
			{ sleutel: 'red' },
			{ sleutel: actorPseudonym({ sub: 'red' }) },
			{ sleutel: await sleutel(MOZA, 'red') }
		];
		for (const fields of tries) {
			expect(
				await act('rol', 'baas', DH, { ...fields, rol: 'beheerder' }),
				JSON.stringify(fields)
			).toMatchObject({ status: 404 });
		}
		expect(await team.role(DH, 'red')).toBe('redactie');
	});

	it('sends no sub of anyone to the browser, only a key per site and member', async () => {
		const subs = ['9b0c2f6e-sub-een', '4d1a7c33-sub-twee'];
		for (const [i, sub] of subs.entries()) {
			const email = `lid${i}@team.example`;
			await team.recordLogin({ sub, name: `Lid ${i}`, email, emailVerified: true });
			await team.addByEmail(DH, email, 'redactie', 'platform');
			await team.addByEmail(MOZA, email, 'redactie', 'platform');
		}
		const data = (await load(event('baas', DH))) as { leden: Lid[] };
		const text = JSON.stringify(data);
		for (const sub of [...subs, 'baas', 'red']) expect(text).not.toContain(`"${sub}"`);
		for (const sub of subs) expect(text).not.toContain(sub);
		const keys = data.leden.map((lid) => lid.sleutel);
		expect(new Set(keys).size).toBe(keys.length);
		for (const sub of [...subs, 'baas', 'red']) {
			expect(keys).not.toContain(actorPseudonym({ sub }));
			expect(keys.some((key) => key.startsWith(actorPseudonym({ sub })))).toBe(false);
		}
		const moza = (await load(event('platform', MOZA))) as { leden: Lid[] };
		expect(moza.leden.map((lid) => lid.sleutel).filter((key) => keys.includes(key))).toEqual([]);
	});

	it('revokes an invitation, and says when it is gone', async () => {
		const [invitation] = await team.invitations(DH);
		expect(await act('intrekken', 'baas', DH, { id: invitation.id })).toEqual({
			actie: 'intrekken',
			melding: 'De uitnodiging voor naam@rijksoverheid.nl is ingetrokken.'
		});
		expect(await act('intrekken', 'baas', DH, { id: invitation.id })).toMatchObject({
			status: 404,
			data: { fout: 'Deze uitnodiging bestaat niet meer.' }
		});
	});

	it('logs who acted by pseudonym, and no e-mail address', async () => {
		await act('toevoegen', 'baas', DH, { email: 'nieuw@example.org', rol: 'redactie' });
		await act('rol', 'baas', DH, { sleutel: await sleutel(DH, 'red'), rol: 'beheerder' });
		const lines = JSON.stringify(vi.mocked(log.info).mock.calls);
		expect(lines).toContain('team.add');
		expect(lines).toContain('team.role_changed');
		expect(lines).not.toContain('@');
		expect(lines).not.toContain('"baas"');
	});
});

describe('the settings of the site', () => {
	it('saves them, with anoniem always allowed', async () => {
		expect(
			await act('instellingen', 'baas', DH, {
				...SETTINGS,
				naam: ' Handboek ',
				vierOgen: 'uit',
				ondertekenen: ['op-naam']
			})
		).toEqual({ actie: 'instellingen', melding: 'De instellingen van de site zijn bewaard.' });
		expect(await team.settings(DH)).toMatchObject({
			naam: 'Handboek',
			omschrijving: 'Kort',
			vierOgen: false,
			mergenVanuitSchrijver: true,
			identiteitToegestaan: ['anoniem', 'op-naam'],
			updatedBy: 'baas'
		});
	});

	it('refuses a missing name and an address that is not a web address, in Dutch', async () => {
		expect(
			await act('instellingen', 'baas', DH, { ...SETTINGS, naam: '  ', adres: 'ftp://example.org' })
		).toMatchObject({
			status: 400,
			data: {
				actie: 'instellingen',
				fouten: {
					naam: 'Een naam is nodig.',
					adres: 'Een adres begint met https:// of http://, zoals https://example.org.'
				}
			}
		});
		expect(
			await act('instellingen', 'baas', DH, { ...SETTINGS, adres: 'example.org' })
		).toMatchObject({ status: 400 });
		expect(
			await act('instellingen', 'baas', DH, { ...SETTINGS, omschrijving: 'x'.repeat(301) })
		).toMatchObject({
			data: { fouten: { omschrijving: 'Een omschrijving heeft hoogstens 300 tekens.' } }
		});
		expect((await team.settings(DH))?.naam).toBe('Digi Handboek');
	});

	it('refuses a request without the on/off fields', async () => {
		const { mergen: _mergen, ...rest } = SETTINGS;
		expect(await act('instellingen', 'baas', DH, rest)).toMatchObject({
			status: 400,
			data: { fout: 'Ongeldige aanvraag.' }
		});
	});

	it('keeps an empty description and address empty', async () => {
		await act('instellingen', 'baas', DH, { ...SETTINGS, omschrijving: '', adres: '' });
		expect(await team.settings(DH)).toMatchObject({ omschrijving: null, adres: null });
	});
});

type Structure = {
	bruikbaar: boolean;
	fouten: string[];
	url: string;
	samenvatting: Record<string, unknown> | null;
};

describe('the structure of the site', () => {
	it('summarises .schrijver/ and links to it on GitHub', async () => {
		const data = (await load(event('baas', DH))) as { structuur: Structure };
		expect(data.structuur).toEqual({
			bruikbaar: true,
			fouten: [],
			url: 'https://github.com/DigiGilde/handboek/tree/main/.schrijver',
			samenvatting: {
				paginas: 'docs/**/*.md',
				uitsluiten: [],
				afbeeldingen: 'docs/afbeeldingen/{paginaslug}',
				voorbeeld: 'Bij elke keer bewaren',
				nieuwePaginas: ['kennis', 'werkwijze', 'onboarding', 'over'],
				schrijfwijzer: false
			}
		});
		const moza = (await load(event('platform', MOZA))) as { structuur: Structure };
		expect(moza.structuur.samenvatting).toMatchObject({
			uitsluiten: ['documenten/**'],
			voorbeeld: 'Na insturen',
			nieuwePaginas: ['Weekly', 'Handboekpagina', 'Onderwerp'],
			schrijfwijzer: true
		});
	});

	it('lets its admins manage a site nobody can edit, and shows them what is wrong', async () => {
		const data = (await load(event('platform', 'oude-site'))) as {
			beheer: { naam: string };
			structuur: Structure;
		};
		expect(data.beheer.naam).toBe('Oude site');
		expect(data.structuur).toMatchObject({ bruikbaar: false, samenvatting: null });
		expect(data.structuur.fouten).toContain('.schrijver/schema.yaml: ontbreekt');
		expect(await thrown(load(event('baas', 'oude-site')) as Promise<unknown>)).toMatchObject({
			status: 404
		});
	});

	it('says the site was added only right after adding it', async () => {
		expect(((await load(event('platform', DH, {}, '?toegevoegd=1'))) as never)['toegevoegd']).toBe(
			true
		);
		expect(((await load(event('platform', DH))) as never)['toegevoegd']).toBe(false);
	});
});

describe('removing a site', () => {
	it('is offered to platform admins only', async () => {
		expect(((await load(event('platform', DH))) as never)['magVerwijderen']).toBe(true);
		expect(((await load(event('baas', DH))) as never)['magVerwijderen']).toBe(false);
	});

	it('is refused to a beheerder of the site, and to anyone else', async () => {
		expect(await act('verwijderSite', 'baas', DH)).toMatchObject({
			status: 403,
			data: { fout: 'Alleen een beheerder van Schrijver haalt een site uit Schrijver.' }
		});
		expect(await thrown(act('verwijderSite', 'red', DH))).toMatchObject({ status: 404 });
		expect((await team.sites()).map((s) => s.id)).toContain(DH);
	});

	it('removes the site with its team for a platform admin, writes it down and reloads the sites', async () => {
		const before = getConfigStore();
		const store = new ConfigStore(team, () => forge);
		await store.load();
		setConfigStore(store);
		try {
			expect(await thrown(act('verwijderSite', 'platform', DH))).toMatchObject({
				status: 303,
				location: '/instellingen?verwijderd=1'
			});
			expect((await team.sites()).map((s) => s.id)).not.toContain(DH);
			expect(await team.members(DH)).toEqual([]);
			expect(await team.invitations(DH)).toEqual([]);
			expect((await team.audit(DH))[0]).toMatchObject({
				actorSub: 'platform',
				action: 'site.removed',
				target: 'DigiGilde/handboek'
			});
			expect(store.site(DH)).toBeUndefined();
			expect(store.status(DH)).toBeUndefined();
			expect(log.info).toHaveBeenCalledWith('site.removed', {
				site: DH,
				actor: expect.any(String)
			});
			expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain('platform');
		} finally {
			setConfigStore(before);
		}
	});
});
