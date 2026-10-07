import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { approveProposal } from '$lib/forge/proposal-actions';
import { proposalAction, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction('goedkeuren', async ({ site, forge, pr, acts }) => {
	if (!acts.editorial) return refuse(403, 'Alleen de redactie kan goedkeuren');
	if (pr.state !== 'open' || pr.draft) return refuse(409, 'Dit voorstel is nog niet ingestuurd');
	await approveProposal(forge, site, pr.number, 'Goedgekeurd via Schrijver');
	return json({ ok: true });
});
