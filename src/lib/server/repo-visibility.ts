import { log } from '$lib/log';
import { getForge } from './services';

/** True when the repository is public, or when that cannot be determined (the notice fails safe). */
export async function getRepoVisibility(repo: string): Promise<boolean> {
	try {
		return await getForge().isPublic(repo);
	} catch (err) {
		log.warn('forge.visibility_failed', { repo, reason: String(err) });
		return true;
	}
}
