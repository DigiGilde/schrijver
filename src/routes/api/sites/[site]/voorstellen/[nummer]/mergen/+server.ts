import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { canManageSite } from '$lib/auth/roles';
import { forgetWriters, recordedWriters } from '$lib/auth/team-store';
import { authorship, fourEyes } from '$lib/forge/authorship';
import { appAccount, mergeProposal } from '$lib/forge/proposal-actions';
import { isSentIn } from '$lib/forge/proposals';
import { sameRepo } from '$lib/forge/repo';
import { FOUR_EYES, FOUR_EYES_UNKNOWN, NOT_MERGEABLE, TOO_MANY_COMMITS } from '$lib/forge/status';
import { trailersFromMessage } from '$lib/forge/trailers';
import { ForgeError, MAX_PR_COMMITS, type ReviewDecision } from '$lib/forge/types';
import { errorFields, log } from '$lib/log';
import { proposalAction, readJson, refuse } from '$lib/server/proposal-route';

const NEW_VERSION =
	'Er is intussen een nieuwe versie van dit voorstel. Laad de pagina opnieuw en bekijk de wijzigingen.';

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
		if (commits.length >= MAX_PR_COMMITS)
			return refuse(422, `${TOO_MANY_COMMITS} Voeg het samen op GitHub.`);
		// The merge is of the head the reader saw and four eyes read the commits of, or none at all.
		if (sha !== pr.headSha || commits.at(-1)?.sha !== sha) return refuse(409, NEW_VERSION);
		if (settings.vierOgen) {
			const [writers, app] = await Promise.all([
				recordedWriters(site.id, pr.number),
				appAccount(forge)
			]);
			const reason = writers
				? fourEyes(authorship(pr, commits, user, { app, repo: site.repo, writers }))
				: 'onbekend';
			if (reason && !(await canManageSite(site, user, forge))) {
				const instead =
					reason === 'onbekend'
						? FOUR_EYES_UNKNOWN
						: 'Een ander lid van de redactie voegt het samen.';
				return refuse(403, `${FOUR_EYES[reason]} ${instead}`);
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
				return refuse(409, NEW_VERSION, e.detail);
			}
			if (e instanceof ForgeError && e.status === 405 && /not mergeable/i.test(e.detail ?? '')) {
				return refuse(405, NOT_MERGEABLE);
			}
			throw e;
		}
		await forgetWriters(site.id, pr.number);
		return json({ ok: true });
	}
);
