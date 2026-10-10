import { randomUUID } from 'node:crypto';
import {
	allowedKinds,
	auditBefore,
	changedSettings,
	forgetBefore,
	invitationExpiry,
	movedColumns,
	normaliseEmail,
	sortMembers,
	type Actor,
	type AddResult,
	type AddSiteResult,
	type AuditEntry,
	type FirstAdmin,
	type Invitation,
	type LoginProfile,
	type Member,
	type NewSite,
	type Profile,
	type RegisteredSite,
	type Role,
	type SettingsValues,
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
	private registry = new Map<string, RegisteredSite>();
	private siteSettings = new Map<string, SiteSettings>();
	private memberRows = new Map<string, Map<string, MemberRow>>();
	private invitationRows: Invitation[] = [];
	private auditRows: AuditEntry[] = [];
	private writerRows: { siteId: string; number: number; sub: string; firstAt: Date }[] = [];
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

	async sites() {
		return [...this.registry.values()]
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
			.map((site) => ({ ...site }));
	}

	async addSite(
		site: NewSite,
		values: SettingsValues,
		admin: FirstAdmin | null,
		actor: string | null
	): Promise<AddSiteResult> {
		if (this.registry.has(site.id)) return { ok: false, reason: 'id-taken' };
		if ([...this.registry.values()].some((s) => s.repoId === site.repoId)) {
			return { ok: false, reason: 'repo-taken' };
		}
		if (admin && 'sub' in admin && !this.profiles.has(admin.sub)) throw new Error('unknown user');
		const now = this.clock();
		this.registry.set(site.id, { ...site, createdAt: now, createdBy: actor });
		this.siteSettings.set(site.id, {
			...values,
			identiteitToegestaan: allowedKinds(values.identiteitToegestaan),
			siteId: site.id,
			updatedAt: now,
			updatedBy: actor
		});
		this.write(
			{ actorSub: actor, siteId: site.id, action: 'site.added', target: site.repo, role: null },
			now
		);
		if (!admin) return { ok: true, admin: null };
		if ('email' in admin) {
			return { ok: true, admin: this.addAddress(site.id, admin.email, 'beheerder', actor, now) };
		}
		this.team(site.id).set(admin.sub, {
			sub: admin.sub,
			role: 'beheerder',
			addedBy: actor,
			addedAt: now
		});
		this.write(
			{
				actorSub: actor,
				siteId: site.id,
				action: 'member.added',
				target: admin.sub,
				role: 'beheerder'
			},
			now
		);
		const name = this.profiles.get(admin.sub)?.name ?? null;
		return { ok: true, admin: { kind: 'added', sub: admin.sub, name } };
	}

	async removeSite(siteId: string, actor: string) {
		const site = this.registry.get(siteId);
		if (!site) return null;
		this.registry.delete(siteId);
		this.siteSettings.delete(siteId);
		this.memberRows.delete(siteId);
		this.invitationRows = this.invitationRows.filter((i) => i.siteId !== siteId);
		this.writerRows = this.writerRows.filter((w) => w.siteId !== siteId);
		this.write(
			{ actorSub: actor, siteId, action: 'site.removed', target: site.repo, role: null },
			this.clock()
		);
		return { ...site };
	}

	async moveSite(siteId: string, repo: string, standaardbranch: string) {
		const site = this.registry.get(siteId);
		if (!site) return [];
		const changed = movedColumns(site, { repo, standaardbranch });
		if (changed.length === 0) return [];
		Object.assign(site, { repo, standaardbranch });
		this.write(
			{
				actorSub: null,
				siteId,
				action: 'site.moved',
				target: changed.join(','),
				role: null
			},
			this.clock()
		);
		return changed;
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
		return this.addAddress(siteId, address, role, actor, this.clock());
	}

	private addAddress(
		siteId: string,
		address: string,
		role: Role,
		actor: string | null,
		now: Date
	): AddResult {
		const team = this.team(siteId);
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

	async recordWriter(siteId: string, number: number, sub: string) {
		if (!this.siteSettings.has(siteId)) throw new Error(`unknown site ${siteId}`);
		if (!this.profiles.has(sub)) throw new Error('unknown user');
		const known = this.writerRows.some(
			(w) => w.siteId === siteId && w.number === number && w.sub === sub
		);
		if (!known) this.writerRows.push({ siteId, number, sub, firstAt: this.clock() });
	}

	async writers(siteId: string, number: number) {
		return this.writerRows
			.filter((w) => w.siteId === siteId && w.number === number)
			.sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime())
			.map((w) => w.sub);
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
		const gone = new Set(forgotten.map((p) => p.sub));
		this.writerRows = this.writerRows.filter((w) => !gone.has(w.sub));

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
