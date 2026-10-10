import type { SiteConfig } from '$lib/config/types';

/** A role on a site's team. Everyone signed in may propose; these two decide. */
export type Role = 'beheerder' | 'redactie';
export const ROLES: readonly Role[] = ['beheerder', 'redactie'];

export type IdentityKind = 'anoniem' | 'gekoppeld' | 'op-naam';
export const IDENTITY_KINDS: readonly IdentityKind[] = ['anoniem', 'gekoppeld', 'op-naam'];

export const INVITATION_DAYS = 30;
export const FORGET_AFTER_MONTHS = 12;
export const AUDIT_YEARS = 2;

export interface Profile {
	sub: string;
	name: string | null;
	/** Lower-cased, and only an address the identity provider verified. */
	email: string | null;
	lastLoginAt: Date | null;
}

export interface Member {
	sub: string;
	role: Role;
	addedBy: string | null;
	addedAt: Date;
	name: string | null;
	email: string | null;
}

export interface Invitation {
	id: string;
	siteId: string;
	email: string;
	role: Role;
	invitedBy: string | null;
	createdAt: Date;
	expiresAt: Date;
}

export interface SettingsValues {
	naam: string;
	omschrijving: string | null;
	adres: string | null;
	mergenVanuitSchrijver: boolean;
	vierOgen: boolean;
	identiteitToegestaan: IdentityKind[];
}

export interface SiteSettings extends SettingsValues {
	siteId: string;
	updatedAt: Date;
	updatedBy: string | null;
}

/** What a configured site starts with: its settings, and the addresses that get the first invitations. */
export interface SiteSeed {
	siteId: string;
	values: SettingsValues;
	redactie: string[];
}

export type AuditAction =
	| 'settings.seeded'
	| 'settings.changed'
	| 'member.added'
	| 'member.role_changed'
	| 'member.removed'
	| 'invitation.created'
	| 'invitation.renewed'
	| 'invitation.revoked'
	| 'invitation.claimed'
	| 'invitation.expired';

/** Never an e-mail address: the target is a sub, an invitation id or the names of changed settings. */
export interface AuditEntry {
	at: Date;
	actorSub: string | null;
	siteId: string | null;
	action: AuditAction;
	target: string | null;
	role: Role | null;
}

/** Who acts. A platform admin passes the last-admin guard. */
export interface Actor {
	sub: string;
	platformAdmin: boolean;
}

export interface LoginProfile {
	sub: string;
	name: string;
	email: string;
	emailVerified: boolean;
}

export type AddResult =
	| { kind: 'added'; sub: string; name: string | null }
	| { kind: 'already-member'; sub: string; name: string | null; role: Role }
	| { kind: 'invited'; id: string; renewed: boolean; expiresAt: Date };

export type TeamChange =
	| { ok: true; sub: string; name: string | null; previous: Role }
	| { ok: false; reason: 'not-a-member' | 'last-admin'; name: string | null };

export interface RetentionResult {
	invitations: number;
	users: number;
	audit: number;
}

export interface TeamStore {
	/**
	 * Saves the profile of someone who signed in (name, verified e-mail, login time) and turns the
	 * open invitations for that verified address into memberships.
	 */
	recordLogin(profile: LoginProfile): Promise<{ siteId: string; role: Role }[]>;
	profile(sub: string): Promise<Profile | null>;

	settings(siteId: string): Promise<SiteSettings | null>;
	/**
	 * Creates the settings of a configured site, and its first invitations, unless the site has
	 * settings already. Returns whether it did.
	 */
	seedSite(seed: SiteSeed): Promise<boolean>;
	/** Returns the names of the settings that changed. */
	saveSettings(siteId: string, values: SettingsValues, actor: string): Promise<string[]>;

	members(siteId: string): Promise<Member[]>;
	role(siteId: string, sub: string): Promise<Role | null>;
	sitesOf(sub: string): Promise<{ siteId: string; role: Role }[]>;
	/** Adds the one known user with this verified address, or else invites the address. */
	addByEmail(siteId: string, email: string, role: Role, actor: string): Promise<AddResult>;
	changeRole(siteId: string, sub: string, role: Role, actor: Actor): Promise<TeamChange>;
	removeMember(siteId: string, sub: string, actor: Actor): Promise<TeamChange>;

	/** The invitations that have not expired, oldest first. */
	invitations(siteId: string): Promise<Invitation[]>;
	revokeInvitation(siteId: string, id: string, actor: string): Promise<Invitation | null>;

	/** Records that Schrijver committed to a proposal for this user; the first time stays. */
	recordWriter(siteId: string, number: number, sub: string): Promise<void>;
	/** The users Schrijver committed to a proposal for, the first one first. */
	writers(siteId: string, number: number): Promise<string[]>;

	/** Newest first. */
	audit(siteId?: string): Promise<AuditEntry[]>;
	/**
	 * Deletes expired invitations, the profile, preferences and writing records of users not seen
	 * for twelve months who are on no team, and audit rows older than two years.
	 */
	retention(): Promise<RetentionResult>;
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (email: string) => email.length <= 254 && EMAIL.test(email);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID.test(id);

export const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

/** Anoniem is always allowed; the kinds keep their fixed order. */
export function allowedKinds(kinds: readonly string[]): IdentityKind[] {
	return IDENTITY_KINDS.filter((k) => k === 'anoniem' || kinds.includes(k));
}

export const invitationExpiry = (from: Date) =>
	new Date(from.getTime() + INVITATION_DAYS * 24 * 3600_000);

function monthsBefore(date: Date, months: number): Date {
	const d = new Date(date);
	d.setUTCMonth(d.getUTCMonth() - months);
	return d;
}

/** Users not seen since this moment, who are on no team, are forgotten. */
export const forgetBefore = (now: Date) => monthsBefore(now, FORGET_AFTER_MONTHS);
/** Audit rows from before this moment are deleted. */
export const auditBefore = (now: Date) => monthsBefore(now, AUDIT_YEARS * 12);

/** Beheerders first, then by name or address. */
export function sortMembers(members: Member[]): Member[] {
	const key = (m: Member) => (m.name ?? m.email ?? '').toLocaleLowerCase('nl');
	return [...members].sort(
		(a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || key(a).localeCompare(key(b), 'nl')
	);
}

/** The settings that differ between two sets of values, by their column names. */
export function changedSettings(before: SettingsValues, after: SettingsValues): string[] {
	const columns: [keyof SettingsValues, string][] = [
		['naam', 'naam'],
		['omschrijving', 'omschrijving'],
		['adres', 'adres'],
		['mergenVanuitSchrijver', 'mergen_vanuit_schrijver'],
		['vierOgen', 'vier_ogen'],
		['identiteitToegestaan', 'identiteit_toegestaan']
	];
	return columns
		.filter(([key]) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
		.map(([, column]) => column);
}

/** What a site in the configuration starts with in the database. */
export function seedFromConfig(site: SiteConfig): SiteSeed {
	return {
		siteId: site.id,
		values: {
			naam: site.naam,
			omschrijving: site.omschrijving ?? null,
			adres: site.adres ?? null,
			mergenVanuitSchrijver: site.review['mergen-vanuit-schrijver'],
			vierOgen: true,
			identiteitToegestaan: allowedKinds(site.identiteit.toegestaan)
		},
		redactie: site.review.redactie
	};
}

/** The addresses that get a first invitation: valid ones, lower-cased, each once. */
export const seedAddresses = (addresses: string[]) => [
	...new Set(addresses.map(normaliseEmail).filter(isEmail))
];
