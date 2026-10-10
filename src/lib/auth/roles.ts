import type { SiteConfig } from '$lib/config/types';
import type { Forge } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import type { Role } from './team';
import { teamStore } from './team-store';

type Env = Record<string, string | undefined>;

/** Who asks: the SSO subject, and the GitHub account they linked. */
export interface SiteUser {
	sub: string;
	githubLogin: string | null;
}

type Site = Pick<SiteConfig, 'id' | 'repo'>;

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

/**
 * Whether the user is an admin of the site: manages its team and settings, and may merge a proposal
 * they wrote despite four eyes. A platform admin, a beheerder on its team, or someone whose linked
 * GitHub account has admin permission on its repository. No when a lookup fails.
 */
export async function canManageSite(site: Site, user: SiteUser, forge: Forge): Promise<boolean> {
	if (isPlatformAdmin(user.sub)) return true;
	try {
		if ((await siteRole(site.id, user.sub)) === 'beheerder') return true;
		if (user.githubLogin === null) return false;
		return (await forge.collaboratorPermission(site.repo, user.githubLogin)) === 'admin';
	} catch (err) {
		log.warn('admin.check_failed', { site: site.id, ...errorFields(err) });
		return false;
	}
}

/** Of these sites, the ones this user manages: all of them for a platform admin. */
export async function managedSites(sites: Site[], user: SiteUser, forge: Forge): Promise<string[]> {
	const managed = await Promise.all(sites.map((site) => canManageSite(site, user, forge)));
	return sites.filter((_, i) => managed[i]).map((site) => site.id);
}
