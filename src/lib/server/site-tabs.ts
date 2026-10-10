import { isEditorial } from '$lib/auth/editorial';
import { identitiesFor } from '$lib/auth/identity';
import { canManageSite, type SiteUser } from '$lib/auth/roles';
import type { SiteSettings } from '$lib/auth/team';
import { siteSettings } from '$lib/auth/team-store';
import type { SiteConfig } from '$lib/config/types';
import { toProposal } from '$lib/forge/proposals';
import { forReview, proposalsTabAddress, waitsForReview, type Status } from '$lib/forge/status';
import type { Identity } from '$lib/forge/trailers';
import type { Forge } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';

/** What the three tabs of a site show above their content. */
export interface SiteHeader {
	id: string;
	naam: string;
	omschrijving: string | null;
	adres: string | null;
}

export const siteHeader = (settings: SiteSettings): SiteHeader => ({
	id: settings.siteId,
	naam: settings.naam,
	omschrijving: settings.omschrijving,
	adres: settings.adres
});

export type Filter = 'mijn' | 'alle' | 'beoordelen';

/** The filter of the proposals tab; "Te beoordelen" exists for editorial members only. */
export function filterOf(value: string | null, editorial: boolean): Filter {
	if (value === 'alle') return 'alle';
	if (value === 'beoordelen' && editorial) return 'beoordelen';
	return 'mijn';
}

/** Where an old site page link with `?tab=` leads now: the proposals tab, with the same filter. */
export function proposalsAddress(siteId: string, tab: string | null): string | null {
	if (tab === null) return null;
	const base = `/sites/${encodeURIComponent(siteId)}/voorstellen`;
	return tab === 'mijn' || tab === 'alle' || tab === 'beoordelen' ? `${base}?filter=${tab}` : base;
}

/** The filter that a proposal's address carries from the list; the list itself checks that the reader may use it. */
export function carriedFilter(value: string | null): Filter | null {
	const filter = filterOf(value, true);
	return filter === value ? filter : null;
}

/**
 * Whether the reader's own proposals belong in their "Te beoordelen": on a site with four eyes another
 * member of the redactie decides on them, unless the reader is a site admin. Asked only when one waits.
 */
export async function ownForReview(
	site: SiteConfig,
	user: SiteUser,
	forge: Forge,
	proposals: { status: Status; mine: boolean }[]
): Promise<boolean> {
	if (!proposals.some((p) => p.mine && waitsForReview(p.status))) return true;
	return !(await siteSettings(site)).vierOgen || (await canManageSite(site, user, forge));
}

async function waitingFor(
	site: SiteConfig,
	forge: Forge,
	user: SiteUser,
	mine: Identity[]
): Promise<number | null> {
	try {
		const proposals = (await forge.listPrs(site.repo, 'open')).map((pr) =>
			toProposal(pr, [], site, mine)
		);
		return forReview(proposals, await ownForReview(site, user, forge, proposals)).length;
	} catch (err) {
		log.warn('proposals.list_failed', { site: site.id, ...errorFields(err) });
		return null;
	}
}

/** Where the back button of a proposal leads: the list in the filter the writer came from, else as the Voorstellen tab opens it. */
export async function backToProposals(
	site: SiteConfig,
	forge: Forge,
	url: URL,
	{ session, prefs }: NonNullable<App.Locals['user']>
): Promise<string> {
	const filter = carriedFilter(url.searchParams.get('filter'));
	if (filter) return `/sites/${encodeURIComponent(site.id)}/voorstellen?filter=${filter}`;
	const user = { sub: session.sub, githubLogin: prefs.githubLogin };
	const editorial = await isEditorial(site, user, forge);
	return proposalsTabAddress(
		site.id,
		editorial ? await waitingFor(site, forge, user, identitiesFor(prefs, session)) : null
	);
}
