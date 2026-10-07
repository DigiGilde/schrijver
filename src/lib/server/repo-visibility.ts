import { getForge } from './services';

type VisibilityAware = { isPublic?: (repo: string) => boolean; inner?: unknown };

/** True when the repository is public, or when the forge cannot tell. */
export function getRepoVisibility(repo: string): boolean {
	let forge: VisibilityAware | undefined = getForge() as unknown as VisibilityAware;
	while (forge) {
		if (typeof forge.isPublic === 'function') return forge.isPublic(repo);
		forge = forge.inner as VisibilityAware | undefined;
	}
	return true;
}
