import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanComment, commentProposal } from '$lib/forge/proposal-actions';
import { proposalAction, readJson, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction('opmerking', async ({ site, forge, pr, acts }, { request }) => {
	if (!acts.editorial) return refuse(403, 'Alleen de redactie kan een opmerking plaatsen');
	const body = cleanComment((await readJson(request))?.body);
	if (body === null) return refuse(400, 'Schrijf een opmerking van maximaal 5000 tekens');
	await commentProposal(forge, site, pr.number, body);
	return json({ ok: true });
});
