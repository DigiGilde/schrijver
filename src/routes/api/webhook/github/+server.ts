import { createHmac, timingSafeEqual } from 'node:crypto';
import { movedColumns } from '$lib/auth/team';
import { teamStore } from '$lib/auth/team-store';
import { CachingForge } from '$lib/forge/cache';
import { errorFields, log } from '$lib/log';
import { getForge, reloadSite } from '$lib/server/services';
import type { RequestHandler } from './$types';

function validSignature(secret: string | undefined, body: Buffer, header: string | null): boolean {
	if (!secret || !header) return false;
	const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(body).digest('hex'));
	const given = Buffer.from(header);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

const isBlock = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const REPO = /^[\w.-]+\/[\w.-]+$/;
/** A branch name as a ref allows it, roughly: no spaces, no `..`, none of ~^:?*[\ or control characters. */
const BRANCH = /^(?!.*\.\.)[^\s~^:?*[\\\u0000-\u001f\u007f]{1,255}$/;

/** A push to the default branch of a registered repository reloads that site's structure. */
async function pushed(payload: Record<string, unknown>, repository: Record<string, unknown>) {
	const { id, full_name: repo, default_branch: branch } = repository;
	if (!Number.isSafeInteger(id) || typeof repo !== 'string' || typeof branch !== 'string') return;
	if (!REPO.test(repo) || !BRANCH.test(branch) || payload.ref !== `refs/heads/${branch}`) return;
	const team = teamStore();
	const site = (await team.sites()).find((s) => s.repoId === id);
	if (!site) return;
	const forge = getForge();
	if (forge instanceof CachingForge) forge.invalidate(site.repo);
	if (movedColumns(site, { repo, standaardbranch: branch }).length > 0) {
		await team.moveSite(site.id, repo, branch);
		log.info('webhook.site_moved', { site: site.id });
	}
	await reloadSite(site.id);
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
	let payload: unknown = null;
	try {
		payload = JSON.parse(body);
	} catch {
		// unparseable payload: acknowledge without acting
	}
	const repository = isBlock(payload) && isBlock(payload.repository) ? payload.repository : null;
	const repo = typeof repository?.full_name === 'string' ? repository.full_name : '';
	log.info('webhook.received', { githubEvent: event, repo });

	if (repo && (event === 'push' || event === 'pull_request')) {
		const forge = getForge();
		if (forge instanceof CachingForge) forge.invalidate(repo);
	}
	if (event === 'push' && isBlock(payload) && repository) {
		try {
			await pushed(payload, repository);
		} catch (err) {
			// GitHub shows a failed delivery, from where it can be sent again.
			log.error('webhook.reload_failed', { repo, ...errorFields(err) });
			return new Response(null, { status: 503 });
		}
	}
	return new Response(null, { status: 204 });
};
