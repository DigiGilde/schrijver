import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { seedSites, useTeamStore } from '../../src/lib/auth/team-store';
import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { getConfigStore, setConfigStore } from '../../src/lib/server/services';
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

const visit = async (sub: string) =>
	(await load({
		url: new URL('http://x/instellingen'),
		locals: {
			user: {
				session: session(sub),
				prefs: { sub, identity: 'anoniem', githubLogin: null, githubId: null, onboarded: true }
			}
		}
	} as never)) as {
		beheer: { platform: boolean; sites: { id: string; naam: string }[] };
		kenmerk: string;
	};

beforeAll(async () => {
	process.env.SCHRIJVER_BEHEERDERS = 'platform';
	setConfigStore((await buildFakeServices()).store);
});
afterAll(() => {
	delete process.env.SCHRIJVER_BEHEERDERS;
	useTeamStore(undefined);
});

beforeEach(async () => {
	const team = new MemoryTeamStore();
	useTeamStore(team);
	await seedSites(getConfigStore().sites(), team);
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
	it('lists every configured site for a platform admin', async () => {
		expect((await visit('platform')).beheer).toEqual({
			platform: true,
			sites: [
				{ id: 'digi-handboek', naam: 'Digi Handboek' },
				{ id: 'moza-site', naam: 'MOZa' }
			]
		});
	});

	it('lists the sites a beheerder manages, and not those where they are redactie', async () => {
		expect((await visit('baas')).beheer).toEqual({
			platform: false,
			sites: [{ id: 'moza-site', naam: 'MOZa' }]
		});
	});

	it('lists nothing for anyone else, and shows everyone their own sub', async () => {
		const data = await visit('iemand');
		expect(data.beheer.sites).toEqual([]);
		expect(data.kenmerk).toBe('iemand');
	});
});
