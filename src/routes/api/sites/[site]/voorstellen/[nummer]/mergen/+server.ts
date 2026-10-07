import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mergeProposal } from '$lib/forge/proposal-actions';
import { trailersFromMessage } from '$lib/forge/trailers';
import { proposalAction, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction('mergen', async ({ site, forge, pr, acts }) => {
	if (!acts.editorial) return refuse(403, 'Alleen de redactie kan samenvoegen');
	if (!site.review['mergen-vanuit-schrijver']) {
		return refuse(403, 'Samenvoegen vanuit Schrijver staat voor deze site uit; voeg samen op GitHub');
	}
	if (pr.state !== 'open' || pr.draft) return refuse(409, 'Dit voorstel is nog niet ingestuurd');
	const commits = await forge.prCommits(site.repo, pr.number);
	await mergeProposal(forge, site, pr, commits.flatMap((c) => trailersFromMessage(c.message)));
	return json({ ok: true });
});
