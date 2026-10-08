import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../src/lib/auth/session';
import type { UserPrefs } from '../../src/lib/auth/users';
import { identityTrailer } from '../../src/lib/forge/trailers';
import type { FakeForge } from '../../src/lib/forge/fake';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { load } from '../../src/routes/sites/[site]/voorstellen/[nummer]/+page.server';

const REPO = 'DigiGilde/handboek';
let forge: FakeForge;

const session: Session = {
	sub: 'lezer',
	name: 'Lezer',
	email: 'iemand@example.org',
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
};
const prefs: UserPrefs = {
	sub: 'lezer',
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: true
};

interface Diff {
	path: string;
	teGroot: boolean;
	before: string | null;
	after: string | null;
}
interface Data {
	diffs: Diff[];
	nietVergeleken: number;
}

async function proposal(slug: string, files: Record<string, string>): Promise<number> {
	const branch = `schrijver/digi-handboek/${slug}`;
	await forge.createBranch(REPO, 'main', branch);
	await forge.commit(
		REPO,
		branch,
		Object.entries(files).map(([path, content]) => ({ path, content })),
		slug
	);
	const pr = await forge.openDraftPr(
		REPO,
		branch,
		'main',
		slug,
		identityTrailer({ kind: 'anoniem', pseudoniem: 'iemandanders' })
	);
	return pr.number;
}

async function visit(nummer: number): Promise<Data> {
	return (await load({
		params: { site: 'digi-handboek', nummer: String(nummer) },
		locals: { user: { session, prefs } }
	} as never)) as Data;
}

beforeAll(async () => {
	process.env.PSEUDONYM_SECRET = 'proposal-page-test-secret';
	const services = await buildFakeServices();
	forge = services.forge;
	setForge(forge);
	setConfigStore(services.store);
});

describe('proposal page load', () => {
	it('compares at most 20 pages and counts the rest', async () => {
		const files: Record<string, string> = {};
		for (let i = 0; i < 25; i++)
			files[`docs/veel/pagina-${String(i).padStart(2, '0')}.md`] = `# ${i}\n`;
		const data = await visit(await proposal('veel-aaaa', files));
		expect(data.diffs).toHaveLength(20);
		expect(data.nietVergeleken).toBe(5);
	});

	it('does not fetch or send a page above the size limit', async () => {
		const data = await visit(
			await proposal('groot-bbbb', { 'docs/groot.md': `# Groot\n\n${'x'.repeat(600_000)}\n` })
		);
		expect(data.diffs).toEqual([
			expect.objectContaining({ path: 'docs/groot.md', teGroot: true, before: null, after: null })
		]);
		expect(data.nietVergeleken).toBe(0);
	});
});
