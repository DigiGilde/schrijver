import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SiteSeed, TeamStore } from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { createTeamStore } from '../../src/lib/auth/team-postgres';
import {
	createUsersStore,
	MemoryUsersStore,
	type UserPrefs,
	type UsersStore
} from '../../src/lib/auth/users';

interface Harness {
	team: TeamStore;
	users: UsersStore;
	/** Moves the clock of the store. */
	at(iso: string): void;
	/** Opens enough connections for two transactions to run side by side. */
	warm(): Promise<void>;
}

const START = '2026-10-10T10:00:00.000Z';
const DH = 'digi-handboek';
const MOZA = 'moza-site';

const seed = (siteId: string, redactie: string[] = []): SiteSeed => ({
	siteId,
	values: {
		naam: siteId === DH ? 'Digi Handboek' : 'MijnOverheid Zakelijk',
		omschrijving: null,
		adres: 'https://example.org/',
		mergenVanuitSchrijver: true,
		vierOgen: true,
		identiteitToegestaan: ['anoniem', 'gekoppeld', 'op-naam']
	},
	redactie
});

const login = (sub: string, email: string, emailVerified = true, name = `Naam ${sub}`) => ({
	sub,
	name,
	email,
	emailVerified
});

const prefs = (sub: string, over: Partial<UserPrefs> = {}): UserPrefs => ({
	sub,
	identity: 'op-naam',
	githubLogin: null,
	githubId: null,
	onboarded: true,
	...over
});

const admin = (sub: string) => ({ sub, platformAdmin: false });
const platform = (sub: string) => ({ sub, platformAdmin: true });

function contract(make: () => Promise<Harness>) {
	let h: Harness;
	let team: TeamStore;

	beforeEach(async () => {
		h = await make();
		team = h.team;
		h.at(START);
		await team.seedSite(seed(DH));
		await team.seedSite(seed(MOZA));
	});

	/** A site with these members, each signed in once. */
	async function withTeam(siteId: string, members: [string, 'beheerder' | 'redactie'][]) {
		for (const [sub, role] of members) {
			await team.recordLogin(login(sub, `${sub}@example.org`));
			const added = await team.addByEmail(siteId, `${sub}@example.org`, role, 'opzet');
			expect(added.kind).toBe('added');
		}
	}

	describe('signing in', () => {
		it('saves the name, the verified address lower-cased and the time of login', async () => {
			await team.recordLogin(login('jan', '  Jan@Example.ORG ', true, 'Jan Jansen'));
			expect(await team.profile('jan')).toEqual({
				sub: 'jan',
				name: 'Jan Jansen',
				email: 'jan@example.org',
				lastLoginAt: new Date(START)
			});
		});

		it('stores no address the identity provider did not verify', async () => {
			await team.recordLogin(login('jan', 'jan@example.org'));
			await team.recordLogin(login('jan', 'jan@example.org', false));
			expect((await team.profile('jan'))?.email).toBeNull();
		});

		it('leaves the preferences alone, and the preferences leave the profile alone', async () => {
			await h.users.savePrefs(
				prefs('jan', { identity: 'gekoppeld', githubLogin: 'jj', githubId: 7 })
			);
			await team.recordLogin(login('jan', 'jan@example.org'));
			expect(await h.users.getPrefs('jan')).toEqual(
				prefs('jan', { identity: 'gekoppeld', githubLogin: 'jj', githubId: 7 })
			);
			await h.users.savePrefs(prefs('jan', { identity: 'anoniem' }));
			expect((await team.profile('jan'))?.email).toBe('jan@example.org');
		});

		it('turns an open invitation for the verified address into a membership', async () => {
			const invited = await team.addByEmail(DH, 'Nieuw@Example.org', 'beheerder', 'baas');
			expect(invited.kind).toBe('invited');
			const claimed = await team.recordLogin(login('nieuw', 'nieuw@example.org'));
			expect(claimed).toEqual([{ siteId: DH, role: 'beheerder' }]);
			expect(await team.role(DH, 'nieuw')).toBe('beheerder');
			expect(await team.invitations(DH)).toEqual([]);
			const [entry] = await team.audit(DH);
			expect(entry).toMatchObject({
				actorSub: 'nieuw',
				action: 'invitation.claimed',
				target: invited.kind === 'invited' ? invited.id : '',
				role: 'beheerder'
			});
		});

		it('does not claim with an address that is not verified', async () => {
			await team.addByEmail(DH, 'nieuw@example.org', 'redactie', 'baas');
			expect(await team.recordLogin(login('nieuw', 'nieuw@example.org', false))).toEqual([]);
			expect(await team.role(DH, 'nieuw')).toBeNull();
			expect(await team.invitations(DH)).toHaveLength(1);
		});

		it('does not claim an expired invitation', async () => {
			await team.addByEmail(DH, 'nieuw@example.org', 'redactie', 'baas');
			h.at('2026-11-10T10:00:00.000Z');
			expect(await team.recordLogin(login('nieuw', 'nieuw@example.org'))).toEqual([]);
			expect(await team.role(DH, 'nieuw')).toBeNull();
		});

		it('never lowers a role by a claim, and raises redactie to beheerder', async () => {
			await withTeam(DH, [['jan', 'beheerder']]);
			await withTeam(MOZA, [['jan', 'redactie']]);
			await team.recordLogin(login('jan', 'jan-nieuw@example.org'));
			await team.addByEmail(DH, 'jan-oud@example.org', 'redactie', 'baas');
			await team.addByEmail(MOZA, 'jan-oud@example.org', 'beheerder', 'baas');
			await team.recordLogin(login('jan', 'jan-oud@example.org'));
			expect(await team.role(DH, 'jan')).toBe('beheerder');
			expect(await team.role(MOZA, 'jan')).toBe('beheerder');
		});
	});

	describe('adding by e-mail address', () => {
		it('adds the one known user with that verified address at once', async () => {
			await team.recordLogin(login('collega', 'collega@example.org', true, 'Tweede Collega'));
			h.at('2026-10-11T09:00:00.000Z');
			expect(await team.addByEmail(DH, ' Collega@Example.org ', 'redactie', 'baas')).toEqual({
				kind: 'added',
				sub: 'collega',
				name: 'Tweede Collega'
			});
			expect(await team.members(DH)).toEqual([
				{
					sub: 'collega',
					role: 'redactie',
					addedBy: 'baas',
					addedAt: new Date('2026-10-11T09:00:00.000Z'),
					name: 'Tweede Collega',
					email: 'collega@example.org'
				}
			]);
			expect(await team.invitations(DH)).toEqual([]);
			expect((await team.audit(DH))[0]).toMatchObject({
				actorSub: 'baas',
				action: 'member.added',
				target: 'collega',
				role: 'redactie'
			});
		});

		it('invites an address no known user has, for thirty days', async () => {
			const result = await team.addByEmail(DH, 'Nieuw@Example.org', 'redactie', 'baas');
			expect(result).toMatchObject({
				kind: 'invited',
				renewed: false,
				expiresAt: new Date('2026-11-09T10:00:00.000Z')
			});
			const [invitation] = await team.invitations(DH);
			expect(invitation).toMatchObject({
				siteId: DH,
				email: 'nieuw@example.org',
				role: 'redactie',
				invitedBy: 'baas',
				createdAt: new Date(START),
				expiresAt: new Date('2026-11-09T10:00:00.000Z')
			});
			expect((await team.audit(DH))[0]).toMatchObject({
				action: 'invitation.created',
				target: invitation.id,
				role: 'redactie'
			});
			expect(await team.members(DH)).toEqual([]);
		});

		it('invites when two known users share the address', async () => {
			await team.recordLogin(login('een', 'gedeeld@example.org'));
			await team.recordLogin(login('twee', 'gedeeld@example.org'));
			expect((await team.addByEmail(DH, 'gedeeld@example.org', 'redactie', 'baas')).kind).toBe(
				'invited'
			);
			expect(await team.members(DH)).toEqual([]);
		});

		it('invites the address of someone whose address was not verified', async () => {
			await team.recordLogin(login('jan', 'jan@example.org', false));
			expect((await team.addByEmail(DH, 'jan@example.org', 'redactie', 'baas')).kind).toBe(
				'invited'
			);
		});

		it('renews an invitation with the new role and a new expiry', async () => {
			const first = await team.addByEmail(DH, 'nieuw@example.org', 'redactie', 'baas');
			h.at('2026-10-20T10:00:00.000Z');
			const again = await team.addByEmail(DH, 'nieuw@example.org', 'beheerder', 'ander');
			expect(again).toMatchObject({
				kind: 'invited',
				renewed: true,
				expiresAt: new Date('2026-11-19T10:00:00.000Z')
			});
			const invitations = await team.invitations(DH);
			expect(invitations).toHaveLength(1);
			expect(invitations[0]).toMatchObject({
				id: first.kind === 'invited' ? first.id : '',
				role: 'beheerder',
				invitedBy: 'ander'
			});
			expect((await team.audit(DH))[0].action).toBe('invitation.renewed');
		});

		it('leaves a member as is', async () => {
			await withTeam(DH, [['jan', 'beheerder']]);
			const before = (await team.audit(DH)).length;
			expect(await team.addByEmail(DH, 'jan@example.org', 'redactie', 'baas')).toEqual({
				kind: 'already-member',
				sub: 'jan',
				name: 'Naam jan',
				role: 'beheerder'
			});
			expect(await team.role(DH, 'jan')).toBe('beheerder');
			expect(await team.audit(DH)).toHaveLength(before);
		});

		it('refuses a site that has no settings', async () => {
			await expect(
				team.addByEmail('onbekend', 'x@example.org', 'redactie', 'baas')
			).rejects.toThrow();
		});
	});

	describe('the last site admin', () => {
		it('changes a role and writes it down', async () => {
			await withTeam(DH, [
				['baas', 'beheerder'],
				['jan', 'redactie']
			]);
			expect(await team.changeRole(DH, 'jan', 'beheerder', admin('baas'))).toEqual({
				ok: true,
				sub: 'jan',
				name: 'Naam jan',
				previous: 'redactie'
			});
			expect(await team.role(DH, 'jan')).toBe('beheerder');
			expect((await team.audit(DH))[0]).toMatchObject({
				actorSub: 'baas',
				action: 'member.role_changed',
				target: 'jan',
				role: 'beheerder'
			});
		});

		it('refuses to make the last beheerder redactie', async () => {
			await withTeam(DH, [
				['baas', 'beheerder'],
				['jan', 'redactie']
			]);
			const before = (await team.audit(DH)).length;
			expect(await team.changeRole(DH, 'baas', 'redactie', admin('baas'))).toEqual({
				ok: false,
				reason: 'last-admin',
				name: 'Naam baas'
			});
			expect(await team.role(DH, 'baas')).toBe('beheerder');
			expect(await team.audit(DH)).toHaveLength(before);
		});

		it('lets a platform admin make the last beheerder redactie', async () => {
			await withTeam(DH, [['baas', 'beheerder']]);
			expect((await team.changeRole(DH, 'baas', 'redactie', platform('schrijver'))).ok).toBe(true);
			expect(await team.role(DH, 'baas')).toBe('redactie');
		});

		it('lets a beheerder step down while another one stays', async () => {
			await withTeam(DH, [
				['baas', 'beheerder'],
				['tweede', 'beheerder']
			]);
			expect((await team.changeRole(DH, 'baas', 'redactie', admin('baas'))).ok).toBe(true);
		});

		it('refuses to remove the last beheerder, unless a platform admin does it', async () => {
			await withTeam(DH, [
				['baas', 'beheerder'],
				['jan', 'redactie']
			]);
			expect(await team.removeMember(DH, 'baas', admin('baas'))).toMatchObject({
				ok: false,
				reason: 'last-admin'
			});
			expect(await team.removeMember(DH, 'jan', admin('baas'))).toMatchObject({
				ok: true,
				previous: 'redactie'
			});
			expect((await team.audit(DH))[0]).toMatchObject({
				actorSub: 'baas',
				action: 'member.removed',
				target: 'jan',
				role: 'redactie'
			});
			expect((await team.removeMember(DH, 'baas', platform('schrijver'))).ok).toBe(true);
			expect(await team.members(DH)).toEqual([]);
		});

		it('lets only one of two parallel removals of the last two beheerders pass', async () => {
			await withTeam(DH, [
				['een', 'beheerder'],
				['twee', 'beheerder']
			]);
			await h.warm();
			const results = await Promise.all([
				team.removeMember(DH, 'een', admin('een')),
				team.removeMember(DH, 'twee', admin('twee'))
			]);
			expect(results.filter((r) => r.ok)).toHaveLength(1);
			expect(results.filter((r) => !r.ok && r.reason === 'last-admin')).toHaveLength(1);
			expect((await team.members(DH)).filter((m) => m.role === 'beheerder')).toHaveLength(1);
		});

		it('answers not-a-member for someone outside the team', async () => {
			await withTeam(DH, [['baas', 'beheerder']]);
			expect(await team.changeRole(DH, 'vreemd', 'redactie', admin('baas'))).toMatchObject({
				ok: false,
				reason: 'not-a-member'
			});
			expect(await team.removeMember(MOZA, 'baas', admin('baas'))).toMatchObject({
				ok: false,
				reason: 'not-a-member'
			});
		});
	});

	describe('members and invitations', () => {
		it('lists beheerders first, then by name', async () => {
			await team.recordLogin(login('b', 'b@example.org', true, 'Bram'));
			await team.recordLogin(login('a', 'a@example.org', true, 'Anna'));
			await team.recordLogin(login('c', 'c@example.org', true, 'Cor'));
			await team.addByEmail(DH, 'b@example.org', 'redactie', 'x');
			await team.addByEmail(DH, 'c@example.org', 'beheerder', 'x');
			await team.addByEmail(DH, 'a@example.org', 'redactie', 'x');
			expect((await team.members(DH)).map((m) => m.name)).toEqual(['Cor', 'Anna', 'Bram']);
		});

		it('answers the role on a site and the sites of a user', async () => {
			await withTeam(DH, [['jan', 'beheerder']]);
			await withTeam(MOZA, [['jan', 'redactie']]);
			expect(await team.role(DH, 'jan')).toBe('beheerder');
			expect(await team.role(DH, 'piet')).toBeNull();
			expect((await team.sitesOf('jan')).sort((a, b) => a.siteId.localeCompare(b.siteId))).toEqual([
				{ siteId: DH, role: 'beheerder' },
				{ siteId: MOZA, role: 'redactie' }
			]);
		});

		it('lists only invitations that have not expired', async () => {
			await team.addByEmail(DH, 'oud@example.org', 'redactie', 'baas');
			h.at('2026-10-25T10:00:00.000Z');
			await team.addByEmail(DH, 'nieuw@example.org', 'redactie', 'baas');
			h.at('2026-11-12T10:00:00.000Z');
			expect((await team.invitations(DH)).map((i) => i.email)).toEqual(['nieuw@example.org']);
		});

		it('revokes an invitation of the same site only, and writes it down', async () => {
			const invited = await team.addByEmail(DH, 'nieuw@example.org', 'redactie', 'baas');
			const id = invited.kind === 'invited' ? invited.id : '';
			expect(await team.revokeInvitation(MOZA, id, 'baas')).toBeNull();
			expect(await team.revokeInvitation(DH, 'geen-uuid', 'baas')).toBeNull();
			expect(await team.revokeInvitation(DH, id, 'baas')).toMatchObject({ id, role: 'redactie' });
			expect(await team.invitations(DH)).toEqual([]);
			expect((await team.audit(DH))[0]).toMatchObject({
				actorSub: 'baas',
				action: 'invitation.revoked',
				target: id
			});
		});
	});

	describe('site settings', () => {
		it('starts a site from its configuration, with invitations for its redactie', async () => {
			expect(
				await team.seedSite(
					seed('nieuwe-site', [
						'Een@Example.org',
						'een@example.org',
						'geen adres',
						'twee@example.org'
					])
				)
			).toBe(true);
			expect(await team.settings('nieuwe-site')).toEqual({
				siteId: 'nieuwe-site',
				...seed('nieuwe-site').values,
				updatedAt: new Date(START),
				updatedBy: null
			});
			const invitations = await team.invitations('nieuwe-site');
			expect(invitations.map((i) => [i.email, i.role, i.invitedBy]).sort()).toEqual([
				['een@example.org', 'redactie', null],
				['twee@example.org', 'redactie', null]
			]);
			expect((await team.audit('nieuwe-site')).map((a) => a.action).sort()).toEqual([
				'invitation.created',
				'invitation.created',
				'settings.seeded'
			]);
		});

		it('never overwrites settings or invites again once a site exists', async () => {
			await team.saveSettings(DH, { ...seed(DH).values, naam: 'Handboek' }, 'baas');
			expect(await team.seedSite(seed(DH, ['nieuw@example.org']))).toBe(false);
			expect((await team.settings(DH))?.naam).toBe('Handboek');
			expect(await team.invitations(DH)).toEqual([]);
		});

		it('saves settings and writes down which ones changed', async () => {
			h.at('2026-10-12T08:00:00.000Z');
			const changed = await team.saveSettings(
				DH,
				{
					...seed(DH).values,
					naam: 'Handboek',
					vierOgen: false,
					identiteitToegestaan: ['op-naam']
				},
				'baas'
			);
			expect(changed).toEqual(['naam', 'vier_ogen', 'identiteit_toegestaan']);
			expect(await team.settings(DH)).toMatchObject({
				naam: 'Handboek',
				vierOgen: false,
				identiteitToegestaan: ['anoniem', 'op-naam'],
				updatedAt: new Date('2026-10-12T08:00:00.000Z'),
				updatedBy: 'baas'
			});
			expect((await team.audit(DH))[0]).toMatchObject({
				actorSub: 'baas',
				action: 'settings.changed',
				target: 'naam,vier_ogen,identiteit_toegestaan',
				role: null
			});
			const before = (await team.audit(DH)).length;
			expect(await team.saveSettings(DH, (await team.settings(DH))!, 'baas')).toEqual([]);
			expect(await team.audit(DH)).toHaveLength(before);
		});
	});

	describe('who writes in a proposal', () => {
		it('records each writer once, keeps the first time, and lists the first first', async () => {
			await team.recordLogin(login('jan', 'jan@example.org'));
			await team.recordLogin(login('piet', 'piet@example.org'));
			await team.recordWriter(DH, 7, 'jan');
			h.at('2026-10-10T11:00:00.000Z');
			await team.recordWriter(DH, 7, 'piet');
			h.at('2026-10-10T12:00:00.000Z');
			await team.recordWriter(DH, 7, 'jan');
			expect(await team.writers(DH, 7)).toEqual(['jan', 'piet']);
		});

		it('keeps proposals and sites apart, and knows nobody for a proposal without', async () => {
			await team.recordLogin(login('jan', 'jan@example.org'));
			await team.recordLogin(login('piet', 'piet@example.org'));
			await team.recordWriter(DH, 7, 'jan');
			await team.recordWriter(MOZA, 7, 'piet');
			await team.recordWriter(DH, 8, 'piet');
			expect(await team.writers(DH, 7)).toEqual(['jan']);
			expect(await team.writers(MOZA, 7)).toEqual(['piet']);
			expect(await team.writers(DH, 8)).toEqual(['piet']);
			expect(await team.writers(DH, 9)).toEqual([]);
		});

		it('records nobody for a site or a user it does not know', async () => {
			await team.recordLogin(login('jan', 'jan@example.org'));
			await expect(team.recordWriter('onbekend', 1, 'jan')).rejects.toThrow();
			await expect(team.recordWriter(DH, 1, 'niemand')).rejects.toThrow();
			expect(await team.writers(DH, 1)).toEqual([]);
		});

		it('forgets what a forgotten user wrote, and keeps the others', async () => {
			h.at('2025-09-01T10:00:00.000Z');
			await team.recordLogin(login('weg', 'weg@example.org'));
			await team.recordWriter(DH, 3, 'weg');
			h.at('2026-10-01T10:00:00.000Z');
			await team.recordLogin(login('blijft', 'blijft@example.org'));
			await team.recordWriter(DH, 3, 'blijft');
			h.at(START);
			expect((await team.retention()).users).toBe(1);
			expect(await team.writers(DH, 3)).toEqual(['blijft']);
		});
	});

	describe('retention', () => {
		it('deletes expired invitations and writes that down', async () => {
			const invited = await team.addByEmail(DH, 'nieuw@example.org', 'redactie', 'baas');
			h.at('2026-11-09T10:00:00.000Z');
			expect((await team.retention()).invitations).toBe(1);
			expect(await team.invitations(DH)).toEqual([]);
			expect((await team.audit(DH))[0]).toMatchObject({
				actorSub: null,
				action: 'invitation.expired',
				target: invited.kind === 'invited' ? invited.id : ''
			});
		});

		it('forgets users not seen for twelve months who are on no team', async () => {
			h.at('2025-09-01T10:00:00.000Z');
			await team.recordLogin(login('weg', 'weg@example.org'));
			await h.users.savePrefs(prefs('weg'));
			await withTeam(DH, [['lid', 'redactie']]);
			await h.users.savePrefs(prefs('lid'));
			h.at('2025-10-20T10:00:00.000Z');
			await team.recordLogin(login('recent', 'recent@example.org'));
			await h.users.savePrefs(prefs('recent'));
			h.at(START);

			expect((await team.retention()).users).toBe(1);
			expect(await team.profile('weg')).toBeNull();
			expect((await h.users.getPrefs('weg')).onboarded).toBe(false);
			expect((await team.profile('lid'))?.email).toBe('lid@example.org');
			expect((await h.users.getPrefs('lid')).onboarded).toBe(true);
			expect((await team.profile('recent'))?.email).toBe('recent@example.org');
		});

		it('deletes audit rows older than two years', async () => {
			h.at('2024-10-01T10:00:00.000Z');
			await team.addByEmail(DH, 'oud@example.org', 'redactie', 'baas');
			h.at('2024-10-20T10:00:00.000Z');
			await team.addByEmail(MOZA, 'minder-oud@example.org', 'redactie', 'baas');
			h.at(START);
			const result = await team.retention();
			expect(result.audit).toBe(1);
			const actions = (await team.audit()).map((a) => [a.siteId, a.action]);
			expect(actions).not.toContainEqual([DH, 'invitation.created']);
			expect(actions).toContainEqual([MOZA, 'invitation.created']);
		});
	});

	it('never writes an e-mail address in the audit log', async () => {
		await team.recordLogin(login('jan', 'jan@example.org'));
		await team.addByEmail(DH, 'jan@example.org', 'beheerder', 'baas');
		await team.addByEmail(DH, 'nieuw@example.org', 'redactie', 'jan');
		await team.recordLogin(login('nieuw', 'nieuw@example.org'));
		await team.seedSite(seed('derde', ['derde@example.org']));
		const text = JSON.stringify(await team.audit());
		expect(text).not.toContain('@');
	});
}

describe('MemoryTeamStore', () => {
	contract(async () => {
		let now = new Date(START);
		const users = new MemoryUsersStore();
		return {
			team: new MemoryTeamStore({ users, clock: () => now }),
			users,
			at: (iso) => (now = new Date(iso)),
			warm: async () => {}
		};
	});
});

const url = process.env.DATABASE_SERVER_FULL;

describe.skipIf(!url)('Postgres team store', () => {
	// A schema of its own, so the test never touches the tables of a real database.
	const schema = `schrijver_test_${randomBytes(4).toString('hex')}`;
	let sql: postgres.Sql;
	const ddl = readFileSync('db/schema.sql', 'utf8');

	beforeAll(async () => {
		const setup = postgres(url!, { onnotice: () => {} });
		await setup.unsafe(`create schema ${schema}`);
		await setup.end();
		sql = postgres(url!, { connection: { search_path: schema }, onnotice: () => {} });
		await sql.unsafe(ddl);
		// Twice: the schema has to apply over itself at every start.
		await sql.unsafe(ddl);
	});

	afterAll(async () => {
		await sql?.unsafe(`drop schema ${schema} cascade`);
		await sql?.end();
	});

	describe('rules', () => {
		contract(async () => {
			await sql`truncate audit_log, invitations, proposal_writers, site_members, site_settings, user_prefs`;
			let now = new Date(START);
			return {
				team: createTeamStore(sql, () => now),
				users: createUsersStore(sql),
				at: (iso) => (now = new Date(iso)),
				warm: async () => {
					await Promise.all([sql`select pg_sleep(0.05)`, sql`select pg_sleep(0.05)`]);
				}
			};
		});
	});

	it('judges a user who has not signed in since the profile columns came by the last change', async () => {
		await sql`truncate audit_log, invitations, proposal_writers, site_members, site_settings, user_prefs`;
		const team = createTeamStore(sql, () => new Date(START));
		await sql`insert into user_prefs (sub, onboarded, updated_at) values ('oud', true, ${new Date('2025-01-01T00:00:00Z')})`;
		await sql`insert into user_prefs (sub, onboarded, updated_at) values ('bijgewerkt', true, ${new Date('2026-09-01T00:00:00Z')})`;
		expect((await team.retention()).users).toBe(1);
		const left = await sql<{ sub: string }[]>`select sub from user_prefs order by sub`;
		expect(left.map((r) => r.sub)).toEqual(['bijgewerkt']);
	});
});
