import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';
import type { FakeForge } from '../../src/lib/forge/fake';
import { buildFakeServices, PREVIEW_SITES } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/instellingen/+page.server';

const session = (sub: string): Session => ({
	sub,
	name: 'Naam',
	email: `${sub}@example.org`,
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
});

let forge: FakeForge;

const visit = async (sub: string, githubLogin: string | null = null, query = '') =>
	(await load({
		url: new URL(`http://x/instellingen${query}`),
		locals: {
			user: {
				session: session(sub),
				prefs: { sub, identity: 'anoniem', githubLogin, githubId: null, onboarded: true }
			}
		}
	} as never)) as {
		beheer: { platform: boolean; sites: { id: string; naam: string; klopNiet: boolean }[] };
		sites: { naam: string; toegestaan: string[] }[];
		kenmerk: string;
		siteVerwijderd: boolean;
	};

beforeAll(async () => {
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

let team: MemoryTeamStore;

beforeEach(async () => {
	team = new MemoryTeamStore();
	useTeamStore(team);
	for (const { site, settings } of PREVIEW_SITES) await team.addSite(site, settings, null, null);
	await team.recordLogin({
		sub: 'baas',
		name: 'B',
		email: 'baas@example.org',
		emailVerified: true
	});
	await team.addByEmail('moza-site', 'baas@example.org', 'beheerder', 'platform');
	await team.addByEmail('digi-handboek', 'baas@example.org', 'redactie', 'platform');
	const values = (await team.settings('moza-site'))!;
	await team.saveSettings('moza-site', { ...values, naam: 'MOZa' }, 'platform');
});

describe('Beheer on Instellingen', () => {
	it('lists every site for a platform admin, with the one whose files are not valid', async () => {
		expect((await visit('platform')).beheer).toEqual({
			platform: true,
			sites: [
				{ id: 'digi-handboek', naam: 'Digi Handboek', klopNiet: false },
				{ id: 'moza-site', naam: 'MOZa', klopNiet: false },
				{ id: 'oude-site', naam: 'Oude site', klopNiet: true },
				{ id: 'werkplaats', naam: 'Werkplaats', klopNiet: false }
			]
		});
	});

	it('lists the sites a beheerder manages, and not those where they are redactie', async () => {
		expect((await visit('baas')).beheer).toEqual({
			platform: false,
			sites: [{ id: 'moza-site', naam: 'MOZa', klopNiet: false }]
		});
	});

	it('says a site was removed only after a removal', async () => {
		expect((await visit('platform', null, '?verwijderd=1')).siteVerwijderd).toBe(true);
		expect((await visit('platform')).siteVerwijderd).toBe(false);
	});

	it('lists a site whose repository the linked GitHub account administers', async () => {
		forge.permissionByLogin.set('octo', 'admin');
		expect((await visit('iemand', 'octo')).beheer).toEqual({
			platform: false,
			sites: [
				{ id: 'digi-handboek', naam: 'Digi Handboek', klopNiet: false },
				{ id: 'moza-site', naam: 'MOZa', klopNiet: false },
				{ id: 'oude-site', naam: 'Oude site', klopNiet: true },
				{ id: 'werkplaats', naam: 'Werkplaats', klopNiet: false }
			]
		});
		forge.permissionByLogin.delete('octo');
	});

	it('leaves out a site its admin may not see: on a public repository only the team counts', async () => {
		forge.permissionByLogin.set('octo', 'admin');
		const values = (await team.settings('digi-handboek'))!;
		await team.saveSettings('digi-handboek', { ...values, zichtbaarheid: 'team' }, 'platform');
		expect((await visit('iemand', 'octo')).beheer.sites.map((s) => s.id)).toEqual([
			'moza-site',
			'oude-site',
			'werkplaats'
		]);
		forge.permissionByLogin.delete('octo');
	});

	it('names in Ondertekenen only the sites the user may see', async () => {
		expect((await visit('iemand')).sites).toEqual([
			{ naam: 'Digi Handboek', toegestaan: ['anoniem', 'gekoppeld', 'op-naam'] },
			{ naam: 'MOZa', toegestaan: ['anoniem', 'gekoppeld'] }
		]);
		expect((await visit('platform')).sites.map((s) => s.naam)).toEqual([
			'Digi Handboek',
			'MOZa',
			'Werkplaats'
		]);
	});

	it('lists nothing for anyone else, and shows everyone their own sub', async () => {
		const data = await visit('iemand');
		expect(data.beheer.sites).toEqual([]);
		expect(data.kenmerk).toBe('iemand');
	});
});
