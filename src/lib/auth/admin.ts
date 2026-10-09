import type { SiteConfig } from '../config/types';
import type { Forge } from '../forge/types';
import { errorFields, log } from '../log';

export interface SiteUser {
	/** The SSO subject: the stable key of the person. */
	sub: string;
	githubLogin: string | null;
}

/**
 * Whether the user is an admin of the site, who may merge a proposal they wrote despite four eyes.
 * For now that is a linked GitHub account with admin permission on the site repository.
 */
export async function isSiteAdmin(
	site: Pick<SiteConfig, 'id' | 'repo'>,
	user: SiteUser,
	forge: Forge
): Promise<boolean> {
	if (user.githubLogin === null) return false;
	try {
		return (await forge.collaboratorPermission(site.repo, user.githubLogin)) === 'admin';
	} catch (err) {
		log.warn('admin.check_failed', { site: site.id, ...errorFields(err) });
		return false;
	}
}
