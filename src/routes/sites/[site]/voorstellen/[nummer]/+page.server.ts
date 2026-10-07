import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { identityFor } from '$lib/auth/identity';
import { canAct } from '$lib/forge/proposal-actions';
import { toProposal } from '$lib/forge/proposals';
import { identityFromPrBody, identityTrailer } from '$lib/forge/trailers';
import { ForgeError } from '$lib/forge/types';
import { getConfigStore, getForge } from '$lib/server/services';

const decoder = new TextDecoder();

export const load: PageServerLoad = async ({ params, locals }) => {
	const site = getConfigStore().site(params.site);
	const nummer = Number(params.nummer);
	if (!site || !Number.isInteger(nummer) || nummer <= 0) error(404, 'Voorstel niet gevonden');
	const forge = getForge();
	const { session, prefs } = locals.user!;
	const trailer = identityTrailer(identityFor(prefs, session));

	try {
		const pr = await forge.getPr(site.repo, nummer);
		const files = await forge.prFiles(site.repo, nummer);
		const proposal = toProposal(pr, files, site, trailer);
		const text = async (ref: string, path: string) => {
			const file = await forge.readFile(site.repo, ref, path);
			return file ? decoder.decode(file.content) : null;
		};
		const diffs = await Promise.all(
			files
				.filter((f) => proposal.pages.includes(f.path))
				.sort((a, b) => a.path.localeCompare(b.path))
				.map(async (f) => ({
					path: f.path,
					before: f.status === 'added' ? null : await text(pr.baseRef, f.path),
					after: f.status === 'removed' ? null : await text(pr.headRef, f.path)
				}))
		);
		const acts = await canAct(
			{ trailer, email: session.email, emailVerified: session.emailVerified, githubLogin: prefs.githubLogin },
			site,
			pr,
			forge
		);
		return {
			site: { id: site.id, naam: site.naam },
			proposal,
			diffs,
			viaGithub: identityFromPrBody(pr.body) === null,
			githubUrl: pr.url,
			canSendIn: pr.state === 'open' && pr.draft && (acts.owner || acts.editorial),
			canReview: pr.state === 'open' && !pr.draft && acts.editorial,
			canMerge:
				pr.state === 'open' && !pr.draft && acts.editorial && site.review['mergen-vanuit-schrijver']
		};
	} catch (e) {
		if (e instanceof ForgeError && e.status === 404) error(404, 'Voorstel niet gevonden');
		throw e;
	}
};
