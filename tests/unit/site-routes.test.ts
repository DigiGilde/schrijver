import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';
// @ts-expect-error SvelteKit ships no types for its internal server entry
import { with_request_store } from '@sveltejs/kit/internal/server';

vi.mock('../../src/lib/log', async (original) => ({
	...(await original<typeof import('../../src/lib/log')>()),
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { log } from '../../src/lib/log';

/*
 * Every route file under the two folders of a site, run through the server hook of the app as it
 * runs in the local preview: Derde Collega, outside the team of Werkplaats, gets a 404 before the
 * route is reached; the test user, a bijdrager in that team, reaches it.
 */

const ROUTES = 'src/routes';
const GUARDED = ['sites', 'api/sites'];
/** A value for each parameter a route under a site has; another parameter gets one too. */
const SAMPLE: Record<string, string> = { site: 'werkplaats', nummer: '1', pad: 'index.md' };
const PAGE = /^\+(page|layout)(\.server)?\.[jt]s$|^\+(page|layout)\.svelte$/;
const ENDPOINT = /^\+server\.[jt]s$/;
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function filesUnder(dir: string): string[] {
	return readdirSync(join(ROUTES, dir)).flatMap((name) => {
		const path = `${dir}/${name}`;
		return statSync(join(ROUTES, path)).isDirectory() ? filesUnder(path) : [path];
	});
}

const folderOf = (file: string) => file.slice(0, file.lastIndexOf('/'));
const nameOf = (file: string) => file.slice(file.lastIndexOf('/') + 1);

/** The parameters of a route folder, and a path SvelteKit routes to it. */
function routeOf(folder: string): { path: string; params: Record<string, string> } {
	const params: Record<string, string> = {};
	const segments = folder
		.split('/')
		.filter((segment) => !/^\(.*\)$/.test(segment))
		.map((segment) => {
			const param = /^\[{1,2}(?:\.\.\.)?([^\]=]+)(?:=[^\]]+)?\]{1,2}$/.exec(segment);
			if (!param) return segment;
			params[param[1]] = SAMPLE[param[1]] ?? 'x';
			return params[param[1]];
		});
	return { path: `/${segments.join('/')}`, params };
}

interface Call {
	label: string;
	method: string;
	data: boolean;
	headers: Record<string, string>;
}

/** What reaches a route file: a page and its data and forms, or each method of an endpoint. */
function callsOf(file: string): Call[] {
	const api = { 'X-Requested-With': 'Schrijver' };
	if (ENDPOINT.test(nameOf(file))) {
		return METHODS.map((method) => ({ label: method, method, data: false, headers: api }));
	}
	return [
		{ label: 'page', method: 'GET', data: false, headers: { accept: 'text/html' } },
		{ label: '__data.json', method: 'GET', data: true, headers: {} },
		{ label: 'form', method: 'POST', data: false, headers: { accept: 'text/html' } },
		{
			label: 'form by script',
			method: 'POST',
			data: false,
			headers: { accept: 'application/json' }
		}
	];
}

let handle: Handle;
/** Each request from an address of its own: the rate limits come before the guard and are not tested here. */
let address = 0;

/** One request through the composed server hook, as SvelteKit makes it after routing, as `als` or the test user. */
async function request(file: string, call: Call, als?: string, using?: Handle) {
	const folder = folderOf(file);
	const { path, params } = routeOf(folder);
	const resolve = vi.fn(async () => new Response('route'));
	const event = {
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}${call.data ? '/__data.json' : ''}`, {
			method: call.method,
			headers: call.headers
		}),
		params,
		route: { id: `/${folder}` },
		isDataRequest: call.data,
		cookies: {
			get: (name: string) => (name === 'schrijver_test_als' ? als : undefined),
			set: vi.fn(),
			delete: vi.fn()
		},
		locals: {},
		getClientAddress: () => `10.0.${Math.floor(address / 250)}.${address++ % 250}`
	};
	const store = {
		event,
		state: { tracing: { record_span: ({ fn }: { fn: (c: unknown) => unknown }) => fn({}) } }
	};
	const response: Response = await with_request_store(store as never, () =>
		(using ?? handle)({ event, resolve } as unknown as Parameters<Handle>[0])
	);
	return { response, resolve };
}

const files = GUARDED.flatMap(filesUnder);
const routeFiles = files.filter((file) => PAGE.test(nameOf(file)) || ENDPOINT.test(nameOf(file)));

beforeAll(async () => {
	process.env.SCHRIJVER_FAKE_FORGE = '1';
	process.env.SCHRIJVER_TEST_SESSION = JSON.stringify({
		sub: 'test',
		name: 'Test Gebruiker',
		email: 'test@example.org',
		emailVerified: true,
		organisation: null,
		exp: 9999999999999
	});
	process.env.SCHRIJVER_BEHEERDERS = 'platform';
	process.env.PSEUDONYM_SECRET = 'site-routes-test-secret';
	process.env.SESSION_SECRET = 'site-routes-test-session-secret-long-enough';
	({ handle } = await import('../../src/hooks.server'));
});

describe('the route files of a site', () => {
	it('are found, the known ones among them', () => {
		expect(routeFiles.length).toBeGreaterThan(15);
		expect(routeFiles).toEqual(
			expect.arrayContaining([
				'sites/[site]/+page.server.ts',
				'sites/[site]/voorstellen/[nummer]/+page.server.ts',
				'sites/[site]/bewerken/[...pad]/+layout.svelte',
				'api/sites/[site]/bestand/+server.ts',
				'api/sites/[site]/voorstellen/[nummer]/mergen/+server.ts'
			])
		);
	});

	it('live under [site] only: a route beside it would escape the guard of its site', () => {
		for (const dir of GUARDED) expect(readdirSync(join(ROUTES, dir)), dir).toEqual(['[site]']);
	});

	it('are pages, layouts, endpoints or modules they import, never a remote function', () => {
		const other = files.filter((file) => !routeFiles.includes(file));
		for (const file of other) {
			expect(nameOf(file), file).not.toMatch(/^\+|\.remote\.[jt]s$/);
		}
	});

	it('take a site in their path nowhere else than here and on the beheer page', () => {
		const folders = (dir: string): string[] =>
			readdirSync(join(ROUTES, dir)).flatMap((name) => {
				const path = dir ? `${dir}/${name}` : name;
				return statSync(join(ROUTES, path)).isDirectory() ? [path, ...folders(path)] : [];
			});
		const elsewhere = folders('')
			.filter((folder) => folder.split('/').includes('[site]'))
			.filter((folder) => !GUARDED.some((dir) => folder.startsWith(`${dir}/`)))
			.filter((folder) => folder.endsWith('[site]'));
		// The beheer page checks who may see the site itself, for a site with files that are not valid too.
		expect(elsewhere).toEqual(['instellingen/sites/[site]']);
	});
});

describe('this test', () => {
	it('fails for a route that escapes the guard', async () => {
		// The server hook as it would be with a guard that forgets the API.
		const leaky: Handle = ({ event, resolve }) =>
			event.url.pathname.startsWith('/api/') ? resolve(event) : handle({ event, resolve });
		const escaped = new Set<string>();
		for (const file of routeFiles) {
			for (const call of callsOf(file)) {
				const { resolve } = await request(file, call, 'derde', leaky);
				if (resolve.mock.calls.length > 0) escaped.add(file);
			}
		}
		expect([...escaped].sort()).toEqual(
			routeFiles.filter((file) => file.startsWith('api/')).sort()
		);
	});
});

describe.each(routeFiles)('%s', (file) => {
	it.each(callsOf(file).map((call) => [call.label, call] as const))(
		'answers %s with 404 to someone who may not see the site, before the route',
		async (_label, call) => {
			vi.mocked(log.warn).mockClear();
			const { response, resolve } = await request(file, call, 'derde');
			expect(resolve).not.toHaveBeenCalled();
			expect(response.status).toBe(404);
			expect(log.warn).toHaveBeenCalledWith('site.refused', {
				site: 'werkplaats',
				actor: expect.any(String)
			});
		}
	);

	it('lets a member of its team reach the route', async () => {
		const [call] = callsOf(file);
		const { resolve } = await request(file, call);
		expect(resolve).toHaveBeenCalledOnce();
	});
});
