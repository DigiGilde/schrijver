import { isEditorial } from '$lib/auth/editorial';
import type { SiteConfig } from '$lib/config/types';
import { statusOf } from '$lib/forge/proposals';
import { proposalsTabAddress, waitsForReview } from '$lib/forge/status';
import type { Forge } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';

/** What the three tabs of a site show above their content. */
export interface SiteHeader {
	id: string;
	naam: string;
	omschrijving: string | null;
	adres: string | null;
}

export const siteHeader = (site: SiteConfig): SiteHeader => ({
	id: site.id,
	naam: site.naam,
	omschrijving: site.omschrijving ?? null,
	adres: site.adres ?? null
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

async function waitingFor(site: SiteConfig, forge: Forge): Promise<number | null> {
	try {
		const prs = await forge.listPrs(site.repo, 'open');
		return prs.filter((pr) => waitsForReview(statusOf(pr))).length;
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
	const editorial = await isEditorial(
		site,
		{ email: session.email, emailVerified: session.emailVerified, githubLogin: prefs.githubLogin },
		forge
	);
	return proposalsTabAddress(site.id, editorial ? await waitingFor(site, forge) : null);
}
