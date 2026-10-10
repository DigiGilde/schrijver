import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isEditorial } from '$lib/auth/editorial';
import { identitiesFor } from '$lib/auth/identity';
import { siteSettings } from '$lib/auth/team-store';
import { toProposal, type Proposal } from '$lib/forge/proposals';
import { forReview } from '$lib/forge/status';
import { errorFields, log } from '$lib/log';
import { getConfigStore, getForge } from '$lib/server/services';
import { filterOf, ownForReview, siteHeader } from '$lib/server/site-tabs';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const site = getConfigStore().site(params.site);
	if (!site) error(404, 'Site niet gevonden');
	const forge = getForge();
	const { session, prefs } = locals.user!;

	let proposals: Proposal[] = [];
	let proposalsError = false;
	try {
		const mine = identitiesFor(prefs, session);
		const prs = await forge.listPrs(site.repo, 'open');
		proposals = await Promise.all(
			prs.map(async (pr) => toProposal(pr, await forge.prFiles(site.repo, pr.number), site, mine))
		);
		proposals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	} catch (err) {
		log.warn('proposals.list_failed', { site: site.id, ...errorFields(err) });
		proposalsError = true;
	}

	const user = { sub: session.sub, githubLogin: prefs.githubLogin };
	const editorial = await isEditorial(site, user, forge);
	const own = editorial && !proposalsError && (await ownForReview(site, user, forge, proposals));

	return {
		site: siteHeader(await siteSettings(site)),
		proposals,
		proposalsError,
		editorial,
		ownForReview: own,
		wachtend: editorial && !proposalsError ? forReview(proposals, own).length : null,
		filter: filterOf(url.searchParams.get('filter'), editorial)
	};
};
