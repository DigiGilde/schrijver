import type { SiteConfig } from '../config/types';
import { sameRepo } from './repo';
import type { PrFile, PrSummary } from './types';
import { identityFromPrBody, isOwnTrailer, type Identity } from './trailers';

export interface Proposal {
	number: number;
	title: string;
	url: string;
	status:
		'concept' | 'ingestuurd' | 'goedgekeurd' | 'aanpassing-gevraagd' | 'samengevoegd' | 'gesloten';
	mine: boolean;
	viaSchrijver: boolean;
	pages: string[];
	previewUrl: string | null;
	checks: PrSummary['checks'];
	updatedAt: string;
	/** Editor links back into the proposal's branch, one per page; empty when Schrijver cannot edit it. */
	verderBewerken: { page: string; href: string }[];
}

export const SENT_MARKER = 'Schrijver-Status: ingestuurd';

/** The label Schrijver sets when the editors ask for an adjustment: the App cannot review as a person. */
export const ADJUSTMENT_LABEL = 'aanpassing gevraagd';

export function isSentIn(pr: Pick<PrSummary, 'draft' | 'body'>): boolean {
	return !pr.draft || pr.body.split('\n').some((l) => l.trim() === SENT_MARKER);
}

/** Everyone who asked for changes on GitHub has been asked to review again: the proposal waits for them. */
const askedAgain = (pr: PrSummary) =>
	pr.changesRequestedBy.length > 0 &&
	pr.changesRequestedBy.every((login) => pr.requestedReviewers.includes(login));

export function statusOf(pr: PrSummary): Proposal['status'] {
	if (pr.state === 'merged') return 'samengevoegd';
	if (pr.state === 'closed') return 'gesloten';
	if (!isSentIn(pr)) return 'concept';
	if (
		pr.labels.includes(ADJUSTMENT_LABEL) ||
		(pr.reviewState === 'changes_requested' && !askedAgain(pr))
	)
		return 'aanpassing-gevraagd';
	if (pr.reviewState === 'approved') return 'goedgekeurd';
	return 'ingestuurd';
}

export function previewUrl(site: SiteConfig, pr: PrSummary): string | null {
	const { soort, label, url } = site.preview;
	if (soort === 'geen' || pr.state !== 'open' || !url) return null;
	if (soort === 'bij-label' && !(label && pr.labels.includes(label))) return null;
	return url.replaceAll('{nummer}', String(pr.number));
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** Only open, same-repository proposals on a Schrijver branch of this site can be edited further. */
export function continueLinks(
	site: SiteConfig,
	pr: PrSummary,
	pages: string[]
): Proposal['verderBewerken'] {
	if (
		pr.state !== 'open' ||
		!pr.headRef.startsWith(`schrijver/${site.id}/`) ||
		!sameRepo(pr.headRepo, site.repo) ||
		pr.baseRef !== site.standaardbranch
	)
		return [];
	const prefix = site.content.pad + '/';
	const query = new URLSearchParams({ branch: pr.headRef, pr: String(pr.number) });
	return pages.map((page) => ({
		page,
		href: `/sites/${site.id}/bewerken/${encodePath(page.slice(prefix.length))}?${query}`
	}));
}

export function toProposal(
	pr: PrSummary,
	files: PrFile[],
	site: SiteConfig,
	mine: Identity[]
): Proposal {
	const identity = identityFromPrBody(pr.body);
	const prefix = site.content.pad + '/';
	const pages = files
		.filter((f) => f.status !== 'removed')
		.map((f) => f.path)
		.filter((p) => p.endsWith('.md') && p.startsWith(prefix))
		.sort();
	return {
		number: pr.number,
		title: pr.title,
		url: pr.url,
		status: statusOf(pr),
		mine: isOwnTrailer(identity, mine),
		viaSchrijver: identity !== null,
		pages: files
			.map((f) => f.path)
			.filter((p) => p.endsWith('.md') && p.startsWith(prefix))
			.sort(),
		previewUrl: previewUrl(site, pr),
		checks: pr.checks,
		updatedAt: pr.updatedAt,
		verderBewerken: continueLinks(site, pr, pages)
	};
}
