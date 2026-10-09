import type { Role } from './team';
import { teamStore } from './team-store';

type Env = Record<string, string | undefined>;

/** The subs in SCHRIJVER_BEHEERDERS. Read at every call, so the environment stays the only source. */
export function platformAdmins(env: Env = process.env): Set<string> {
	return new Set(
		(env.SCHRIJVER_BEHEERDERS ?? '')
			.split(',')
			.map((sub) => sub.trim())
			.filter(Boolean)
	);
}

/** A platform admin ("Schrijver-beheerder") manages every site, so no site can be locked out. */
export const isPlatformAdmin = (sub: string, env: Env = process.env) =>
	platformAdmins(env).has(sub);

/** The role on the site's team, from the table. */
export const siteRole = (siteId: string, sub: string): Promise<Role | null> =>
	teamStore().role(siteId, sub);

/** Whether this user may manage the team and the settings of the site. */
export async function canManageSite(siteId: string, user: { sub: string }): Promise<boolean> {
	return isPlatformAdmin(user.sub) || (await siteRole(siteId, user.sub)) === 'beheerder';
}

/** Of these sites, the ones this user manages: all of them for a platform admin. */
export async function managedSites(siteIds: string[], user: { sub: string }): Promise<string[]> {
	if (isPlatformAdmin(user.sub)) return siteIds;
	const own = new Set(
		(await teamStore().sitesOf(user.sub)).filter((s) => s.role === 'beheerder').map((s) => s.siteId)
	);
	return siteIds.filter((id) => own.has(id));
}
