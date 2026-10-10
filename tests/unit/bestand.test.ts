import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';
import { FakeForge } from '../../src/lib/forge/fake';
import { apiGuard } from '../../src/lib/server/security';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
const state = vi.hoisted(() => ({ forge: null as unknown }));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({ site: (id: string) => [digi, moza].find((s) => s.id === id) }),
	getForge: () => state.forge
}));

import { GET } from '../../src/routes/api/sites/[site]/bestand/+server';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
let forge: FakeForge;

beforeEach(async () => {
	forge = new FakeForge();
	forge.seedRepo(digi.repo, 'main', {
		'docs/afbeeldingen/home/kat.png': PNG,
		'docs/notities.txt': 'tekst',
		'geheim/kat.png': PNG
	});
	forge.seedRepo(moza.repo, 'main', { 'content/over/images/logo.svg': '<svg/>' });
	await forge.createBranch(digi.repo, 'main', 'schrijver/digi-handboek/home-abcd');
	await forge.commit(
		digi.repo,
		'schrijver/digi-handboek/home-abcd',
		[{ path: 'docs/afbeeldingen/home/nieuw.png', content: PNG }],
		'x'
	);
	state.forge = forge;
});

function get(query: Record<string, string>, opts: { site?: string; user?: boolean } = {}) {
	const url = new URL(`http://x/api/sites/${opts.site ?? 'digi-handboek'}/bestand`);
	for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
	return GET({
		url,
		params: { site: opts.site ?? 'digi-handboek' },
		locals: { user: opts.user === false ? null : { session: {}, prefs: {} } }
	} as never) as Promise<Response>;
}

describe('GET /api/sites/[site]/bestand', () => {
	it('serves an image from the default branch with a short private cache', async () => {
		const res = await get({ pad: 'docs/afbeeldingen/home/kat.png' });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/png');
		expect(res.headers.get('cache-control')).toBe('private, max-age=10');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
	});

	it('serves an image from a Schrijver branch of the site', async () => {
		const ref = 'schrijver/digi-handboek/home-abcd';
		expect((await get({ pad: 'docs/afbeeldingen/home/nieuw.png', ref })).status).toBe(200);
		expect((await get({ pad: 'docs/afbeeldingen/home/nieuw.png' })).status).toBe(404);
	});

	it("serves a proposal's image at the commit its head points at", async () => {
		const branch = 'schrijver/digi-handboek/home-abcd';
		const pr = await forge.openDraftPr(digi.repo, branch, 'main', 'Voorstel', '');
		const voorstel = String(pr.number);
		expect((await get({ pad: 'docs/afbeeldingen/home/nieuw.png', voorstel })).status).toBe(200);
		expect((await get({ pad: 'docs/afbeeldingen/home/later.png', voorstel })).status).toBe(404);
		await forge.commit(
			digi.repo,
			branch,
			[{ path: 'docs/afbeeldingen/home/later.png', content: PNG }],
			'y'
		);
		expect((await get({ pad: 'docs/afbeeldingen/home/later.png', voorstel })).status).toBe(200);
	});

	it('400 for a proposal whose head is not a branch of the site repository', async () => {
		const branch = 'schrijver/digi-handboek/home-abcd';
		const pr = await forge.openDraftPr(digi.repo, branch, 'main', 'Voorstel', '');
		const pad = 'docs/afbeeldingen/home/nieuw.png';
		for (const headRepo of ['iemand/handboek', '']) {
			forge.prs.get(pr.number)!.headRepo = headRepo;
			expect((await get({ pad, voorstel: String(pr.number) })).status, headRepo).toBe(400);
		}
	});

	it('404 for a proposal that does not exist, 400 for a malformed one', async () => {
		const pad = 'docs/afbeeldingen/home/kat.png';
		expect((await get({ pad, voorstel: '999' })).status).toBe(404);
		for (const voorstel of ['0', '-1', '1.5', 'een', '01', '1234567890']) {
			expect((await get({ pad, voorstel })).status, voorstel).toBe(400);
		}
		expect((await get({ pad, voorstel: '1', ref: 'main' })).status).toBe(400);
	});

	it('sandboxes an svg', async () => {
		const res = await get({ pad: 'content/over/images/logo.svg' }, { site: 'moza-site' });
		expect(res.headers.get('content-type')).toBe('image/svg+xml');
		expect(res.headers.get('content-security-policy')).toContain('sandbox');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('401 without a user', async () => {
		expect((await get({ pad: 'docs/afbeeldingen/home/kat.png' }, { user: false })).status).toBe(
			401
		);
	});

	it('404 for an unknown site or a missing file', async () => {
		expect((await get({ pad: 'docs/x.png' }, { site: 'onbekend' })).status).toBe(404);
		expect((await get({ pad: 'docs/afbeeldingen/home/weg.png' })).status).toBe(404);
	});

	it('415 for a file that is not an allowed image type', async () => {
		expect((await get({ pad: 'docs/notities.txt' })).status).toBe(415);
		expect((await get({ pad: 'docs/index.md' })).status).toBe(415);
	});

	it('400 for paths outside the content folder or with traversal', async () => {
		for (const pad of [
			'geheim/kat.png',
			'docs/../geheim/kat.png',
			'/docs/afbeeldingen/home/kat.png',
			'docs//kat.png',
			'docs\\kat.png',
			''
		]) {
			expect((await get({ pad })).status, pad).toBe(400);
		}
	});

	it('400 for a ref that is not the default branch or a Schrijver branch of the site', async () => {
		const commit = forge.commitsOf(digi.repo, 'schrijver/digi-handboek/home-abcd')[0].sha;
		for (const ref of [
			commit,
			'a'.repeat(40),
			'andere',
			'schrijver/moza-site/x-abcd',
			'HEAD',
			'main~1',
			commit.slice(0, 7),
			commit.slice(0, 39),
			`${commit}0`,
			commit.toUpperCase(),
			`${commit}\n`,
			`${commit}/../..`
		]) {
			expect((await get({ pad: 'docs/afbeeldingen/home/kat.png', ref })).status, ref).toBe(400);
		}
	});

	it('413 for a file above the image limit', async () => {
		forge.seedRepo(digi.repo, 'main', {
			'docs/groot.png': new Uint8Array(5 * 1024 * 1024 + 1)
		});
		expect((await get({ pad: 'docs/groot.png' })).status).toBe(413);
	});
});

describe('apiGuard and the preview file route', () => {
	const run = (method: string, path: string) => {
		const resolve = vi.fn(async () => new Response('ok'));
		const event = {
			url: new URL(`http://localhost${path}`),
			request: new Request(`http://localhost${path}`, { method })
		};
		return Promise.resolve(apiGuard({ event, resolve } as never)).then((r) => ({
			status: r.status,
			resolved: resolve.mock.calls.length > 0
		}));
	};

	it('lets an image GET through without the header, nothing else', async () => {
		expect(await run('GET', '/api/sites/digi-handboek/bestand?pad=x.png')).toMatchObject({
			resolved: true
		});
		expect(await run('POST', '/api/sites/digi-handboek/bestand')).toMatchObject({ status: 403 });
		expect(await run('GET', '/api/sites/digi-handboek/opslaan')).toMatchObject({ status: 403 });
	});
});
