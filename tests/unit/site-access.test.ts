import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';
import type { Session } from '../../src/lib/auth/session';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { log } from '../../src/lib/log';
import type { TeamStore } from '../../src/lib/auth/team';
import { useTeamStore } from '../../src/lib/auth/team-store';
import type { ConfigStore } from '../../src/lib/config/load';
import type { FakeForge } from '../../src/lib/forge/fake';
import { ForgeError } from '../../src/lib/forge/types';
import { buildFakeServices } from '../../src/lib/server/fake-mode';
import { setConfigStore, setForge } from '../../src/lib/server/services';
import { SITE_NOT_FOUND, siteGuard, visibleSites } from '../../src/lib/server/site-access';

const session = (sub: string): Session => ({
	sub,
	name: `Naam ${sub}`,
	email: `${sub}@example.org`,
	emailVerified: true,
	organisation: null,
	iat: 0,
	exp: Date.now() + 60_000
});

interface Request {
	method?: string;
	headers?: Record<string, string>;
	params?: Record<string, string>;
	data?: boolean;
	user?: string | null;
	/** SvelteKit's fetch of the event, with which the guard asks for the page that does not exist. */
	fetch?: (input: URL, init?: RequestInit) => Promise<Response>;
}

/** Runs the guard as SvelteKit would after routing: the path without `__data.json`, the route's params. */
async function guard(
	path: string,
	{ method = 'GET', headers = {}, params, data = false, user = 'vreemd', fetch }: Request = {}
) {
	const resolve = vi.fn(async () => new Response('route'));
	const event = {
		fetch,
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}`, { method, headers }),
		params: params ?? {},
		isDataRequest: data,
		locals: {
			user: user && {
				session: session(user),
				prefs: {
					sub: user,
					identity: 'anoniem',
					githubLogin: null,
					githubId: null,
					onboarded: true
				}
			}
		}
	};
	const response = await siteGuard({ event, resolve } as unknown as Parameters<Handle>[0]);
	return { response, resolve };
}

let forge: FakeForge;
let store: ConfigStore;
let team: TeamStore;

beforeEach(async () => {
	process.env.PSEUDONYM_SECRET = 'site-access-test-secret';
	process.env.SCHRIJVER_BEHEERDERS = 'platform';
	const services = await buildFakeServices();
	({ forge, store, team } = services);
	setForge(forge);
	setConfigStore(store);
	useTeamStore(team);
	await team.recordLogin({
		sub: 'lid',
		name: 'Lid',
		email: 'lid@example.org',
		emailVerified: true
	});
	await team.addByEmail('werkplaats', 'lid@example.org', 'bijdrager', 'platform');
	vi.mocked(log.warn).mockClear();
});

afterAll(() => {
	setConfigStore(null);
	setForge(null);
	useTeamStore(undefined);
	delete process.env.SCHRIJVER_BEHEERDERS;
});

describe('the site guard', () => {
	it('lets through what is not under a site', async () => {
		for (const path of ['/', '/help', '/instellingen/sites/werkplaats', '/sitesx/werkplaats']) {
			const { resolve } = await guard(path);
			expect(resolve, path).toHaveBeenCalledOnce();
		}
	});

	it('lets through who may see the site', async () => {
		expect((await guard('/sites/digi-handboek')).resolve).toHaveBeenCalledOnce();
		expect((await guard('/api/sites/moza-site/mermaid')).resolve).toHaveBeenCalledOnce();
		for (const user of ['lid', 'platform']) {
			const { resolve } = await guard('/sites/werkplaats/voorstellen', { user });
			expect(resolve, user).toHaveBeenCalledOnce();
		}
	});

	it('answers a page of a site the user may not see with the page that does not exist, as the app shows it', async () => {
		const page = '<!doctype html><html lang="nl"><title>Pagina niet gevonden · Schrijver</title>';
		const fetch = vi.fn(
			async () =>
				new Response(page, {
					status: 404,
					headers: {
						'content-type': 'text/html',
						'content-security-policy': "script-src 'nonce-x'"
					}
				})
		);
		const { response, resolve } = await guard('/sites/werkplaats/bewerken/index.md', { fetch });
		expect(resolve).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledWith(new URL('http://localhost/niet-gevonden'), {
			headers: { accept: 'text/html' }
		});
		expect(response.status).toBe(404);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-security-policy')).toBe("script-src 'nonce-x'");
		expect(await response.text()).toBe(page);
	});

	it('answers without the shell of the app when that page cannot be had', async () => {
		for (const fetch of [
			undefined,
			vi.fn(async () => new Response('route', { status: 200 })),
			vi.fn(async () => {
				throw new Error('weg');
			})
		]) {
			const { response, resolve } = await guard('/sites/werkplaats', { fetch });
			expect(resolve).not.toHaveBeenCalled();
			expect(response.status).toBe(404);
			expect(await response.text()).toContain(SITE_NOT_FOUND);
		}
	});

	it('answers a page of a site the user may not see with the page that does not exist', async () => {
		const { response, resolve } = await guard('/sites/werkplaats/bewerken/index.md');
		expect(resolve).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('no-store');
		const html = await response.text();
		expect(html).toContain('<html lang="nl">');
		expect(html).toContain('<title>Pagina niet gevonden · Schrijver</title>');
		expect(html).toContain(SITE_NOT_FOUND);
		expect(html).toContain('<a href="/">Naar de startpagina</a>');
	});

	it('answers its data, a form sent by script and the API in the form each expects', async () => {
		const data = await guard('/sites/werkplaats', { data: true });
		expect(data.response.status).toBe(404);
		expect(await data.response.json()).toEqual({ message: SITE_NOT_FOUND });

		const action = await guard('/sites/werkplaats/nieuw', {
			method: 'POST',
			headers: { accept: 'application/json' }
		});
		expect(action.response.status).toBe(404);
		expect(await action.response.json()).toEqual({
			type: 'error',
			error: { message: SITE_NOT_FOUND }
		});

		const form = await guard('/sites/werkplaats/nieuw', { method: 'POST' });
		expect(form.response.headers.get('content-type')).toBe('text/html; charset=utf-8');

		const api = await guard('/api/sites/werkplaats/opslaan', { method: 'POST' });
		expect(api.response.status).toBe(404);
		expect(await api.response.json()).toEqual({
			ok: false,
			message: SITE_NOT_FOUND,
			error: { message: SITE_NOT_FOUND }
		});
		for (const { resolve } of [data, action, form, api]) expect(resolve).not.toHaveBeenCalled();
	});

	it('answers a site that does not exist, or that nobody can work on, the same way', async () => {
		const refused = await (await guard('/sites/werkplaats')).response.text();
		for (const [path, user] of [
			['/sites/bestaat-niet', 'vreemd'],
			['/sites/oude-site', 'platform'],
			['/sites/werkplaats', 'vreemd']
		]) {
			const { response, resolve } = await guard(path, { user });
			expect(resolve, path).not.toHaveBeenCalled();
			expect(response.status, path).toBe(404);
			expect(await response.text(), path).toBe(refused);
		}
	});

	it('logs a refusal by pseudonym, never an address or a sub; a site that does not exist is none', async () => {
		await guard('/sites/bestaat-niet', { data: true });
		expect(log.warn).not.toHaveBeenCalled();
		await guard('/api/sites/werkplaats/bestand?pad=inhoud/afbeeldingen/organogram.png');
		expect(vi.mocked(log.warn).mock.calls).toEqual([
			['site.refused', { site: 'werkplaats', actor: expect.stringMatching(/^[0-9a-f]{12}$/) }]
		]);
		expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toMatch(/vreemd|@/);
	});

	it('decides on the site the route reads, however the path is written', async () => {
		const routed = await guard('/sites/digi-handboek', { params: { site: 'werkplaats' } });
		expect(routed.resolve).not.toHaveBeenCalled();
		for (const path of ['/sites/werk%70laats', '/sites//werkplaats', '/api/sites/werkplaats']) {
			const { response, resolve } = await guard(path);
			expect(resolve, path).not.toHaveBeenCalled();
			expect(response.status, path).toBe(404);
		}
		const malformed = await guard('/sites/%E0%A4%A');
		expect(malformed.resolve).not.toHaveBeenCalled();
	});

	it('lets no one in when the sites or the user cannot be told', async () => {
		expect((await guard('/sites/digi-handboek', { user: null })).resolve).not.toHaveBeenCalled();
		setConfigStore(null);
		const { response, resolve } = await guard('/sites/digi-handboek');
		expect(resolve).not.toHaveBeenCalled();
		expect(response.status).toBe(404);
		expect(log.warn).toHaveBeenCalledWith('site.guard_failed', {
			site: 'digi-handboek',
			error: 'Error'
		});
	});

	it('closes a site to everyone but its team while Schrijver cannot read its repository', async () => {
		forge.failNext('repository', new ForgeError(502, 'GitHub is niet bereikbaar'));
		await store.reload('digi-handboek');
		expect(store.status('digi-handboek')).toMatchObject({ available: true, isPublic: null });
		expect((await guard('/sites/digi-handboek')).resolve).not.toHaveBeenCalled();
		expect(
			(await guard('/sites/digi-handboek', { user: 'platform' })).resolve
		).toHaveBeenCalledOnce();
		await store.reload('digi-handboek');
		expect((await guard('/sites/digi-handboek')).resolve).toHaveBeenCalledOnce();
	});

	it('closes a site to everyone but its team as soon as its repository turns private', async () => {
		expect((await guard('/sites/digi-handboek')).resolve).toHaveBeenCalledOnce();
		forge.setPublic('DigiGilde/handboek', false);
		await store.reload('digi-handboek');
		expect((await guard('/sites/digi-handboek')).resolve).not.toHaveBeenCalled();
		forge.setPublic('DigiGilde/handboek', true);
		await store.reload('digi-handboek');
		expect((await guard('/sites/digi-handboek')).resolve).toHaveBeenCalledOnce();
	});
});

describe('the sites a user may see', () => {
	it('are those everyone sees, and the ones only a team sees for that team', async () => {
		const ids = async (sub: string, githubLogin: string | null = null) =>
			[...(await visibleSites({ sub, githubLogin }))].sort();
		expect(await ids('vreemd')).toEqual(['digi-handboek', 'moza-site']);
		expect(await ids('lid')).toEqual(['digi-handboek', 'moza-site', 'werkplaats']);
		expect(await ids('platform')).toEqual([
			'digi-handboek',
			'moza-site',
			'oude-site',
			'werkplaats'
		]);
		forge.permissionByLogin.set('lezer', 'read');
		expect(await ids('vreemd', 'lezer')).toEqual([
			'digi-handboek',
			'moza-site',
			'oude-site',
			'werkplaats'
		]);
	});
});
