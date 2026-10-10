import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { identitiesFor, identityFor } from '$lib/auth/identity';
import { canManageSite } from '$lib/auth/roles';
import { recordedWriters, siteSettings } from '$lib/auth/team-store';
import type { SiteConfig } from '$lib/config/types';
import { parsePage } from '$lib/content/frontmatter';
import { pageTitle } from '$lib/content/schema-form';
import { sourceDiff } from '$lib/content/source-diff';
import { authorName, authorship, fourEyes } from '$lib/forge/authorship';
import { conversation } from '$lib/forge/conversation';
import { appAccount, canAct, type ActingUser } from '$lib/forge/proposal-actions';
import { toProposal } from '$lib/forge/proposals';
import { sameRepo } from '$lib/forge/repo';
import { FOUR_EYES, dateText, stepOf, whatNow } from '$lib/forge/status';
import { ForgeError, type Forge, type ReviewDecision } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { getConfigStore, getForge } from '$lib/server/services';
import { backToProposals } from '$lib/server/site-tabs';

const decoder = new TextDecoder();
const IMAGE = /\.(png|jpe?g|webp|svg|gif|avif)$/i;
/** Bounds on one page view: how many pages are compared, and how large a page may be to be compared at all. */
const MAX_DIFF_PAGES = 20;
const MAX_PAGE_BYTES = 500_000;
/** The line on the other files names at most this many. */
const MAX_OTHER_FILES = 20;
const TE_GROOT = Symbol('te groot');
const DONE = { added: 'toegevoegd', modified: 'gewijzigd', removed: 'verwijderd' } as const;

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

async function loadConversation(forge: Forge, site: SiteConfig, nummer: number) {
	try {
		const [comments, reviews] = await Promise.all([
			forge.prComments(site.repo, nummer),
			forge.prReviews(site.repo, nummer)
		]);
		const { items, complete } = conversation(comments, reviews);
		return { items, volledig: complete };
	} catch (err) {
		log.warn('proposal.conversation_failed', { site: site.id, pr: nummer, ...errorFields(err) });
		return null;
	}
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const store = getConfigStore();
	const site = store.site(params.site);
	const nummer = Number(params.nummer);
	if (!site || !Number.isInteger(nummer) || nummer <= 0) error(404, 'Voorstel niet gevonden');
	const forge = getForge();
	const settings = await siteSettings(site);
	const { session, prefs } = locals.user!;
	const user: ActingUser = {
		sub: session.sub,
		identities: identitiesFor(prefs, session),
		githubLogin: prefs.githubLogin,
		identityKind: identityFor(prefs, session, settings).kind
	};

	try {
		const pr = await forge.getPr(site.repo, nummer);
		const files = await forge.prFiles(site.repo, nummer);
		const proposal = toProposal(pr, files, site, user.identities);
		const fromFork = !sameRepo(pr.headRepo, site.repo);
		const outside = fromFork || pr.baseRef !== site.standaardbranch;
		const schema = store.schema(site.id);
		const text = async (ref: string, path: string) => {
			const file = await forge.readFile(site.repo, ref, path, { maxBytes: MAX_PAGE_BYTES });
			if (file?.tooLarge) return TE_GROOT;
			return file ? decoder.decode(file.content) : null;
		};
		const titleOf = (path: string, source: string | null) => {
			const page = source === null ? null : parsePage(source);
			return page?.ok ? pageTitle(schema, page.frontmatter, page.body, path) : fileName(path);
		};
		// Read the head by commit, so what is shown is exactly what a pinned merge would merge.
		const head = pr.headSha || pr.headRef;
		const pages = fromFork
			? []
			: files
					.filter((f) => proposal.pages.includes(f.path))
					.sort((a, b) => a.path.localeCompare(b.path));
		const [diffs, acts, app, gesprek, terug] = await Promise.all([
			Promise.all(
				pages.slice(0, MAX_DIFF_PAGES).map(async (f) => {
					const before = f.status === 'added' ? null : await text(pr.baseRef, f.path);
					const after = f.status === 'removed' ? null : await text(head, f.path);
					if (before === TE_GROOT || after === TE_GROOT) {
						return {
							path: f.path,
							titel: fileName(f.path),
							status: f.status,
							teGroot: true,
							before: null,
							after: null,
							source: []
						};
					}
					return {
						path: f.path,
						titel: titleOf(f.path, after ?? before),
						status: f.status,
						teGroot: false,
						before,
						after,
						source: sourceDiff(before, after)
					};
				})
			),
			canAct(user, site, pr, forge),
			appAccount(forge),
			loadConversation(forge, site, nummer),
			backToProposals(site, forge, url, locals.user!)
		]);
		const titles = new Map(diffs.map((d) => [d.path, d.titel]));
		const titleFor = (path: string) => titles.get(path) ?? fileName(path);

		const status = proposal.status;
		const deciding =
			acts.editorial && !outside && (status === 'ingestuurd' || status === 'goedgekeurd');
		let blocked: keyof typeof FOUR_EYES | null = null;
		if (deciding && settings.vierOgen) {
			const [commits, writers] = await Promise.all([
				forge.prCommits(site.repo, nummer).catch(() => null),
				recordedWriters(site.id, nummer)
			]);
			const reason =
				commits && writers
					? fourEyes(authorship(pr, commits, user, { app, repo: site.repo, writers }))
					: 'onbekend';
			if (reason && !(await canManageSite(site, user, forge))) blocked = reason;
		}
		const resending = acts.owner && !outside && status === 'aanpassing-gevraagd';
		let decision: ReviewDecision = null;
		if ((deciding && !blocked && settings.mergenVanuitSchrijver) || resending) {
			decision = await forge.reviewDecision(site.repo, nummer).catch((err) => {
				log.warn('proposal.review_decision_failed', {
					site: site.id,
					pr: nummer,
					...errorFields(err)
				});
				return null;
			});
		}
		const verderBewerken =
			acts.owner || acts.editorial
				? proposal.verderBewerken.map((link) => ({ ...link, titel: titleFor(link.page) }))
				: [];

		const day = dateText(pr.updatedAt);
		const ondertitel = [
			proposal.pages.length === 1
				? `Voor de pagina ${titleFor(proposal.pages[0])}`
				: proposal.pages.length > 1
					? `Voor ${proposal.pages.length} pagina's`
					: null,
			`van ${acts.owner ? 'jou' : authorName(pr, app)}`,
			day ? `bijgewerkt ${day}` : null
		]
			.filter((part) => part !== null)
			.join(' · ');

		const others = files
			.filter((f) => !proposal.pages.includes(f.path))
			.sort((a, b) => a.path.localeCompare(b.path))
			.map((f) => ({
				soort: IMAGE.test(f.path) ? 'afbeelding' : 'bestand',
				naam: fileName(f.path),
				status: DONE[f.status]
			}));

		return {
			site: { id: site.id, naam: settings.naam, adres: settings.adres },
			terug,
			proposal,
			ondertitel: ondertitel[0].toUpperCase() + ondertitel.slice(1),
			stap: stepOf(status),
			watNu: whatNow({
				status,
				writer: acts.owner,
				editor: acts.editorial,
				blocked,
				outside,
				mergeInSchrijver: settings.mergenVanuitSchrijver,
				approvalRequired: decision !== null,
				approvalMissing: decision === 'review_required' || decision === 'changes_requested',
				// An editor outside the team is one through write permission on GitHub; the team does not say.
				actsOnGitHub: user.githubLogin !== null,
				canEdit: verderBewerken.length > 0,
				mergedAt: pr.mergedAt ?? null,
				siteAddress: !!settings.adres
			}),
			voorbeeld: proposal.previewUrl
				? {
						url: proposal.previewUrl,
						stand:
							proposal.checks === 'pending'
								? ('bezig' as const)
								: proposal.checks === 'failure'
									? ('mislukt' as const)
									: ('klaar' as const)
					}
				: null,
			verderBewerken,
			diffs,
			nietVergeleken: Math.max(pages.length - MAX_DIFF_PAGES, 0),
			andereBestanden: others.slice(0, MAX_OTHER_FILES),
			nogMeerBestanden: Math.max(others.length - MAX_OTHER_FILES, 0),
			fromFork,
			headSha: pr.headSha,
			imageRefs: { before: pr.baseRef },
			githubUrl: pr.url,
			notMergeable: pr.state === 'open' && pr.mergeable === false,
			gesprek,
			kanReageren: pr.state === 'open' && (acts.owner || acts.editorial)
		};
	} catch (e) {
		if (e instanceof ForgeError && e.status === 404) error(404, 'Voorstel niet gevonden');
		throw e;
	}
};
