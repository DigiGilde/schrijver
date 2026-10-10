import { LruMap } from '$lib/forge/cache';
import { repoKey } from '$lib/forge/repo';
import type { Forge } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { RIGHTS_WAIT_MS, inTime } from '$lib/time-limit';
import { isPlatformAdmin, siteRole, type SiteUser } from './roles';
import type { Visibility } from './team';
import { teamStore } from './team-store';

/** A site as its visibility needs it: whether its repository is public, as Schrijver last read it. */
export interface SeenSite {
	id: string;
	repo: string;
	isPublic: boolean | null;
}

/** Who sees a site: as its settings say, but only its team while its repository is not known to be public. */
export const whoSees = (isPublic: boolean | null, setting: Visibility): Visibility =>
	isPublic === true ? setting : 'team';

type Permission = Awaited<ReturnType<Forge['collaboratorPermission']>>;

const PERMISSION_MS = 60_000;
const permissions = new WeakMap<Forge, LruMap<{ permission: Permission; until: number }>>();

/**
 * Kept a minute: on a page with images every image asks again. A failed lookup is not kept, nor one
 * that GitHub did not answer in time.
 */
async function permissionOf(forge: Forge, repo: string, login: string): Promise<Permission> {
	let kept = permissions.get(forge);
	if (!kept) permissions.set(forge, (kept = new LruMap(200_000, () => 16)));
	const key = `${repoKey(repo)}\0${login.toLowerCase()}`;
	const now = Date.now();
	const found = kept.get(key);
	if (found && found.until > now) return found.permission;
	const permission = await inTime(forge.collaboratorPermission(repo, login), RIGHTS_WAIT_MS);
	kept.set(key, { permission, until: now + PERMISSION_MS });
	return permission;
}

/**
 * Whether the user may see the site in Schrijver. Where everyone sees it, everyone signed in; else a
 * platform admin, a member of its team in any role, and, on a private repository only, someone whose
 * linked GitHub account may read it. No when a lookup fails, or GitHub does not answer in time.
 */
export async function maySeeSite(site: SeenSite, user: SiteUser, forge: Forge): Promise<boolean> {
	if (isPlatformAdmin(user.sub)) return true;
	try {
		const settings = await teamStore().settings(site.id);
		if (!settings) return false;
		if (whoSees(site.isPublic, settings.zichtbaarheid) === 'iedereen') return true;
		if ((await siteRole(site.id, user.sub)) !== null) return true;
		// Everyone may read a public repository: there GitHub's answer says nothing.
		if (site.isPublic !== false || user.githubLogin === null) return false;
		return (await permissionOf(forge, site.repo, user.githubLogin)) !== 'none';
	} catch (err) {
		log.warn('visibility.check_failed', { site: site.id, ...errorFields(err) });
		return false;
	}
}
