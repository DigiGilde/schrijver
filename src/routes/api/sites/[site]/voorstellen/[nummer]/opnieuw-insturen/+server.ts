import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendInAgain } from '$lib/forge/proposal-actions';
import { statusOf } from '$lib/forge/proposals';
import { proposalAction, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction(
	'opnieuw-insturen',
	async ({ site, forge, pr, acts }) => {
		if (!acts.owner && !acts.editorial) return refuse(403, 'Dit voorstel is niet van jou');
		if (pr.state !== 'open') return refuse(409, 'Dit voorstel is niet meer open');
		if (statusOf(pr) !== 'aanpassing-gevraagd')
			return refuse(409, 'Er is geen aanpassing gevraagd');
		const { warning } = await sendInAgain(forge, site, pr);
		return json({ ok: true, ...(warning ? { warning } : {}) });
	}
);
