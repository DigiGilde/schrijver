import { randomUUID } from 'node:crypto';
import {
	allowedKinds,
	auditBefore,
	changedSettings,
	forgetBefore,
	invitationExpiry,
	normaliseEmail,
	seedAddresses,
	sortMembers,
	type Actor,
	type AddResult,
	type AuditEntry,
	type Invitation,
	type LoginProfile,
	type Member,
	type Profile,
	type Role,
	type SettingsValues,
	type SiteSeed,
	type SiteSettings,
	type TeamChange,
	type TeamStore
} from './team';

type MemberRow = Omit<Member, 'name' | 'email'>;

/**
 * The team store for the local preview and the tests. Every method does its work before its first
 * await, so calls cannot interleave, as a transaction would guarantee in Postgres.
 */
export class MemoryTeamStore implements TeamStore {
	private profiles = new Map<string, Profile>();
	private siteSettings = new Map<string, SiteSettings>();
	private memberRows = new Map<string, Map<string, MemberRow>>();
	private invitationRows: Invitation[] = [];
	private auditRows: AuditEntry[] = [];
	private clock: () => Date;
	private users?: { forget(sub: string): void };

	constructor(options: { users?: { forget(sub: string): void }; clock?: () => Date } = {}) {
		this.clock = options.clock ?? (() => new Date());
		this.users = options.users;
	}

	private write(entry: Omit<AuditEntry, 'at'>, at: Date) {
		this.auditRows.push({ ...entry, at });
	}

	private team(siteId: string): Map<string, MemberRow> {
		if (!this.siteSettings.has(siteId)) throw new Error(`unknown site ${siteId}`);
		let rows = this.memberRows.get(siteId);
		if (!rows) this.memberRows.set(siteId, (rows = new Map()));
		return rows;
	}

	private withProfile(row: MemberRow): Member {
		const p = this.profiles.get(row.sub);
		return { ...row, name: p?.name ?? null, email: p?.email ?? null };
	}

	async recordLogin(login: LoginProfile) {
		const now = this.clock();
		const email = login.emailVerified && login.email ? normaliseEmail(login.email) : null;
		this.profiles.set(login.sub, {
			sub: login.sub,
			name: login.name || null,
			email,
			lastLoginAt: now
		});
		if (!email) return [];
		const open = this.invitationRows.filter((i) => i.email === email && i.expiresAt > now);
		this.invitationRows = this.invitationRows.filter((i) => !open.includes(i));
		return open.map((invitation) => {
			const team = this.team(invitation.siteId);
			const existing = team.get(login.sub);
			if (!existing) {
				team.set(login.sub, {
					sub: login.sub,
					role: invitation.role,
					addedBy: invitation.invitedBy,
					addedAt: now
				});
			} else if (invitation.role === 'beheerder') {
				existing.role = 'beheerder';
			}
			this.write(
				{
					actorSub: login.sub,
					siteId: invitation.siteId,
					action: 'invitation.claimed',
					target: invitation.id,
					role: invitation.role
				},
				now
			);
			return { siteId: invitation.siteId, role: invitation.role };
		});
	}

	async profile(sub: string) {
		const p = this.profiles.get(sub);
		return p ? { ...p } : null;
	}

	async settings(siteId: string) {
		const s = this.siteSettings.get(siteId);
		return s ? { ...s, identiteitToegestaan: [...s.identiteitToegestaan] } : null;
	}

	async seedSite(seed: SiteSeed) {
		if (this.siteSettings.has(seed.siteId)) return false;
		const now = this.clock();
		this.siteSettings.set(seed.siteId, {
			...seed.values,
			identiteitToegestaan: allowedKinds(seed.values.identiteitToegestaan),
			siteId: seed.siteId,
			updatedAt: now,
			updatedBy: null
		});
		this.write(
			{ actorSub: null, siteId: seed.siteId, action: 'settings.seeded', target: null, role: null },
			now
		);
		for (const email of seedAddresses(seed.redactie)) {
			const id = randomUUID();
			this.invitationRows.push({
				id,
				siteId: seed.siteId,
				email,
				role: 'redactie',
				invitedBy: null,
				createdAt: now,
				expiresAt: invitationExpiry(now)
			});
			this.write(
				{
					actorSub: null,
					siteId: seed.siteId,
					action: 'invitation.created',
					target: id,
					role: 'redactie'
				},
				now
			);
		}
		return true;
	}

	async saveSettings(siteId: string, values: SettingsValues, actor: string) {
		const current = this.siteSettings.get(siteId);
		if (!current) throw new Error(`unknown site ${siteId}`);
		const next: SettingsValues = {
			naam: values.naam,
			omschrijving: values.omschrijving,
			adres: values.adres,
			mergenVanuitSchrijver: values.mergenVanuitSchrijver,
			vierOgen: values.vierOgen,
			identiteitToegestaan: allowedKinds(values.identiteitToegestaan)
		};
		const changed = changedSettings(current, next);
		if (changed.length === 0) return [];
		const now = this.clock();
		this.siteSettings.set(siteId, { ...next, siteId, updatedAt: now, updatedBy: actor });
		this.write(
			{
				actorSub: actor,
				siteId,
				action: 'settings.changed',
				target: changed.join(','),
				role: null
			},
			now
		);
		return changed;
	}

	async members(siteId: string) {
		const rows = this.memberRows.get(siteId);
		return sortMembers([...(rows?.values() ?? [])].map((r) => this.withProfile(r)));
	}

	async role(siteId: string, sub: string) {
		return this.memberRows.get(siteId)?.get(sub)?.role ?? null;
	}

	async sitesOf(sub: string) {
		return [...this.memberRows].flatMap(([siteId, rows]) => {
			const row = rows.get(sub);
			return row ? [{ siteId, role: row.role }] : [];
		});
	}

	async addByEmail(siteId: string, address: string, role: Role, actor: string): Promise<AddResult> {
		const team = this.team(siteId);
		const now = this.clock();
		const email = normaliseEmail(address);
		const known = [...this.profiles.values()].filter((p) => p.email === email);
		if (known.length === 1) {
			const [person] = known;
			const existing = team.get(person.sub);
			if (existing) {
				return { kind: 'already-member', sub: person.sub, name: person.name, role: existing.role };
			}
			team.set(person.sub, { sub: person.sub, role, addedBy: actor, addedAt: now });
			this.invitationRows = this.invitationRows.filter(
				(i) => !(i.siteId === siteId && i.email === email)
			);
			this.write(
				{ actorSub: actor, siteId, action: 'member.added', target: person.sub, role },
				now
			);
			return { kind: 'added', sub: person.sub, name: person.name };
		}
		const expiresAt = invitationExpiry(now);
		const existing = this.invitationRows.find((i) => i.siteId === siteId && i.email === email);
		const invitation: Invitation = {
			id: existing?.id ?? randomUUID(),
			siteId,
			email,
			role,
			invitedBy: actor,
			createdAt: now,
			expiresAt
		};
		this.invitationRows = [...this.invitationRows.filter((i) => i !== existing), invitation];
		this.write(
			{
				actorSub: actor,
				siteId,
				action: existing ? 'invitation.renewed' : 'invitation.created',
				target: invitation.id,
				role
			},
			now
		);
		return { kind: 'invited', id: invitation.id, renewed: !!existing, expiresAt };
	}

	/** The last-admin guard: whether this change leaves the site without a beheerder. */
	private leavesNoAdmin(team: Map<string, MemberRow>, sub: string, nextRole: Role | null) {
		const admins = [...team.values()].filter((r) => r.role === 'beheerder');
		return team.get(sub)?.role === 'beheerder' && nextRole !== 'beheerder' && admins.length === 1;
	}

	async changeRole(siteId: string, sub: string, role: Role, actor: Actor): Promise<TeamChange> {
		const team = this.memberRows.get(siteId);
		const row = team?.get(sub);
		const name = this.profiles.get(sub)?.name ?? null;
		if (!team || !row) return { ok: false, reason: 'not-a-member', name };
		const previous = row.role;
		if (previous === role) return { ok: true, sub, name, previous };
		if (!actor.platformAdmin && this.leavesNoAdmin(team, sub, role)) {
			return { ok: false, reason: 'last-admin', name };
		}
		row.role = role;
		this.write(
			{ actorSub: actor.sub, siteId, action: 'member.role_changed', target: sub, role },
			this.clock()
		);
		return { ok: true, sub, name, previous };
	}

	async removeMember(siteId: string, sub: string, actor: Actor): Promise<TeamChange> {
		const team = this.memberRows.get(siteId);
		const row = team?.get(sub);
		const name = this.profiles.get(sub)?.name ?? null;
		if (!team || !row) return { ok: false, reason: 'not-a-member', name };
		if (!actor.platformAdmin && this.leavesNoAdmin(team, sub, null)) {
			return { ok: false, reason: 'last-admin', name };
		}
		team.delete(sub);
		this.write(
			{ actorSub: actor.sub, siteId, action: 'member.removed', target: sub, role: row.role },
			this.clock()
		);
		return { ok: true, sub, name, previous: row.role };
	}

	async invitations(siteId: string) {
		const now = this.clock();
		return this.invitationRows
			.filter((i) => i.siteId === siteId && i.expiresAt > now)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
			.map((i) => ({ ...i }));
	}

	async revokeInvitation(siteId: string, id: string, actor: string) {
		const invitation = this.invitationRows.find((i) => i.siteId === siteId && i.id === id);
		if (!invitation) return null;
		this.invitationRows = this.invitationRows.filter((i) => i !== invitation);
		this.write(
			{
				actorSub: actor,
				siteId,
				action: 'invitation.revoked',
				target: id,
				role: invitation.role
			},
			this.clock()
		);
		return { ...invitation };
	}

	async audit(siteId?: string) {
		return this.auditRows
			.map((entry, order) => ({ entry, order }))
			.filter(({ entry }) => siteId === undefined || entry.siteId === siteId)
			.sort((a, b) => b.entry.at.getTime() - a.entry.at.getTime() || b.order - a.order)
			.map(({ entry }) => ({ ...entry }));
	}

	async retention() {
		const now = this.clock();
		const expired = this.invitationRows.filter((i) => i.expiresAt <= now);
		this.invitationRows = this.invitationRows.filter((i) => !expired.includes(i));
		for (const i of expired) {
			this.write(
				{
					actorSub: null,
					siteId: i.siteId,
					action: 'invitation.expired',
					target: i.id,
					role: i.role
				},
				now
			);
		}

		const cutoff = forgetBefore(now);
		const onATeam = new Set([...this.memberRows.values()].flatMap((rows) => [...rows.keys()]));
		const forgotten = [...this.profiles.values()].filter(
			(p) => p.lastLoginAt !== null && p.lastLoginAt < cutoff && !onATeam.has(p.sub)
		);
		for (const p of forgotten) {
			this.profiles.delete(p.sub);
			this.users?.forget(p.sub);
		}

		const auditCutoff = auditBefore(now);
		const before = this.auditRows.length;
		this.auditRows = this.auditRows.filter((a) => a.at >= auditCutoff);

		return {
			invitations: expired.length,
			users: forgotten.length,
			audit: before - this.auditRows.length
		};
	}
}
