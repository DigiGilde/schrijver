import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isEditorial } from '$lib/auth/editorial';
import { statusOf } from '$lib/forge/proposals';
import { waitsForReview } from '$lib/forge/status';
import { errorFields, log } from '$lib/log';
import { getRepoVisibility } from '$lib/server/repo-visibility';
import { configRepoName, getConfigStore, getForge } from '$lib/server/services';
import { siteHeader } from '$lib/server/site-tabs';

const KINDS = ['anoniem', 'gekoppeld', 'op-naam'] as const;

const configRepo = () => {
	try {
		return configRepoName();
	} catch {
		return null;
	}
};

export const load: PageServerLoad = async ({ params, locals }) => {
	const site = getConfigStore().site(params.site);
	if (!site) error(404, 'Site niet gevonden');
	const forge = getForge();
	const { session, prefs } = locals.user!;

	const editorial = await isEditorial(
		site,
		{ email: session.email, emailVerified: session.emailVerified, githubLogin: prefs.githubLogin },
		forge
	);
	let wachtend: number | null = null;
	if (editorial) {
		try {
			const prs = await forge.listPrs(site.repo, 'open');
			wachtend = prs.filter((pr) => waitsForReview(statusOf(pr))).length;
		} catch (err) {
			log.warn('proposals.list_failed', { site: site.id, ...errorFields(err) });
		}
	}

	const branch = site.standaardbranch;
	return {
		site: siteHeader(site),
		wachtend,
		redactie: site.review.redactie,
		mergenVanuitSchrijver: site.review['mergen-vanuit-schrijver'],
		// Anoniem is always possible: a choice the site does not allow falls back towards it.
		ondertekenen: KINDS.filter((k) => k === 'anoniem' || site.identiteit.toegestaan.includes(k)),
		conceptenOpenbaar: site.concepten === 'openbaar' && (await getRepoVisibility(site.repo)),
		voorbeeld: site.preview.soort,
		repo: site.repo,
		branch,
		repoUrl: `https://github.com/${site.repo}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`,
		configuratie: configRepo()
	};
};
