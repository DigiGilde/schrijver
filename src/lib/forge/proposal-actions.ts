import { isEditorial } from '../auth/editorial';
import type { SiteConfig } from '../config/types';
import { errorFields, log } from '../log';
import { SENT_MARKER, isSentIn } from './proposals';
import { identityFromPrBody } from './trailers';
import { ForgeError, type Forge, type PrSummary } from './types';

export const MAX_COMMENT_LENGTH = 5000;
const MAX_REVIEWERS = 5;
const COMMENT_PREFIX = 'Opmerking van de redactie via Schrijver:\n\n';

const MENU_LINE =
	'Menu bijwerken: deze wijziging voegt een nieuwe pagina toe; de navigatie moet nog door de redactie worden aangepast.';

export interface ActingUser {
	trailer: string;
	email: string | null;
	emailVerified: boolean;
	githubLogin: string | null;
	identityKind: 'anoniem' | 'gekoppeld' | 'op-naam';
}

export async function canAct(
	user: ActingUser,
	site: SiteConfig,
	pr: PrSummary,
	forge: Forge
): Promise<{ owner: boolean; editorial: boolean }> {
	if (pr.headRepo.toLowerCase() !== site.repo.toLowerCase() || pr.baseRef !== site.standaardbranch) {
		return { owner: false, editorial: false };
	}
	return {
		owner: identityFromPrBody(pr.body) === user.trailer,
		editorial: await isEditorial(site, user, forge)
	};
}

export async function pickReviewers(
	forge: Forge,
	site: SiteConfig,
	logins: string[],
	exclude: string | null
): Promise<string[]> {
	const found: string[] = [];
	const candidates = logins.filter((l) => l !== exclude).slice(0, MAX_REVIEWERS);
	for (const login of candidates) {
		try {
			const permission = await forge.collaboratorPermission(site.repo, login);
			if (permission === 'admin' || permission === 'write') found.push(login);
		} catch (err) {
			log.warn('proposal.reviewer_check_failed', { site: site.id, ...errorFields(err) });
		}
	}
	return found;
}

export async function sendIn(
	forge: Forge,
	site: SiteConfig,
	pr: PrSummary,
	opts: { reviewers: string[]; filesAdded: boolean; pages?: string[] }
): Promise<{ warning?: string }> {
	if (site.preview.soort === 'bij-label' && site.preview.label) {
		await forge.setLabels(site.repo, pr.number, [...new Set([...pr.labels, site.preview.label])]);
	}

	const pages =
		opts.pages ??
		(await forge.prFiles(site.repo, pr.number))
			.map((f) => f.path)
			.filter((p) => p.endsWith('.md') && p.startsWith(site.content.pad + '/'));
	let body = pr.body;
	if (pages.length > 0 && !body.includes("Pagina's:")) {
		body += `\n\nPagina's:\n${pages.map((p) => `- ${p}`).join('\n')}`;
	}
	if (opts.filesAdded && !body.includes(MENU_LINE)) body += `\n\n${MENU_LINE}`;
	if (body !== pr.body) await forge.updatePr(site.repo, pr.number, { body });

	if (opts.reviewers.length > 0) {
		try {
			await forge.requestReviewers(site.repo, pr.number, opts.reviewers);
		} catch (err) {
			log.warn('proposal.reviewers_failed', { site: site.id, pr: pr.number, ...errorFields(err) });
		}
	}

	try {
		await forge.markReady(site.repo, pr.number);
	} catch (e) {
		if (!(e instanceof ForgeError) || e.status !== 403) throw e;
		log.warn('proposal.markready_fallback', { site: site.id, pr: pr.number });
		if (!isSentIn({ draft: true, body })) {
			await forge.updatePr(site.repo, pr.number, { body: `${body}\n\n${SENT_MARKER}` });
			await forge.comment(site.repo, pr.number, 'Klaar voor beoordeling');
		}
	}
	log.info('proposal.sent', { site: site.id, pr: pr.number });
	return pr.mergeable === false
		? {
				warning:
					'Dit voorstel kan niet automatisch worden samengevoegd; de pagina is intussen op de hoofdbranch gewijzigd'
			}
		: {};
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
	await forge.comment(site.repo, number, COMMENT_PREFIX + clean);
}

export async function mergeProposal(
	forge: Forge,
	site: SiteConfig,
	pr: PrSummary,
	commitsTrailers: string[],
	sha?: string
): Promise<void> {
	const trailers = [...new Set(commitsTrailers)];
	const message = `${pr.title} (#${pr.number})${trailers.length > 0 ? `\n\n${trailers.join('\n')}` : ''}`;
	await forge.merge(site.repo, pr.number, message, sha);
}
