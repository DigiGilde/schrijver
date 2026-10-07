import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listLinkedLogins } from '$lib/auth/users';
import { pickReviewers, sendIn } from '$lib/forge/proposal-actions';
import { isSentIn } from '$lib/forge/proposals';
import { log } from '$lib/log';
import { proposalAction, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction('insturen', async ({ site, forge, pr, acts, user }) => {
	if (!acts.owner && !acts.editorial) return refuse(403, 'Dit voorstel is niet van jou');
	if (pr.state !== 'open' || isSentIn(pr)) return refuse(409, 'Dit voorstel is al ingestuurd');
	const files = await forge.prFiles(site.repo, pr.number);
	const pages = files
		.map((f) => f.path)
		.filter((p) => p.endsWith('.md') && p.startsWith(site.content.pad + '/'));
	let reviewers: string[] = [];
	try {
		/* A linked login is already public in the trailer; an anonymous or named author must stay out of the list. */
		const exclude = user.identityKind === 'gekoppeld' ? user.githubLogin : null;
		reviewers = await pickReviewers(forge, site, await listLinkedLogins(20), exclude);
	} catch (err) {
		log.warn('proposal.reviewers_failed', { site: site.id, reason: String(err) });
	}
	const { warning } = await sendIn(forge, site, pr, {
		reviewers,
		filesAdded: files.some((f) => f.status === 'added' && f.path.endsWith('.md')),
		pages
	});
	return json({ ok: true, ...(warning ? { warning } : {}) });
});
