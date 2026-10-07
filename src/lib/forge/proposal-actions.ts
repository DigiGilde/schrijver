import { isEditorial } from '../auth/editorial';
import type { SiteConfig } from '../config/types';
import { log } from '../log';
import { identityFromPrBody } from './trailers';
import { ForgeError, type Forge, type PrSummary } from './types';

export const MAX_COMMENT_LENGTH = 5000;

const MENU_LINE =
	'Menu bijwerken: deze wijziging voegt een nieuwe pagina toe; de navigatie moet nog door de redactie worden aangepast.';

export interface ActingUser {
	trailer: string;
	email: string | null;
	emailVerified: boolean;
	githubLogin: string | null;
}

export async function canAct(
	user: ActingUser,
	site: SiteConfig,
	pr: PrSummary,
	forge: Forge
): Promise<{ owner: boolean; editorial: boolean }> {
	return {
		owner: identityFromPrBody(pr.body) === user.trailer,
		editorial: await isEditorial(site, user, forge)
	};
}

export async function sendIn(
	forge: Forge,
	site: SiteConfig,
	pr: PrSummary,
	opts: { reviewers: string[]; filesAdded: boolean; pages?: string[] }
): Promise<void> {
	let body = pr.body;
	try {
		await forge.markReady(site.repo, pr.number);
	} catch (e) {
		if (!(e instanceof ForgeError) || e.status !== 403) throw e;
		log.warn('proposal.markready_fallback', { site: site.id, pr: pr.number });
		await forge.comment(site.repo, pr.number, 'Klaar voor beoordeling');
		body += '\n\nKlaar voor beoordeling.';
	}

	if (site.preview.soort === 'bij-label' && site.preview.label) {
		await forge.setLabels(site.repo, pr.number, [...new Set([...pr.labels, site.preview.label])]);
	}

	const pages =
		opts.pages ??
		(await forge.prFiles(site.repo, pr.number))
			.map((f) => f.path)
			.filter((p) => p.endsWith('.md') && p.startsWith(site.content.pad + '/'));
	if (pages.length > 0) body += `\n\nPagina's:\n${pages.map((p) => `- ${p}`).join('\n')}`;
	if (opts.filesAdded) body += `\n\n${MENU_LINE}`;
	await forge.updatePr(site.repo, pr.number, { body });

	if (opts.reviewers.length > 0) await forge.requestReviewers(site.repo, pr.number, opts.reviewers);
	log.info('proposal.sent', { site: site.id, pr: pr.number });
}

export async function approveProposal(
	forge: Forge,
	site: SiteConfig,
	number: number,
	comment: string
): Promise<void> {
	await forge.approve(site.repo, number, comment);
}

export function cleanComment(body: unknown): string | null {
	if (typeof body !== 'string') return null;
	const trimmed = body.trim();
	return trimmed.length === 0 || trimmed.length > MAX_COMMENT_LENGTH ? null : trimmed;
}

export async function commentProposal(
	forge: Forge,
	site: SiteConfig,
	number: number,
	body: string
): Promise<void> {
	const clean = cleanComment(body);
	if (clean === null) throw new RangeError('Opmerking is leeg of te lang');
	await forge.comment(site.repo, number, clean);
}

export async function mergeProposal(
	forge: Forge,
	site: SiteConfig,
	pr: PrSummary,
	commitsTrailers: string[]
): Promise<void> {
	const trailers = [...new Set(commitsTrailers)];
	const message = `${pr.title} (#${pr.number})${trailers.length > 0 ? `\n\n${trailers.join('\n')}` : ''}`;
	await forge.merge(site.repo, pr.number, message);
}
