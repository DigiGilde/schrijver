import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { askForAdjustment, cleanComment } from '$lib/forge/proposal-actions';
import { isSentIn } from '$lib/forge/proposals';
import { proposalAction, readJson, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction(
	'aanpassing',
	async ({ site, forge, pr, acts, identity }, { request }) => {
		if (!acts.editorial) return refuse(403, 'Alleen de redactie kan om een aanpassing vragen');
		if (pr.state !== 'open') return refuse(409, 'Dit voorstel is niet meer open');
		if (!isSentIn(pr)) return refuse(409, 'Dit voorstel is nog niet ingestuurd');
		const body = cleanComment((await readJson(request))?.body);
		if (body === null) return refuse(400, 'Schrijf wat er anders moet, in maximaal 5000 tekens');
		await askForAdjustment(forge, site, pr, body, { identity, role: 'redactie' });
		return json({ ok: true });
	}
);
