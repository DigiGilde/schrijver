import { describe, it, expect, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';
import { pseudonym } from '../../src/lib/forge/trailers';
import {
	BEHEER_POSTS_PER_MINUTE,
	CSP,
	apiGuard,
	assertSafeEnvironment,
	createRateLimit,
	devBypassesAllowed,
	imageScanLimit,
	limitBeheerPost,
	newProposalLimit,
	newProposalsPerHour,
	securityHeaders
} from '../../src/lib/server/security';

const SECRET = 'security-test-secret';

/** The lines logged while `run` ran, for one event, without their time. */
async function logged(event: string, run: () => Promise<void> | void) {
	const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	try {
		await run();
		return write.mock.calls
			.map(([line]) => JSON.parse(String(line)))
			.filter((line) => line.event === event)
			.map(({ t: _t, ...line }) => line);
	} finally {
		write.mockRestore();
	}
}

function ev(path: string, headers: Record<string, string> = {}, ip = '1.2.3.4', method = 'POST') {
	return {
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}`, { method, headers }),
		cookies: { get: () => undefined },
		locals: {},
		getClientAddress: () => ip
	};
}
const call = (
	h: Handle,
	e: ReturnType<typeof ev>,
	resolve = vi.fn(async () => new Response('ok'))
) => ({
	res: Promise.resolve(h({ event: e, resolve } as unknown as Parameters<Handle>[0])),
	resolve
});

describe('securityHeaders', () => {
	it('sets every header', async () => {
		const res = await call(securityHeaders, ev('/')).res;
		expect(res.headers.get('content-security-policy')).toBe(
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://raw.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
		);
		expect(CSP).toBe(res.headers.get('content-security-policy'));
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('referrer-policy')).toBe('no-referrer');
		expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
		expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
});

describe('securityHeaders with an existing CSP', () => {
	it('keeps the CSP SvelteKit set', async () => {
		const resolve = vi.fn(
			async () =>
				new Response('ok', { headers: { 'content-security-policy': "script-src 'nonce-x'" } })
		);
		const res = await call(securityHeaders, ev('/'), resolve).res;
		expect(res.headers.get('content-security-policy')).toBe("script-src 'nonce-x'");
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
});

describe('securityHeaders with immutable headers', () => {
	it('still adds the headers', async () => {
		const redirect = Response.redirect('http://localhost/login', 303);
		const res = await call(
			securityHeaders,
			ev('/'),
			vi.fn(async () => redirect)
		).res;
		expect(res.status).toBe(303);
		expect(res.headers.get('x-frame-options')).toBe('DENY');
	});
});

describe('apiGuard', () => {
	it('rejects an API call without the header', async () => {
		const { res, resolve } = call(apiGuard, ev('/api/assistent'));
		const r = await res;
		expect(r.status).toBe(403);
		expect(await r.json()).toEqual({ message: 'Ongeldige aanvraag' });
		expect(resolve).not.toHaveBeenCalled();
	});
	it('accepts the header', async () => {
		const { resolve, res } = call(
			apiGuard,
			ev('/api/assistent', { 'X-Requested-With': 'Schrijver' })
		);
		await res;
		expect(resolve).toHaveBeenCalled();
	});
	it('lets the webhook through without it', async () => {
		const { resolve, res } = call(apiGuard, ev('/api/webhook/github'));
		await res;
		expect(resolve).toHaveBeenCalled();
	});
	it('rejects a decoded path with a .. segment', async () => {
		const { res, resolve } = call(apiGuard, ev('/api/webhook/..%2Fassistent'));
		expect((await res).status).toBe(400);
		expect(resolve).not.toHaveBeenCalled();
	});
	it('cannot be evaded with an encoded or doubled-slash path', async () => {
		for (const p of [
			'/%61pi/assistent',
			'//api/assistent',
			'/api//assistent',
			'/api%2Fassistent'
		]) {
			const { res, resolve } = call(apiGuard, ev(p));
			expect((await res).status).toBe(403);
			expect(resolve).not.toHaveBeenCalled();
		}
	});
	it('answers 400 for a malformed path', async () => {
		const { res, resolve } = call(apiGuard, ev('/api/%E0%A4%A'));
		expect((await res).status).toBe(400);
		expect(resolve).not.toHaveBeenCalled();
	});
	it('ignores non-API paths', async () => {
		const { resolve, res } = call(apiGuard, ev('/help'));
		await res;
		expect(resolve).toHaveBeenCalled();
	});
});

describe('rateLimit', () => {
	it('blocks the 21st assistant call and recovers after the window', async () => {
		let t = 1_000_000;
		const h = createRateLimit(() => t);
		for (let i = 0; i < 20; i++) expect((await call(h, ev('/api/assistent')).res).status).toBe(200);
		const blocked = await call(h, ev('/api/assistent')).res;
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get('retry-after')).toBe('60');
		expect(await blocked.json()).toEqual({ message: 'Te veel aanvragen, probeer het zo opnieuw' });
		t += 60_001;
		expect((await call(h, ev('/api/assistent')).res).status).toBe(200);
	});
	it('counts per client and per route', async () => {
		const h = createRateLimit(() => 5);
		for (let i = 0; i < 20; i++) await call(h, ev('/api/assistent')).res;
		expect((await call(h, ev('/api/assistent', {}, '9.9.9.9')).res).status).toBe(200);
		expect((await call(h, ev('/api/sites/x/afbeelding')).res).status).toBe(200);
	});
	it('counts an encoded path against the same bucket', async () => {
		const h = createRateLimit(() => 5);
		for (let i = 0; i < 20; i++) await call(h, ev('/%61pi/assistent')).res;
		expect((await call(h, ev('/api/assistent')).res).status).toBe(429);
	});
	it('allows 60 saves per minute', async () => {
		const h = createRateLimit(() => 5);
		for (let i = 0; i < 60; i++)
			expect((await call(h, ev('/api/sites/x/opslaan')).res).status).toBe(200);
		expect((await call(h, ev('/api/sites/x/opslaan')).res).status).toBe(429);
	});
	it('allows 30 image usage checks per minute, apart from the saves', async () => {
		const h = createRateLimit(() => 5);
		for (let i = 0; i < 30; i++)
			expect((await call(h, ev('/api/sites/x/afbeeldingsgebruik')).res).status).toBe(200);
		expect((await call(h, ev('/api/sites/x/afbeeldingsgebruik')).res).status).toBe(429);
		expect((await call(h, ev('/api/sites/x/opslaan')).res).status).toBe(200);
	});
	it('allows 10 reactions, requests and re-sends per minute together, apart from the rest', async () => {
		const h = createRateLimit(() => 5);
		const paths = ['opmerking', 'aanpassing', 'opnieuw-insturen'].map(
			(actie) => `/api/sites/x/voorstellen/7/${actie}`
		);
		for (let i = 0; i < 10; i++) expect((await call(h, ev(paths[i % 3])).res).status).toBe(200);
		for (const path of paths) expect((await call(h, ev(path)).res).status).toBe(429);
		expect((await call(h, ev('/api/sites/x/voorstellen/7/mergen')).res).status).toBe(200);
		expect((await call(h, ev('/api/sites/x/opslaan')).res).status).toBe(200);
	});
	it('allows 600 image reads per minute, enough for a page with many images', async () => {
		const h = createRateLimit(() => 5);
		const image = (path = '/api/sites/x/bestand') => ev(path, {}, '1.2.3.4', 'GET');
		for (let i = 0; i < 600; i++) expect((await call(h, image()).res).status).toBe(200);
		expect((await call(h, image()).res).status).toBe(429);
		expect((await call(h, image('/api/sites/y/bestand')).res).status).toBe(429);
		expect((await call(h, ev('/api/sites/x/opslaan')).res).status).toBe(200);
		expect((await call(h, image('/api/sites/x/opslaan')).res).status).toBe(200);
	});

	it('logs a refusal once per window and bucket: the rule and the pseudonym, never an address', async () => {
		process.env.PSEUDONYM_SECRET = SECRET;
		let t = 1_000_000;
		const h = createRateLimit(() => t);
		const asUser = (sub: string) => ({
			...ev('/api/assistent'),
			locals: { user: { session: { sub } } }
		});
		const lines = await logged('rate_limited', async () => {
			for (let i = 0; i < 20; i++) await call(h, asUser('jan')).res;
			for (let i = 0; i < 3; i++) expect((await call(h, asUser('jan')).res).status).toBe(429);
			for (let i = 0; i < 22; i++) await call(h, ev('/api/assistent', {}, '9.9.9.9')).res;
			for (let i = 0; i < 11; i++) await call(h, ev('/api/sites/x/voorstellen/7/opmerking')).res;
			t += 60_001;
			for (let i = 0; i < 21; i++) await call(h, asUser('jan')).res;
		});
		const jan = pseudonym(SECRET, 'jan');
		expect(lines).toEqual([
			{ level: 'warn', event: 'rate_limited', rule: 'assistent', actor: jan },
			{ level: 'warn', event: 'rate_limited', rule: 'assistent' },
			{ level: 'warn', event: 'rate_limited', rule: 'gesprek' },
			{ level: 'warn', event: 'rate_limited', rule: 'assistent', actor: jan }
		]);
		expect(JSON.stringify(lines)).not.toMatch(/9\.9\.9\.9|1\.2\.3\.4|"jan"/);
	});

	it('does not limit other paths and sweeps stale buckets', async () => {
		let t = 0;
		const h = createRateLimit(() => t);
		for (let i = 0; i < 100; i++) expect((await call(h, ev('/help')).res).status).toBe(200);
		await call(h, ev('/api/assistent')).res;
		t = 120_000;
		h.sweep();
		for (let i = 0; i < 20; i++) expect((await call(h, ev('/api/assistent')).res).status).toBe(200);
	});
});

describe('assertSafeEnvironment', () => {
	it('throws for production with a bypass', () => {
		expect(() =>
			assertSafeEnvironment({ NODE_ENV: 'production', SCHRIJVER_FAKE_FORGE: '1' })
		).toThrow();
		expect(() =>
			assertSafeEnvironment({ NODE_ENV: 'production', SCHRIJVER_TEST_SESSION: '{}' })
		).toThrow();
	});
	it('throws for unset or unknown NODE_ENV with a bypass', () => {
		expect(() => assertSafeEnvironment({ SCHRIJVER_FAKE_FORGE: '1' })).toThrow();
		expect(() =>
			assertSafeEnvironment({ NODE_ENV: 'staging', SCHRIJVER_TEST_SESSION: '{}' })
		).toThrow();
	});
	it('passes for development and test with a bypass, and production without', () => {
		expect(() =>
			assertSafeEnvironment({ NODE_ENV: 'development', SCHRIJVER_FAKE_FORGE: '1' })
		).not.toThrow();
		expect(() =>
			assertSafeEnvironment({ NODE_ENV: 'test', SCHRIJVER_TEST_SESSION: '{}' })
		).not.toThrow();
		expect(() => assertSafeEnvironment({ NODE_ENV: 'production' })).not.toThrow();
		expect(() => assertSafeEnvironment({})).not.toThrow();
	});
	it('devBypassesAllowed only for development and test', () => {
		expect(devBypassesAllowed({ NODE_ENV: 'development' })).toBe(true);
		expect(devBypassesAllowed({ NODE_ENV: 'test' })).toBe(true);
		expect(devBypassesAllowed({ NODE_ENV: 'production' })).toBe(false);
		expect(devBypassesAllowed({})).toBe(false);
	});
});

describe('newProposalsPerHour', () => {
	const raised = { SCHRIJVER_NIEUWE_VOORSTELLEN_PER_UUR: '1000' };

	it('takes the raised limit only where the development bypasses are allowed', () => {
		expect(newProposalsPerHour({ ...raised, NODE_ENV: 'development' })).toBe(1000);
		expect(newProposalsPerHour({ ...raised, NODE_ENV: 'test' })).toBe(1000);
		expect(newProposalsPerHour({ ...raised, NODE_ENV: 'production' })).toBe(20);
		expect(newProposalsPerHour(raised)).toBe(20);
	});

	it('keeps the default for anything but a positive whole number', () => {
		for (const value of ['-1', '0', '2.5', 'veel', ''])
			expect(
				newProposalsPerHour({
					NODE_ENV: 'development',
					SCHRIJVER_NIEUWE_VOORSTELLEN_PER_UUR: value
				}),
				value
			).toBe(20);
		expect(newProposalsPerHour({ NODE_ENV: 'development' })).toBe(20);
	});
});

describe('the limits counted where the user is known', () => {
	it('log a refused post to a beheer page once per minute per user, by pseudonym', async () => {
		process.env.PSEUDONYM_SECRET = SECRET;
		const lines = await logged('rate_limited', () => {
			for (let i = 0; i < BEHEER_POSTS_PER_MINUTE; i++) limitBeheerPost('beheer-veel');
			for (let i = 0; i < 2; i++)
				expect(() => limitBeheerPost('beheer-veel')).toThrow(
					expect.objectContaining({ status: 429 })
				);
		});
		expect(lines).toEqual([
			{
				level: 'warn',
				event: 'rate_limited',
				rule: 'beheer',
				actor: pseudonym(SECRET, 'beheer-veel')
			}
		]);
	});

	it('log a refused new proposal once per hour per user, by pseudonym', async () => {
		process.env.PSEUDONYM_SECRET = SECRET;
		const lines = await logged('rate_limited', () => {
			for (let i = 0; i < newProposalsPerHour(); i++) newProposalLimit.take('schrijft-veel');
			expect(newProposalLimit.take('schrijft-veel')).toBe(false);
			expect(newProposalLimit.take('schrijft-veel')).toBe(false);
		});
		expect(lines).toEqual([
			{
				level: 'warn',
				event: 'rate_limited',
				rule: 'nieuwe-voorstellen',
				actor: pseudonym(SECRET, 'schrijft-veel')
			}
		]);
	});
});

describe('imageScanLimit', () => {
	it('allows 60 image usage scans per user per hour', () => {
		for (let i = 0; i < 60; i++) expect(imageScanLimit.take('sub:scanner')).toBe(true);
		expect(imageScanLimit.take('sub:scanner')).toBe(false);
		expect(imageScanLimit.take('sub:ander')).toBe(true);
	});
});
