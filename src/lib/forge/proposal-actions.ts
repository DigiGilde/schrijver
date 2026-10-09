import { isEditorial } from '../auth/editorial';
import type { SiteConfig } from '../config/types';
import { errorFields, log } from '../log';
import { commentBody, type CommentAuthor } from './conversation';
import { missingAfterMerge, usageAfterMerge } from './image-usage';
import { ADJUSTMENT_LABEL, SENT_MARKER, isSentIn } from './proposals';
import { sameRepo } from './repo';
import { identityFromPrBody, isOwnTrailer, type Identity } from './trailers';
import { ForgeError, MAX_PR_FILES, type Forge, type PrSummary } from './types';

export const MAX_COMMENT_LENGTH = 5000;
const MAX_REVIEWERS = 5;

const MENU_LINE =
	'Menu bijwerken: deze wijziging voegt een nieuwe pagina toe; de navigatie moet nog door de redactie worden aangepast.';

export interface ActingUser {
	sub: string;
	/** Every identity the user can hold; the PR is theirs when its trailer matches one. */
	identities: Identity[];
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
	if (!sameRepo(pr.headRepo, site.repo) || pr.baseRef !== site.standaardbranch) {
		return { owner: false, editorial: false };
	}
	return {
		owner: isOwnTrailer(identityFromPrBody(pr.body), user.identities),
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
	body: string,
	author: CommentAuthor
): Promise<void> {
	const clean = cleanComment(body);
	if (clean === null) throw new RangeError('Reactie is leeg of te lang');
	await forge.comment(site.repo, number, commentBody(clean, author));
}

/** The editors' request for an adjustment: their comment, and the label that hands the proposal back to its writer. */
export async function askForAdjustment(
	forge: Forge,
	site: SiteConfig,
	pr: PrSummary,
	body: string,
	author: Omit<CommentAuthor, 'kind'>
): Promise<void> {
	const clean = cleanComment(body);
	if (clean === null) throw new RangeError('Reactie is leeg of te lang');
	const labels = [...new Set([...pr.labels, ADJUSTMENT_LABEL])];
	await forge.setLabels(site.repo, pr.number, labels);
	try {
		await forge.comment(
			site.repo,
			pr.number,
			commentBody(clean, { ...author, kind: 'aanpassing' })
		);
	} catch (e) {
		await forge.setLabels(site.repo, pr.number, pr.labels).catch((err) =>
			log.warn('proposal.label_restore_failed', {
				site: site.id,
				pr: pr.number,
				...errorFields(err)
			})
		);
		throw e;
	}
}

/** Hands the proposal back to the editors. A request for changes in a review on GitHub stays until it is reviewed again there. */
export async function sendInAgain(
	forge: Forge,
	site: SiteConfig,
	pr: PrSummary
): Promise<{ warning?: string }> {
	await forge.setLabels(
		site.repo,
		pr.number,
		pr.labels.filter((label) => label !== ADJUSTMENT_LABEL)
	);
	return pr.reviewState === 'changes_requested'
		? {
				warning:
					'Op GitHub vraagt iemand nog om een aanpassing. Die beoordeelt het voorstel daar opnieuw.'
			}
		: {};
}

const UNCHECKED =
	'Niet samengevoegd: Schrijver kan niet nagaan of een afbeelding die dit voorstel verwijdert nog op een pagina staat. Voeg samen op GitHub.';
const SHOWN_UNCHECKED =
	'Niet samengevoegd: Schrijver kan niet nagaan of elke afbeelding die dit voorstel toont na het samenvoegen nog bestaat. Voeg samen op GitHub.';

/**
 * Refuses the merge while a page would show an image that is not there after it: one the pull request
 * removes, or one it shows that is on neither the base branch nor among its own files.
 */
async function refuseBrokenImages(forge: Forge, site: SiteConfig, pr: PrSummary) {
	const files = await forge.prFiles(site.repo, pr.number);
	if (files.length >= MAX_PR_FILES) throw new ForgeError(422, UNCHECKED);
	const scan = await usageAfterMerge(forge, site, pr, files);
	const used = scan.images.find((image) => image.usedOn.length > 0);
	if (used) {
		const name = used.path.slice(used.path.lastIndexOf('/') + 1);
		const sure = used.usedOn.filter((page) => !page.possible);
		const pages = new Intl.ListFormat('nl', { type: 'conjunction' }).format(
			(sure.length > 0 ? sure : used.usedOn).map((page) => page.path)
		);
		const where = sure.length > 0 ? `staat nog op ${pages}` : `wordt mogelijk gebruikt op ${pages}`;
		throw new ForgeError(
			422,
			`Niet samengevoegd: dit voorstel verwijdert ${name}, maar die afbeelding ${where}.`
		);
	}
	if (!scan.complete) throw new ForgeError(422, UNCHECKED);
	const shown = await missingAfterMerge(forge, site, pr, files);
	const [first] = shown.missing;
	if (first) {
		const name = first.image.slice(first.image.lastIndexOf('/') + 1);
		throw new ForgeError(
			422,
			`Niet samengevoegd: ${first.page} toont ${name}, maar die afbeelding ontbreekt. Zet de afbeelding terug of haal de verwijzing weg.`
		);
	}
	if (!shown.complete) throw new ForgeError(422, SHOWN_UNCHECKED);
}

export async function mergeProposal(
	forge: Forge,
	site: SiteConfig,
	pr: PrSummary,
	commitsTrailers: string[],
	sha?: string
): Promise<void> {
	await refuseBrokenImages(forge, site, pr);
	const trailers = [...new Set(commitsTrailers)];
	const message = `${pr.title} (#${pr.number})${trailers.length > 0 ? `\n\n${trailers.join('\n')}` : ''}`;
	await forge.merge(site.repo, pr.number, message, sha);
}
