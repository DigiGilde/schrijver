import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSiteAdmin } from '$lib/auth/admin';
import { mergeProposal, wroteAlong } from '$lib/forge/proposal-actions';
import { isSentIn } from '$lib/forge/proposals';
import { trailersFromMessage } from '$lib/forge/trailers';
import { ForgeError, type ReviewDecision } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { proposalAction, readJson, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction(
	'mergen',
	async ({ site, forge, pr, acts, user }, { request }) => {
		if (!acts.editorial) return refuse(403, 'Alleen de redactie kan samenvoegen');
		if (!site.review['mergen-vanuit-schrijver']) {
			return refuse(
				403,
				'Samenvoegen vanuit Schrijver staat voor deze site uit; voeg samen op GitHub'
			);
		}
		if (pr.state !== 'open' || !isSentIn(pr))
			return refuse(409, 'Dit voorstel is nog niet ingestuurd');
		const sha = (await readJson(request))?.sha;
		if (typeof sha !== 'string' || !/^[0-9a-f]{7,64}$/.test(sha)) {
			return refuse(400, 'Laad de pagina opnieuw en bekijk de wijzigingen voordat je samenvoegt');
		}
		const commits = await forge.prCommits(site.repo, pr.number);
		const along = !acts.owner && wroteAlong(commits, user.identities);
		if (
			site.review['vier-ogen'] &&
			(acts.owner || along) &&
			!(await isSiteAdmin(site, user, forge))
		) {
			return refuse(
				403,
				`${acts.owner ? 'Je schreef dit voorstel zelf.' : 'Je schreef mee aan dit voorstel.'} Een ander lid van de redactie voegt het samen.`
			);
		}
		let decision: ReviewDecision = null;
		try {
			decision = await forge.reviewDecision(site.repo, pr.number);
		} catch (err) {
			log.warn('proposal.review_decision_failed', {
				site: site.id,
				pr: pr.number,
				...errorFields(err)
			});
		}
		if (decision === 'review_required' || decision === 'changes_requested') {
			return refuse(
				409,
				'Deze site vraagt eerst een goedkeuring op GitHub. Daarna kun je hier samenvoegen.'
			);
		}
		try {
			await mergeProposal(
				forge,
				site,
				pr,
				commits.flatMap((c) => trailersFromMessage(c.message)),
				sha
			);
		} catch (e) {
			if (e instanceof ForgeError && e.status === 409) {
				return refuse(
					409,
					'Er is intussen een nieuwe versie van dit voorstel. Laad de pagina opnieuw en bekijk de wijzigingen.',
					e.detail
				);
			}
			throw e;
		}
		return json({ ok: true });
	}
);
