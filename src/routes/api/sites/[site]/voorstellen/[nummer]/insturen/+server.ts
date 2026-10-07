import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listLinkedLogins } from '$lib/auth/users';
import { sendIn } from '$lib/forge/proposal-actions';
import { log } from '$lib/log';
import { proposalAction, refuse, type ProposalContext } from '$lib/server/proposal-route';

const MAX_REVIEWERS = 5;

async function reviewers({ site, forge, user }: ProposalContext): Promise<string[]> {
	try {
		const logins = (await listLinkedLogins(50)).filter((l) => l !== user.githubLogin);
		const found: string[] = [];
		for (const login of logins) {
			if (found.length >= MAX_REVIEWERS) break;
			const permission = await forge.collaboratorPermission(site.repo, login);
			if (permission === 'admin' || permission === 'write') found.push(login);
		}
		return found;
	} catch (err) {
		log.warn('proposal.reviewers_failed', { site: site.id, reason: String(err) });
		return [];
	}
}

export const POST: RequestHandler = proposalAction('insturen', async (ctx) => {
	const { site, forge, pr, acts } = ctx;
	if (!acts.owner && !acts.editorial) return refuse(403, 'Dit voorstel is niet van jou');
	if (pr.state !== 'open' || !pr.draft) return refuse(409, 'Dit voorstel is al ingestuurd');
	const files = await forge.prFiles(site.repo, pr.number);
	const pages = files
		.map((f) => f.path)
		.filter((p) => p.endsWith('.md') && p.startsWith(site.content.pad + '/'));
	await sendIn(forge, site, pr, {
		reviewers: await reviewers(ctx),
		filesAdded: files.some((f) => f.status === 'added'),
		pages
	});
	return json({ ok: true });
});
