import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSite } from '$lib/auth/roles';
import { recordedWriters } from '$lib/auth/team-store';
import { authorship, fourEyes } from '$lib/forge/authorship';
import { appAccount, mergeProposal } from '$lib/forge/proposal-actions';
import { isSentIn } from '$lib/forge/proposals';
import { sameRepo } from '$lib/forge/repo';
import { FOUR_EYES } from '$lib/forge/status';
import { trailersFromMessage } from '$lib/forge/trailers';
import { ForgeError, type ReviewDecision } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { proposalAction, readJson, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction(
	'mergen',
	async ({ site, settings, forge, pr, acts, user }, { request }) => {
		if (!pr.headRepo || !sameRepo(pr.headRepo, site.repo) || pr.baseRef !== site.standaardbranch) {
			return refuse(403, 'Dit voorstel kan alleen op GitHub worden samengevoegd.');
		}
		if (!acts.editorial) return refuse(403, 'Alleen de redactie kan samenvoegen');
		if (!settings.mergenVanuitSchrijver) {
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
		if (settings.vierOgen) {
			const [writers, app] = await Promise.all([
				recordedWriters(site.id, pr.number),
				appAccount(forge)
			]);
			const reason = writers
				? fourEyes(authorship(pr, commits, user, { app, repo: site.repo, writers }))
				: 'onbekend';
			if (reason && !(await canManageSite(site, user, forge))) {
				return refuse(403, `${FOUR_EYES[reason]} Een ander lid van de redactie voegt het samen.`);
			}
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
