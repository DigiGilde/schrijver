import { createHmac, timingSafeEqual } from 'node:crypto';
import { CachingForge } from '$lib/forge/cache';
import { sameRepo } from '$lib/forge/repo';
import { log } from '$lib/log';
import { configRepoName, getForge, reloadConfig } from '$lib/server/services';
import type { RequestHandler } from './$types';

function validSignature(secret: string | undefined, body: Buffer, header: string | null): boolean {
	if (!secret || !header) return false;
	const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
	const given = Buffer.from(header);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

export const POST: RequestHandler = async ({ request }) => {
	const raw = Buffer.from(await request.arrayBuffer());
	const body = raw.toString('utf8');
	if (
		!validSignature(
			process.env.GITHUB_WEBHOOK_SECRET,
			raw,
			request.headers.get('x-hub-signature-256')
		)
	) {
		return new Response(null, { status: 401 });
	}

	const event = request.headers.get('x-github-event') ?? '';
	let repo = '';
	try {
		const name = JSON.parse(body)?.repository?.full_name;
		if (typeof name === 'string') repo = name;
	} catch {
		// unparseable payload: acknowledge without acting
	}
	log.info('webhook.received', { githubEvent: event, repo });

	if (repo && (event === 'push' || event === 'pull_request')) {
		const forge = getForge();
		if (forge instanceof CachingForge) forge.invalidate(repo);
		if (event === 'push' && sameRepo(repo, configRepoName())) await reloadConfig();
	}
	return new Response(null, { status: 204 });
};
