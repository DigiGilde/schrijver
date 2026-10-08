/* Under the drafts' prefix, so logging out on a shared workstation also resets it. */
const key = (siteId: string) => `schrijver:${siteId}:openbaar-uitgelegd`;

/** Whether this browser has already been told that a draft on this site is public. */
export function publicDraftExplained(siteId: string): boolean {
	try {
		return localStorage.getItem(key(siteId)) !== null;
	} catch {
		return false;
	}
}

export function rememberPublicDraftExplained(siteId: string): void {
	try {
		localStorage.setItem(key(siteId), '1');
	} catch {
		// storage unavailable: the notice shows again on the next visit
	}
}
