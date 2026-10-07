import { describe, it, expect, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';
import {
	CSP,
	apiGuard,
	assertSafeEnvironment,
	createRateLimit,
	devBypassesAllowed,
	securityHeaders
} from '../../src/lib/server/security';

function ev(path: string, headers: Record<string, string> = {}, ip = '1.2.3.4') {
	return {
		url: new URL(`http://localhost${path}`),
		request: new Request(`http://localhost${path}`, { method: 'POST', headers }),
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
	it('allows 60 saves per minute', async () => {
		const h = createRateLimit(() => 5);
		for (let i = 0; i < 60; i++)
			expect((await call(h, ev('/api/sites/x/opslaan')).res).status).toBe(200);
		expect((await call(h, ev('/api/sites/x/opslaan')).res).status).toBe(429);
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
