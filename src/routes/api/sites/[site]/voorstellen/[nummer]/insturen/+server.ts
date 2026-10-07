import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listLinkedLogins } from '$lib/auth/users';
import { pickReviewers, sendIn } from '$lib/forge/proposal-actions';
import { isSentIn } from '$lib/forge/proposals';
import { identityFromPrBody } from '$lib/forge/trailers';
import { errorFields, log } from '$lib/log';
import { proposalAction, refuse } from '$lib/server/proposal-route';

const LINKED_LOGIN = /<\d+\+([^@>]+)@users\.noreply\.github\.com>/;

export const POST: RequestHandler = proposalAction('insturen', async ({ site, forge, pr, acts, user }) => {
	if (!acts.owner && !acts.editorial) return refuse(403, 'Dit voorstel is niet van jou');
	if (pr.state !== 'open' || isSentIn(pr)) return refuse(409, 'Dit voorstel is al ingestuurd');
	const files = await forge.prFiles(site.repo, pr.number);
	const pages = files
		.map((f) => f.path)
		.filter((p) => p.endsWith('.md') && p.startsWith(site.content.pad + '/'));
	const author = identityFromPrBody(pr.body) ?? '';
	let reviewers: string[] = [];
	if (author.startsWith('Schrijver-Auteur: ')) {
		// Any login in the reviewer list could be the anonymous author's own, which would reveal them.
		log.info('proposal.reviewers_skipped_anonymous', { site: site.id, pr: pr.number });
	} else {
		try {
			/*
			 * A linked author's login is public in the trailer already, so only that login is left out;
			 * a named author has no login in public view, so nothing is. The pool is the most recently
			 * linked logins, not the site's redactie: prefs hold no e-mail to match `redactie` against,
			 * so pickReviewers keeps only logins with push access to the repository.
			 */
			const exclude =
				author.match(LINKED_LOGIN)?.[1] ?? (user.identityKind === 'gekoppeld' ? user.githubLogin : null);
			reviewers = await pickReviewers(forge, site, await listLinkedLogins(20), exclude);
		} catch (err) {
			log.warn('proposal.reviewers_failed', { site: site.id, ...errorFields(err) });
		}
	}
	const { warning } = await sendIn(forge, site, pr, {
		reviewers,
		filesAdded: files.some((f) => f.status === 'added' && f.path.endsWith('.md')),
		pages
	});
	return json({ ok: true, ...(warning ? { warning } : {}) });
});
