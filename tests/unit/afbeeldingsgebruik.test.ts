import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const state = vi.hoisted(() => ({ forge: null as unknown }));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({
		site: (id: string) => [digi, moza].find((s) => s.id === id),
		schema: () => ({ titel: 'uit-h1' })
	}),
	getForge: () => state.forge
}));

import { POST } from '../../src/routes/api/sites/[site]/afbeeldingsgebruik/+server';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const KAT = 'docs/afbeeldingen/privacy/kat.png';
const HOND = 'docs/afbeeldingen/privacy/hond.png';
const LOS = 'docs/kennis/los.png';
const BRANCH = 'schrijver/digi-handboek/privacy-abcd';
let forge: FakeForge;

beforeEach(async () => {
	forge = new FakeForge();
	forge.seedRepo(digi.repo, 'main', {
		[KAT]: PNG,
		[HOND]: PNG,
		[LOS]: PNG,
		'docs/kennis/privacy.md': '# Privacy\n\n![Kat](../afbeeldingen/privacy/kat.png)\n',
		'docs/kennis/index.md': '# Kennis\n\n![Hond](../afbeeldingen/privacy/hond.png)\n'
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

function post(body: unknown, opts: { site?: string; user?: boolean } = {}) {
	return POST({
		request: new Request('http://x', { method: 'POST', body: JSON.stringify(body) }),
		params: { site: opts.site ?? 'digi-handboek' },
		locals: { user: opts.user === false ? null : { session: {}, prefs: {} } }
	} as never) as Promise<Response>;
}

const good = { path: 'docs/kennis/privacy.md', branch: null, images: [KAT, HOND, LOS] };

describe('POST /api/sites/[site]/afbeeldingsgebruik', () => {
	it('offers an image no other page uses, inside the image folder only', async () => {
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
				},
				{ path: LOS, usedOn: [], deletable: false }
			]
		});
	});

	it('reads the proposal branch when there is one', async () => {
		const res = await post({ ...good, branch: BRANCH, images: [HOND] });
		expect((await res.json()).images).toEqual([{ path: HOND, usedOn: [], deletable: true }]);
	});

	it('leaves out an image that does not exist', async () => {
		const res = await post({ ...good, images: ['docs/afbeeldingen/privacy/weg.png'] });
		expect(await res.json()).toEqual({ ok: true, images: [] });
	});

	it('refuses without a user, for an unknown site, or with a bad request', async () => {
		expect((await post(good, { user: false })).status).toBe(401);
		expect((await post(good, { site: 'onbekend' })).status).toBe(404);
		expect((await post({ ...good, images: [] })).status).toBe(400);
		expect((await post({ ...good, path: 'geheim/privacy.md' })).status).toBe(400);
		expect((await post({ ...good, path: 'docs/../geheim.md' })).status).toBe(400);
		expect((await post({ ...good, branch: 'schrijver/moza-site/x' })).status).toBe(400);
		expect((await post({ ...good, branch: 'main' })).status).toBe(400);
	});

	it('passes a forge error on', async () => {
		const res = await post({ ...good, branch: 'schrijver/digi-handboek/weg-zzzz' });
		expect(res.status).toBe(404);
		expect((await res.json()).ok).toBe(false);
	});
});
