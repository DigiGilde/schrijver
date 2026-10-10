import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendInAgain } from '$lib/forge/proposal-actions';
import { statusOf } from '$lib/forge/proposals';
import { proposalAction, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction(
	'opnieuw-insturen',
	async ({ site, forge, pr, acts }) => {
		if (!acts.owner) return refuse(403, 'Alleen de schrijver kan dit voorstel opnieuw insturen');
		if (pr.state !== 'open') return refuse(409, 'Dit voorstel is niet meer open');
		if (statusOf(pr) !== 'aanpassing-gevraagd')
			return refuse(409, 'Er is geen aanpassing gevraagd');
		const { warning } = await sendInAgain(forge, site, pr);
		return json({ ok: true, ...(warning ? { warning } : {}) });
	}
);
