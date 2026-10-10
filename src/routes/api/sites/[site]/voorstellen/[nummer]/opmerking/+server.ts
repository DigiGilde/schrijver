import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanComment, commentProposal } from '$lib/forge/proposal-actions';
import { proposalAction, readJson, refuse } from '$lib/server/proposal-route';

export const POST: RequestHandler = proposalAction(
	'opmerking',
	async ({ site, forge, pr, acts, identity }, { request }) => {
		if (!acts.owner && !acts.editorial)
			return refuse(403, 'Alleen de schrijver en de redactie kunnen hier reageren');
		if (pr.state !== 'open') return refuse(409, 'Dit voorstel is niet meer open');
		const body = cleanComment((await readJson(request))?.body);
		if (body === null) return refuse(400, 'Schrijf een reactie van maximaal 5000 tekens');
		await commentProposal(forge, site, pr.number, body, {
			identity,
			role: acts.owner ? 'schrijver' : 'redactie',
			kind: 'reactie'
		});
		return json({ ok: true });
	}
);
