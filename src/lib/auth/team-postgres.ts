import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import {
	allowedKinds,
	auditBefore,
	changedSettings,
	forgetBefore,
	invitationExpiry,
	isUuid,
	movedColumns,
	normaliseEmail,
	sortMembers,
	writersBefore,
	type Actor,
	type AddResult,
	type AddSiteResult,
	type AuditAction,
	type AuditEntry,
	type IdentityKind,
	type Invitation,
	type RegisteredSite,
	type Role,
	type SettingsValues,
	type SiteSettings,
	type TeamChange,
	type TeamStore
} from './team';

type Db = postgres.Sql | postgres.TransactionSql;

interface SiteRow {
	id: string;
	/** A bigint, which the driver gives as text. */
	repo_id: string;
	repo: string;
	standaardbranch: string;
	created_at: Date;
	created_by: string | null;
}

interface SettingsRow {
	site_id: string;
	naam: string;
	omschrijving: string | null;
	adres: string | null;
	mergen_vanuit_schrijver: boolean;
	vier_ogen: boolean;
	identiteit_toegestaan: string[];
	updated_at: Date;
	updated_by: string | null;
}

interface InvitationRow {
	id: string;
	site_id: string;
	email: string;
	role: Role;
	invited_by: string | null;
	created_at: Date;
	expires_at: Date;
}

interface AuditRow {
	at: Date;
	actor_sub: string | null;
	site_id: string | null;
	action: AuditAction;
	target: string | null;
	role: Role | null;
}

const toSite = (r: SiteRow): RegisteredSite => ({
	id: r.id,
	repoId: Number(r.repo_id),
	repo: r.repo,
	standaardbranch: r.standaardbranch,
	createdAt: r.created_at,
	createdBy: r.created_by
});

const toSettings = (r: SettingsRow): SiteSettings => ({
	siteId: r.site_id,
	naam: r.naam,
	omschrijving: r.omschrijving,
	adres: r.adres,
	mergenVanuitSchrijver: r.mergen_vanuit_schrijver,
	vierOgen: r.vier_ogen,
	identiteitToegestaan: allowedKinds(r.identiteit_toegestaan) as IdentityKind[],
	updatedAt: r.updated_at,
	updatedBy: r.updated_by
});

const toInvitation = (r: InvitationRow): Invitation => ({
	id: r.id,
	siteId: r.site_id,
	email: r.email,
	role: r.role,
	invitedBy: r.invited_by,
	createdAt: r.created_at,
	expiresAt: r.expires_at
});

function audit(db: Db, entry: Omit<AuditEntry, 'at'>, at: Date) {
	return db`
		insert into audit_log (at, actor_sub, site_id, action, target, role)
		values (${at}, ${entry.actorSub}, ${entry.siteId}, ${entry.action}, ${entry.target}, ${entry.role})`;
}

async function nameOf(db: Db, sub: string): Promise<string | null> {
	const [row] = await db<{ name: string | null }[]>`select name from user_prefs where sub = ${sub}`;
	return row?.name ?? null;
}

/** Adds the one known user with this verified address, or else invites the address. */
async function addAddress(
	tx: postgres.TransactionSql,
	siteId: string,
	address: string,
	role: Role,
	actor: string | null,
	now: Date
): Promise<AddResult> {
	const email = normaliseEmail(address);
	const known = await tx<{ sub: string; name: string | null }[]>`
		select sub, name from user_prefs where email = ${email} limit 2`;
	if (known.length === 1) {
		const [person] = known;
		const added = await tx`
			insert into site_members (site_id, sub, role, added_by, added_at)
			values (${siteId}, ${person.sub}, ${role}, ${actor}, ${now})
			on conflict (site_id, sub) do nothing
			returning sub`;
		if (added.length === 0) {
			const [existing] = await tx<{ role: Role }[]>`
				select role from site_members where site_id = ${siteId} and sub = ${person.sub}`;
			return {
				kind: 'already-member',
				sub: person.sub,
				name: person.name,
				role: existing.role
			};
		}
		await tx`delete from invitations where site_id = ${siteId} and email = ${email}`;
		await audit(
			tx,
			{ actorSub: actor, siteId, action: 'member.added', target: person.sub, role },
			now
		);
		return { kind: 'added', sub: person.sub, name: person.name };
	}
	const expiresAt = invitationExpiry(now);
	const [existing] = await tx<{ id: string }[]>`
		select id from invitations where site_id = ${siteId} and email = ${email} for update`;
	const [invitation] = await tx<{ id: string }[]>`
		insert into invitations (id, site_id, email, role, invited_by, created_at, expires_at)
		values (${randomUUID()}, ${siteId}, ${email}, ${role}, ${actor}, ${now}, ${expiresAt})
		on conflict (site_id, email) do update set
			role = excluded.role,
			invited_by = excluded.invited_by,
			created_at = excluded.created_at,
			expires_at = excluded.expires_at
		returning id`;
	await audit(
		tx,
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

/** The Postgres team store. The clock is a parameter so the tests can move time. */
export function createTeamStore(
	sql: postgres.Sql,
	clock: () => Date = () => new Date()
): TeamStore {
	/** Locks every membership of the site, so two changes to its team run one after the other. */
	const lockTeam = (tx: Db, siteId: string) =>
		tx<{ sub: string; role: Role }[]>`
			select sub, role from site_members where site_id = ${siteId} for update`;

	const leavesNoAdmin = (team: { sub: string; role: Role }[], sub: string, next: Role | null) =>
		team.find((r) => r.sub === sub)?.role === 'beheerder' &&
		next !== 'beheerder' &&
		team.filter((r) => r.role === 'beheerder').length === 1;

	return {
		recordLogin(login) {
			return sql.begin(async (tx) => {
				const now = clock();
				const email = login.emailVerified && login.email ? normaliseEmail(login.email) : null;
				await tx`
					insert into user_prefs (sub, name, email, last_login_at)
					values (${login.sub}, ${login.name || null}, ${email}, ${now})
					on conflict (sub) do update set
						name = excluded.name,
						email = excluded.email,
						last_login_at = excluded.last_login_at`;
				if (!email) return [];
				const open = await tx<InvitationRow[]>`
					delete from invitations where email = ${email} and expires_at > ${now}
					returning *`;
				for (const invitation of open) {
					await tx`
						insert into site_members (site_id, sub, role, added_by, added_at)
						values (${invitation.site_id}, ${login.sub}, ${invitation.role}, ${invitation.invited_by}, ${now})
						on conflict (site_id, sub) do update set role = excluded.role
						where excluded.role = 'beheerder'`;
					await audit(
						tx,
						{
							actorSub: login.sub,
							siteId: invitation.site_id,
							action: 'invitation.claimed',
							target: invitation.id,
							role: invitation.role
						},
						now
					);
				}
				return open.map((i) => ({ siteId: i.site_id, role: i.role }));
			});
		},

		async profile(sub) {
			const [row] = await sql<
				{ name: string | null; email: string | null; last_login_at: Date | null }[]
			>`select name, email, last_login_at from user_prefs where sub = ${sub}`;
			return row ? { sub, name: row.name, email: row.email, lastLoginAt: row.last_login_at } : null;
		},

		async settings(siteId) {
			const [row] = await sql<SettingsRow[]>`select * from site_settings where site_id = ${siteId}`;
			return row ? toSettings(row) : null;
		},

		async sites() {
			const rows = await sql<SiteRow[]>`select * from sites order by created_at, id`;
			return rows.map(toSite);
		},

		addSite(site, values: SettingsValues, admin, actor) {
			return sql.begin(async (tx): Promise<AddSiteResult> => {
				const now = clock();
				const inserted = await tx`
					insert into sites (id, repo_id, repo, standaardbranch, created_at, created_by)
					values (${site.id}, ${site.repoId}, ${site.repo}, ${site.standaardbranch}, ${now}, ${actor})
					on conflict do nothing
					returning id`;
				if (inserted.length === 0) {
					const [taken] = await tx`select 1 from sites where id = ${site.id}`;
					return { ok: false, reason: taken ? 'id-taken' : 'repo-taken' };
				}
				await tx`
					insert into site_settings
						(site_id, naam, omschrijving, adres, mergen_vanuit_schrijver, vier_ogen,
						 identiteit_toegestaan, updated_at, updated_by)
					values (${site.id}, ${values.naam}, ${values.omschrijving}, ${values.adres},
						${values.mergenVanuitSchrijver}, ${values.vierOgen},
						${tx.array(allowedKinds(values.identiteitToegestaan))}, ${now}, ${actor})`;
				await audit(
					tx,
					{ actorSub: actor, siteId: site.id, action: 'site.added', target: site.repo, role: null },
					now
				);
				if (!admin) return { ok: true, admin: null };
				if ('email' in admin) {
					return {
						ok: true,
						admin: await addAddress(tx, site.id, admin.email, 'beheerder', actor, now)
					};
				}
				await tx`
					insert into site_members (site_id, sub, role, added_by, added_at)
					values (${site.id}, ${admin.sub}, 'beheerder', ${actor}, ${now})`;
				await audit(
					tx,
					{
						actorSub: actor,
						siteId: site.id,
						action: 'member.added',
						target: admin.sub,
						role: 'beheerder'
					},
					now
				);
				return {
					ok: true,
					admin: { kind: 'added', sub: admin.sub, name: await nameOf(tx, admin.sub) }
				};
			});
		},

		removeSite(siteId, actor) {
			return sql.begin(async (tx) => {
				const [row] = await tx<SiteRow[]>`delete from sites where id = ${siteId} returning *`;
				if (!row) return null;
				await audit(
					tx,
					{ actorSub: actor, siteId, action: 'site.removed', target: row.repo, role: null },
					clock()
				);
				return toSite(row);
			});
		},

		moveSite(siteId, repo, standaardbranch) {
			return sql.begin(async (tx) => {
				const [row] = await tx<SiteRow[]>`select * from sites where id = ${siteId} for update`;
				if (!row) return [];
				const changed = movedColumns(row, { repo, standaardbranch });
				if (changed.length === 0) return [];
				await tx`
					update sites set repo = ${repo}, standaardbranch = ${standaardbranch}
					where id = ${siteId}`;
				await audit(
					tx,
					{ actorSub: null, siteId, action: 'site.moved', target: changed.join(','), role: null },
					clock()
				);
				return changed;
			});
		},

		saveSettings(siteId, values: SettingsValues, actor) {
			return sql.begin(async (tx) => {
				const [row] = await tx<SettingsRow[]>`
					select * from site_settings where site_id = ${siteId} for update`;
				if (!row) throw new Error(`unknown site ${siteId}`);
				const next: SettingsValues = {
					naam: values.naam,
					omschrijving: values.omschrijving,
					adres: values.adres,
					mergenVanuitSchrijver: values.mergenVanuitSchrijver,
					vierOgen: values.vierOgen,
					identiteitToegestaan: allowedKinds(values.identiteitToegestaan)
				};
				const changed = changedSettings(toSettings(row), next);
				if (changed.length === 0) return [];
				const now = clock();
				await tx`
					update site_settings set
						naam = ${next.naam},
						omschrijving = ${next.omschrijving},
						adres = ${next.adres},
						mergen_vanuit_schrijver = ${next.mergenVanuitSchrijver},
						vier_ogen = ${next.vierOgen},
						identiteit_toegestaan = ${tx.array(next.identiteitToegestaan)},
						updated_at = ${now},
						updated_by = ${actor}
					where site_id = ${siteId}`;
				await audit(
					tx,
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
			});
		},

		async members(siteId) {
			const rows = await sql<
				{
					sub: string;
					role: Role;
					added_by: string | null;
					added_at: Date;
					name: string | null;
					email: string | null;
				}[]
			>`
				select m.sub, m.role, m.added_by, m.added_at, p.name, p.email
				from site_members m left join user_prefs p on p.sub = m.sub
				where m.site_id = ${siteId}`;
			return sortMembers(
				rows.map((r) => ({
					sub: r.sub,
					role: r.role,
					addedBy: r.added_by,
					addedAt: r.added_at,
					name: r.name,
					email: r.email
				}))
			);
		},

		async role(siteId, sub) {
			const [row] = await sql<{ role: Role }[]>`
				select role from site_members where site_id = ${siteId} and sub = ${sub}`;
			return row?.role ?? null;
		},

		async sitesOf(sub) {
			const rows = await sql<{ site_id: string; role: Role }[]>`
				select site_id, role from site_members where sub = ${sub} order by site_id`;
			return rows.map((r) => ({ siteId: r.site_id, role: r.role }));
		},

		addByEmail(siteId, address, role, actor) {
			return sql.begin((tx) => addAddress(tx, siteId, address, role, actor, clock()));
		},

		changeRole(siteId, sub, role, actor: Actor) {
			return sql.begin(async (tx): Promise<TeamChange> => {
				const team = await lockTeam(tx, siteId);
				const name = await nameOf(tx, sub);
				const row = team.find((r) => r.sub === sub);
				if (!row) return { ok: false, reason: 'not-a-member', name };
				if (row.role === role) return { ok: true, sub, name, previous: row.role };
				if (!actor.platformAdmin && leavesNoAdmin(team, sub, role)) {
					return { ok: false, reason: 'last-admin', name };
				}
				await tx`update site_members set role = ${role} where site_id = ${siteId} and sub = ${sub}`;
				await audit(
					tx,
					{ actorSub: actor.sub, siteId, action: 'member.role_changed', target: sub, role },
					clock()
				);
				return { ok: true, sub, name, previous: row.role };
			});
		},

		removeMember(siteId, sub, actor: Actor) {
			return sql.begin(async (tx): Promise<TeamChange> => {
				const team = await lockTeam(tx, siteId);
				const name = await nameOf(tx, sub);
				const row = team.find((r) => r.sub === sub);
				if (!row) return { ok: false, reason: 'not-a-member', name };
				if (!actor.platformAdmin && leavesNoAdmin(team, sub, null)) {
					return { ok: false, reason: 'last-admin', name };
				}
				await tx`delete from site_members where site_id = ${siteId} and sub = ${sub}`;
				await audit(
					tx,
					{ actorSub: actor.sub, siteId, action: 'member.removed', target: sub, role: row.role },
					clock()
				);
				return { ok: true, sub, name, previous: row.role };
			});
		},

		async invitations(siteId) {
			const rows = await sql<InvitationRow[]>`
				select * from invitations
				where site_id = ${siteId} and expires_at > ${clock()}
				order by created_at`;
			return rows.map(toInvitation);
		},

		async revokeInvitation(siteId, id, actor) {
			if (!isUuid(id)) return null;
			return sql.begin(async (tx) => {
				const [row] = await tx<InvitationRow[]>`
					delete from invitations where site_id = ${siteId} and id = ${id} returning *`;
				if (!row) return null;
				await audit(
					tx,
					{ actorSub: actor, siteId, action: 'invitation.revoked', target: id, role: row.role },
					clock()
				);
				return toInvitation(row);
			});
		},

		async recordWriter(siteId, number, sub) {
			await sql`
				insert into proposal_writers (site_id, number, sub, first_at)
				values (${siteId}, ${number}, ${sub}, ${clock()})
				on conflict (site_id, number, sub) do nothing`;
		},

		async writers(siteId, number) {
			const rows = await sql<{ sub: string }[]>`
				select sub from proposal_writers
				where site_id = ${siteId} and number = ${number}
				order by first_at, sub`;
			return rows.map((r) => r.sub);
		},

		async forgetWriters(siteId, number) {
			await sql`delete from proposal_writers where site_id = ${siteId} and number = ${number}`;
		},

		async audit(siteId) {
			const rows = await sql<AuditRow[]>`
				select at, actor_sub, site_id, action, target, role from audit_log
				${siteId === undefined ? sql`` : sql`where site_id = ${siteId}`}
				order by at desc, id desc`;
			return rows.map((r) => ({
				at: r.at,
				actorSub: r.actor_sub,
				siteId: r.site_id,
				action: r.action,
				target: r.target,
				role: r.role
			}));
		},

		retention() {
			return sql.begin(async (tx) => {
				const now = clock();
				const expired = await tx<InvitationRow[]>`
					delete from invitations where expires_at <= ${now} returning *`;
				for (const i of expired) {
					await audit(
						tx,
						{
							actorSub: null,
							siteId: i.site_id,
							action: 'invitation.expired',
							target: i.id,
							role: i.role
						},
						now
					);
				}
				const users = await tx`
					delete from user_prefs p
					where coalesce(p.last_login_at, p.updated_at) < ${forgetBefore(now)}
					and not exists (select 1 from site_members m where m.sub = p.sub)`;
				const writers = await tx`
					delete from proposal_writers where first_at < ${writersBefore(now)}`;
				const old = await tx`delete from audit_log where at < ${auditBefore(now)}`;
				return {
					invitations: expired.length,
					users: users.count,
					audit: old.count,
					writers: writers.count
				};
			});
		}
	};
}
