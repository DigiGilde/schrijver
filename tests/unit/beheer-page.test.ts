import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { log } from '../../src/lib/log';
import { seedFromConfig, type TeamStore } from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { seedSites, useTeamStore } from '../../src/lib/auth/team-store';
import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { getConfigStore, setConfigStore } from '../../src/lib/server/services';
import { actions, load } from '../../src/routes/instellingen/sites/[site]/+page.server';

const DH = 'digi-handboek';
const MOZA = 'moza-site';
let team: TeamStore;

const session = (sub: string): Session => ({
	sub,
	name: `Naam ${sub}`,
	email: `${sub}@example.org`,
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
});
const prefs = (sub: string): UserPrefs => ({
	sub,
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true
});

function event(sub: string, site: string, fields: Record<string, string | string[]> = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		for (const value of Array.isArray(v) ? v : [v]) body.append(k, value);
	}
	return {
		params: { site },
		url: new URL(`http://x/instellingen/sites/${site}`),
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
	const { store } = await buildFakeServices();
	setConfigStore(store);
});
afterAll(() => {
	delete process.env.SCHRIJVER_BEHEERDERS;
	useTeamStore(undefined);
});

beforeEach(async () => {
	team = new MemoryTeamStore();
	useTeamStore(team);
	await seedSites(getConfigStore().sites(), team);
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
		expect(data.beheer).toEqual({ id: DH, naam: 'Digi Handboek', repo: 'DigiGilde/handboek' });
		expect(data.leden).toEqual([
			expect.objectContaining({ sub: 'baas', naam: 'Naam baas', rol: 'beheerder', jij: true }),
			expect.objectContaining({
				sub: 'red',
				email: 'red@example.org',
				rol: 'redactie',
				jij: false
			})
		]);
		expect(data.uitnodigingen).toEqual([
			expect.objectContaining({ email: 'naam@rijksoverheid.nl', rol: 'redactie' }),
			expect.objectContaining({ email: 'test@example.org', rol: 'redactie' })
		]);
		expect(data.instellingen).toMatchObject({ naam: 'Digi Handboek', vierOgen: true });
	});

	it('lets a platform admin manage any site', async () => {
		const data = (await load(event('platform', MOZA))) as { beheer: { naam: string } };
		expect(data.beheer.naam).toBe('MijnOverheid Zakelijk');
	});

	it('gives a configured site without settings its settings on the spot', async () => {
		const empty = new MemoryTeamStore();
		useTeamStore(empty);
		await load(event('platform', MOZA));
		expect((await empty.settings(MOZA))?.naam).toBe('MijnOverheid Zakelijk');
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
		expect(await act('rol', 'baas', DH, { sub: 'red', rol: 'beheerder' })).toEqual({
			actie: 'rol',
			sub: 'red',
			melding: 'Naam red is nu beheerder.'
		});
	});

	it('refuses to leave the site without a beheerder, in one clear sentence', async () => {
		expect(await act('rol', 'baas', DH, { sub: 'baas', rol: 'redactie' })).toMatchObject({
			status: 409,
			data: {
				actie: 'rol',
				sub: 'baas',
				fout: 'Je bent de enige beheerder van Digi Handboek. Een site heeft altijd een beheerder: maak eerst iemand anders beheerder.'
			}
		});
		expect(await act('verwijderen', 'baas', DH, { sub: 'baas' })).toMatchObject({ status: 409 });
		expect(await team.role(DH, 'baas')).toBe('beheerder');
	});

	it('names the last beheerder when a platform admin is not the one acting', async () => {
		await team.addByEmail(MOZA, 'collega@example.org', 'beheerder', 'platform');
		await team.addByEmail(MOZA, 'baas@example.org', 'beheerder', 'platform');
		await act('verwijderen', 'collega', MOZA, { sub: 'baas' });
		expect(await act('rol', 'collega', MOZA, { sub: 'collega', rol: 'redactie' })).toMatchObject({
			data: {
				fout: 'Je bent de enige beheerder van MijnOverheid Zakelijk. Een site heeft altijd een beheerder: maak eerst iemand anders beheerder.'
			}
		});
	});

	it('lets a platform admin remove the last beheerder', async () => {
		expect(await act('verwijderen', 'platform', DH, { sub: 'baas' })).toEqual({
			actie: 'verwijderen',
			sub: 'baas',
			melding: 'Naam baas hoort niet meer bij het team.'
		});
	});

	it('sends a beheerder who stepped down back to Instellingen', async () => {
		await team.addByEmail(DH, 'collega@example.org', 'beheerder', 'platform');
		expect(await thrown(act('rol', 'baas', DH, { sub: 'baas', rol: 'redactie' }))).toMatchObject({
			status: 303,
			location: '/instellingen'
		});
		expect(await team.role(DH, 'baas')).toBe('redactie');
	});

	it('says when someone is no longer on the team, and refuses an unknown role', async () => {
		expect(await act('verwijderen', 'baas', DH, { sub: 'vreemd' })).toMatchObject({
			status: 404,
			data: { fout: 'Deze persoon hoort niet meer bij het team.' }
		});
		expect(await act('rol', 'baas', DH, { sub: 'red', rol: 'eigenaar' })).toMatchObject({
			status: 400
		});
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
		await act('rol', 'baas', DH, { sub: 'red', rol: 'beheerder' });
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
		expect(seedFromConfig(getConfigStore().site(DH)!).values.adres).toBe(
			'https://digihandboek.rijks.app/'
		);
	});
});
