import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { identitiesFor, identityFor } from '$lib/auth/identity';
import { canAct } from '$lib/forge/proposal-actions';
import { isSentIn, toProposal } from '$lib/forge/proposals';
import { sourceDiff } from '$lib/content/source-diff';
import { sameRepo } from '$lib/forge/repo';
import { identityFromPrBody } from '$lib/forge/trailers';
import { ForgeError } from '$lib/forge/types';
import { getConfigStore, getForge } from '$lib/server/services';

const decoder = new TextDecoder();
const IMAGE = /\.(png|jpe?g|webp|svg|gif|avif)$/i;
/** Bounds on one page view: how many pages are compared, and how large a page may be to be compared at all. */
const MAX_DIFF_PAGES = 20;
const MAX_PAGE_BYTES = 500_000;
const TE_GROOT = Symbol('te groot');

export const load: PageServerLoad = async ({ params, locals }) => {
	const site = getConfigStore().site(params.site);
	const nummer = Number(params.nummer);
	if (!site || !Number.isInteger(nummer) || nummer <= 0) error(404, 'Voorstel niet gevonden');
	const forge = getForge();
	const { session, prefs } = locals.user!;
	const identity = identityFor(prefs, session, site);
	const identities = identitiesFor(prefs, session);

	try {
		const pr = await forge.getPr(site.repo, nummer);
		const files = await forge.prFiles(site.repo, nummer);
		const proposal = toProposal(pr, files, site, identities);
		const fromFork = !sameRepo(pr.headRepo, site.repo);
		const text = async (ref: string, path: string) => {
			const file = await forge.readFile(site.repo, ref, path, { maxBytes: MAX_PAGE_BYTES });
			if (file?.tooLarge) return TE_GROOT;
			return file ? decoder.decode(file.content) : null;
		};
		// Read the head by commit, so what is shown is exactly what a pinned merge would merge.
		const head = pr.headSha || pr.headRef;
		const pages = fromFork
			? []
			: files
					.filter((f) => proposal.pages.includes(f.path))
					.sort((a, b) => a.path.localeCompare(b.path));
		const diffs = await Promise.all(
			pages.slice(0, MAX_DIFF_PAGES).map(async (f) => {
				const before = f.status === 'added' ? null : await text(pr.baseRef, f.path);
				const after = f.status === 'removed' ? null : await text(head, f.path);
				if (before === TE_GROOT || after === TE_GROOT) {
					return {
						path: f.path,
						status: f.status,
						teGroot: true,
						before: null,
						after: null,
						source: []
					};
				}
				return {
					path: f.path,
					status: f.status,
					teGroot: false,
					before,
					after,
					source: sourceDiff(before, after)
				};
			})
		);
		const changedFiles = files
			.map((f) => ({
				path: f.path,
				status: f.status,
				kind: proposal.pages.includes(f.path)
					? 'pagina'
					: IMAGE.test(f.path)
						? 'afbeelding'
						: 'ander'
			}))
			.sort((a, b) => a.path.localeCompare(b.path));
		const acts = await canAct(
			{
				identities,
				email: session.email,
				emailVerified: session.emailVerified,
				githubLogin: prefs.githubLogin,
				identityKind: identity.kind
			},
			site,
			pr,
			forge
		);
		return {
			site: { id: site.id, naam: site.naam },
			proposal,
			diffs,
			nietVergeleken: Math.max(pages.length - MAX_DIFF_PAGES, 0),
			changedFiles,
			fromFork,
			headSha: pr.headSha,
			viaGithub: identityFromPrBody(pr.body) === null,
			githubUrl: pr.url,
			notMergeable: pr.state === 'open' && pr.mergeable === false,
			verderBewerken: acts.owner || acts.editorial ? proposal.verderBewerken : [],
			canSendIn: pr.state === 'open' && !isSentIn(pr) && (acts.owner || acts.editorial),
			canComment: pr.state === 'open' && acts.editorial,
			canMerge:
				pr.state === 'open' &&
				isSentIn(pr) &&
				acts.editorial &&
				site.review['mergen-vanuit-schrijver']
		};
	} catch (e) {
		if (e instanceof ForgeError && e.status === 404) error(404, 'Voorstel niet gevonden');
		throw e;
	}
};
