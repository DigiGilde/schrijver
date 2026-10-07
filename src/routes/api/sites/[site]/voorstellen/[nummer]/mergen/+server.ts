import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mergeProposal } from '$lib/forge/proposal-actions';
import { isSentIn } from '$lib/forge/proposals';
import { trailersFromMessage } from '$lib/forge/trailers';
import { ForgeError } from '$lib/forge/types';
import { proposalAction, readJson, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction('mergen', async ({ site, forge, pr, acts }, { request }) => {
	if (!acts.editorial) return refuse(403, 'Alleen de redactie kan samenvoegen');
	if (!site.review['mergen-vanuit-schrijver']) {
		return refuse(403, 'Samenvoegen vanuit Schrijver staat voor deze site uit; voeg samen op GitHub');
	}
	if (pr.state !== 'open' || !isSentIn(pr)) return refuse(409, 'Dit voorstel is nog niet ingestuurd');
	const sha = (await readJson(request))?.sha;
	if (typeof sha !== 'string' || !/^[0-9a-f]{7,64}$/.test(sha)) {
		return refuse(400, 'Laad de pagina opnieuw en bekijk de wijzigingen voordat je samenvoegt');
	}
	const commits = await forge.prCommits(site.repo, pr.number);
	try {
		await mergeProposal(forge, site, pr, commits.flatMap((c) => trailersFromMessage(c.message)), sha);
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
});
