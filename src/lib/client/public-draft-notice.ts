/* Under the drafts' prefix, so logging out on a shared workstation also resets it. */
const key = (siteId: string) => `schrijver:${siteId}:openbaar-uitgelegd`;

/** What the editor says before the first save on a site whose drafts are public. */
export const PUBLIC_DRAFT_NOTICE = {
	text: 'Je concept wordt openbaar',
	supportingText:
		'Iedereen kan het op GitHub lezen zodra je het bewaart, ook voordat je het instuurt.'
};

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
