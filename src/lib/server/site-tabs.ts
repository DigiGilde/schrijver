import type { SiteConfig } from '$lib/config/types';

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
