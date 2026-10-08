import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const state = vi.hoisted(() => ({ forge: null as unknown }));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({
		site: (id: string) => [digi, moza].find((s) => s.id === id),
		schema: () => ({ titel: 'uit-h1' })
	}),
	getForge: () => state.forge
}));
vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { POST } from '../../src/routes/api/sites/[site]/afbeeldingsgebruik/+server';
import { log } from '../../src/lib/log';

process.env.PSEUDONYM_SECRET = 'afbeeldingsgebruik-test-secret';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const KAT = 'docs/afbeeldingen/privacy/kat.png';
const HOND = 'docs/afbeeldingen/privacy/hond.png';
const LOS = 'docs/kennis/los.png';
const BRANCH = 'schrijver/digi-handboek/privacy-abcd';
const GEHEIM = 'Alleen voor wie de pagina opent';
let forge: FakeForge;

beforeEach(async () => {
	vi.mocked(log.warn).mockClear();
	forge = new FakeForge();
	forge.seedRepo(digi.repo, 'main', {
		[KAT]: PNG,
		[HOND]: PNG,
		[LOS]: PNG,
		'docs/kennis/privacy.md': '# Privacy\n\n![Kat](../afbeeldingen/privacy/kat.png)\n',
		'docs/kennis/index.md': `# Kennis\n\n${GEHEIM}\n\n![Hond](../afbeeldingen/privacy/hond.png)\n`
	});
	await forge.createBranch(digi.repo, 'main', BRANCH);
	await forge.commit(
		digi.repo,
		BRANCH,
		[{ path: 'docs/kennis/index.md', content: '# Kennis\n' }],
		'x'
	);
	state.forge = forge;
});

function post(
	body: unknown,
	opts: { site?: string; user?: boolean; header?: string | null } = {}
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (opts.header !== null) headers['X-Requested-With'] = opts.header ?? 'Schrijver';
	return POST({
		request: new Request('http://x', { method: 'POST', headers, body: JSON.stringify(body) }),
		params: { site: opts.site ?? 'digi-handboek' },
		locals: { user: opts.user === false ? null : { session: { sub: 'jan' }, prefs: {} } }
	} as never) as Promise<Response>;
}

const good = { path: 'docs/kennis/privacy.md', branch: null, images: [KAT, HOND] };
const INVALID = { ok: false, error: { message: 'Ongeldig verzoek' } };

describe('POST /api/sites/[site]/afbeeldingsgebruik', () => {
	it('answers with page paths and titles only: which image may go, where the others stay', async () => {
		const res = await post(good);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			ok: true,
			images: [
				{ path: KAT, usedOn: [], deletable: true },
				{
					path: HOND,
					usedOn: [{ path: 'docs/kennis/index.md', title: 'Kennis' }],
					deletable: false
				}
			]
		});
	});

	it('reads the proposal branch and the default branch: a use on either keeps the image', async () => {
		await forge.commit(
			digi.repo,
			BRANCH,
			[
				{
					path: 'docs/kennis/nieuw.md',
					content: '# Nieuw\n\n![Kat](../afbeeldingen/privacy/kat.png)\n'
				}
			],
			'nieuw'
		);
		const res = await post({ ...good, branch: BRANCH });
		expect((await res.json()).images).toEqual([
			{ path: KAT, usedOn: [{ path: 'docs/kennis/nieuw.md', title: 'Nieuw' }], deletable: false },
			{ path: HOND, usedOn: [{ path: 'docs/kennis/index.md', title: 'Kennis' }], deletable: false }
		]);
	});

	it('never offers an image in the image folder of a page under content.uitsluiten', async () => {
		const team = 'content/documenten/presentaties/pulse/images/team.jpeg';
		forge.seedRepo(moza.repo, 'main', {
			[team]: PNG,
			'content/contact.md': '---\ntitle: Contact\n---\n\nTekst.\n'
		});
		const res = await post(
			{ path: 'content/contact.md', branch: null, images: [team] },
			{ site: 'moza-site' }
		);
		expect(await res.json()).toEqual({
			ok: true,
			images: [{ path: team, usedOn: [], deletable: false }]
		});
	});

	it('leaves out an image the folder does not hold', async () => {
		const res = await post({ ...good, images: ['docs/afbeeldingen/privacy/weg.png'] });
		expect(await res.json()).toEqual({ ok: true, images: [] });
	});

	it('refuses without a user, without the Schrijver header, or for an unknown site', async () => {
		expect((await post(good, { user: false })).status).toBe(401);
		expect((await post(good, { header: null })).status).toBe(403);
		expect((await post(good, { header: 'iets anders' })).status).toBe(403);
		expect((await post(good, { site: 'onbekend' })).status).toBe(404);
	});

	it('gives one plain 400 for any image path outside the image folder, there or not', async () => {
		for (const image of [
			LOS,
			'docs/kennis/weg.png',
			'docs/afbeeldingen/../kennis/los.png',
			'docs/afbeeldingen/privacy/../../kennis/los.png',
			`/${KAT}`,
			'docs/afbeeldingen/%2e%2e/kennis/los.png',
			'docs%2fafbeeldingen%2fprivacy%2fkat.png',
			['docs', 'afbeeldingen', 'privacy', 'kat.png'].join('\\'),
			`${KAT}${String.fromCharCode(0)}`,
			`docs/afbeeldingen/privacy/kat${String.fromCharCode(10)}.png`,
			'geheim/afbeeldingen/privacy/kat.png',
			'docs/afbeeldingen/privacy/notities.md'
		]) {
			const res = await post({ ...good, images: [KAT, image] });
			expect(res.status, image).toBe(400);
			expect(await res.json(), image).toEqual(INVALID);
		}
	});

	it('gives the same 400 for a page path outside the content folder', async () => {
		for (const path of [
			'geheim/privacy.md',
			'docs/../geheim.md',
			'docs/kennis/%2e%2e/privacy.md',
			'/docs/kennis/privacy.md',
			'docs/afbeeldingen/privacy/kat.png'
		]) {
			const res = await post({ ...good, path });
			expect(res.status, path).toBe(400);
			expect(await res.json(), path).toEqual(INVALID);
		}
	});

	it("takes only this site's Schrijver branches, never another ref", async () => {
		for (const branch of [
			'main',
			'refs/heads/main',
			'0123456789abcdef0123456789abcdef01234567',
			'schrijver/moza-site/contact-abcd',
			'schrijver/digi-handboek/',
			'schrijver/digi-handboek/a/b',
			'schrijver/digi-handboek/..',
			'schrijver/digi-handboek/x..y',
			'schrijver/digi-handboek/%2e%2e'
		]) {
			const res = await post({ ...good, branch });
			expect(res.status, branch).toBe(400);
			expect(await res.json(), branch).toEqual(INVALID);
		}
	});

	it('answers a forge failure plainly and logs it without text from GitHub or a page', async () => {
		forge.failNext(
			'readTree',
			new ForgeError(500, 'GitHub gaf een fout', 'interne details van GitHub')
		);
		const failed = await post(good);
		expect(failed.status).toBe(502);
		expect(await failed.json()).toEqual({
			ok: false,
			error: { message: 'Niet na te gaan of de afbeelding nog wordt gebruikt' }
		});
		const gone = await post({ ...good, branch: 'schrijver/digi-handboek/weg-zzzz' });
		expect(gone.status).toBe(502);
		expect(vi.mocked(log.warn)).toHaveBeenCalledWith('image_usage.failed', {
			site: 'digi-handboek',
			actor: expect.any(String),
			error: 'ForgeError',
			status: 500
		});
		const logged = JSON.stringify(vi.mocked(log.warn).mock.calls);
		expect(logged).not.toContain('interne details');
		expect(logged).not.toContain(GEHEIM);
	});

	it('never puts page text in the answer or the log', async () => {
		const answers = [await post(good), await post({ ...good, images: [LOS] })];
		for (const res of answers) expect(await res.text()).not.toContain(GEHEIM);
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain(GEHEIM);
	});
});
