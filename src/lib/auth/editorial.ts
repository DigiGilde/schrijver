import type { SiteConfig } from '../config/types';
import type { Forge } from '../forge/types';
import { errorFields, log } from '../log';
import { siteRole, type SiteUser } from './roles';

/**
 * Whether the user decides on the proposals of the site: a member of its team, or someone whose
 * linked GitHub account may write to its repository. No when a lookup fails.
 */
export async function isEditorial(
	site: Pick<SiteConfig, 'id' | 'repo'>,
	user: SiteUser,
	forge: Forge
): Promise<boolean> {
	try {
		if ((await siteRole(site.id, user.sub)) !== null) return true;
		if (user.githubLogin === null) return false;
		const permission = await forge.collaboratorPermission(site.repo, user.githubLogin);
		return permission === 'admin' || permission === 'write';
	} catch (err) {
		log.warn('editorial.check_failed', { site: site.id, ...errorFields(err) });
		return false;
	}
}
