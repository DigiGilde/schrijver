import type { SiteConfig } from '../config/types';
import type { PrFile, PrSummary } from './types';
import { identityFromPrBody } from './trailers';

export interface Proposal {
	number: number;
	title: string;
	url: string;
	status: 'concept' | 'ingestuurd' | 'goedgekeurd' | 'wijzigingen-gevraagd' | 'samengevoegd' | 'gesloten';
	mine: boolean;
	viaSchrijver: boolean;
	pages: string[];
	previewUrl: string | null;
	checks: PrSummary['checks'];
	updatedAt: string;
}

export const SENT_MARKER = 'Schrijver-Status: ingestuurd';

export function isSentIn(pr: Pick<PrSummary, 'draft' | 'body'>): boolean {
	return !pr.draft || pr.body.split('\n').some((l) => l.trim() === SENT_MARKER);
}

function statusOf(pr: PrSummary): Proposal['status'] {
	if (pr.state === 'merged') return 'samengevoegd';
	if (pr.state === 'closed') return 'gesloten';
	if (!isSentIn(pr)) return 'concept';
	if (pr.reviewState === 'approved') return 'goedgekeurd';
	if (pr.reviewState === 'changes_requested') return 'wijzigingen-gevraagd';
	return 'ingestuurd';
}

export function previewUrl(site: SiteConfig, pr: PrSummary): string | null {
	const { soort, label, url } = site.preview;
	if (soort === 'geen' || pr.state !== 'open' || !url) return null;
	if (soort === 'bij-label' && !(label && pr.labels.includes(label))) return null;
	return url.replaceAll('{nummer}', String(pr.number));
}

export function toProposal(
	pr: PrSummary,
	files: PrFile[],
	site: SiteConfig,
	myTrailer: string
): Proposal {
	const identity = identityFromPrBody(pr.body);
	const prefix = site.content.pad + '/';
	return {
		number: pr.number,
		title: pr.title,
		url: pr.url,
		status: statusOf(pr),
		mine: identity === myTrailer,
		viaSchrijver: identity !== null,
		pages: files
			.map((f) => f.path)
			.filter((p) => p.endsWith('.md') && p.startsWith(prefix))
			.sort(),
		previewUrl: previewUrl(site, pr),
		checks: pr.checks,
		updatedAt: pr.updatedAt
	};
}
