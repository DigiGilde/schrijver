import type { SiteConfig } from '../config/types';
import type { Forge } from '../forge/types';
import { errorFields, log } from '../log';

export interface EditorialUser {
	email: string | null;
	emailVerified: boolean;
	githubLogin: string | null;
}

export async function isEditorial(
	site: SiteConfig,
	user: EditorialUser,
	forge: Forge
): Promise<boolean> {
	try {
		const email = user.email?.trim().toLowerCase() ?? '';
		if (user.emailVerified && email !== '') {
			if (site.review.redactie.some((e) => e.trim().toLowerCase() === email)) return true;
		}
		if (user.githubLogin !== null) {
			const permission = await forge.collaboratorPermission(site.repo, user.githubLogin);
			return permission === 'admin' || permission === 'write';
		}
		return false;
	} catch (err) {
		log.warn('editorial.check_failed', { site: site.id, ...errorFields(err) });
		return false;
	}
}
