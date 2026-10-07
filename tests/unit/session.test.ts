import { describe, it, expect } from 'vitest';
import {
	SESSION_MAX_AGE_MS,
	SESSION_TTL_MS,
	assertStrongSecrets,
	openPayload,
	openSession,
	renewedExpiry,
	sealPayload,
	sealSession,
	type Session
} from '../../src/lib/auth/session';

const secret = 'test-secret-with-enough-entropy';
const make = (over: Partial<Session> = {}): Session => ({
	sub: 'abc',
	name: 'Jan Jansen',
	email: 'jan@example.org',
	emailVerified: true,
	organisation: 'Ministerie X',
	iat: Date.now(),
	exp: Date.now() + 60_000,
	...over
});

describe('session', () => {
	it('round-trips', () => {
		const s = make();
		expect(openSession(sealSession(s, secret), secret)).toEqual(s);
	});

	it('returns null for a tampered token', () => {
		const token = sealSession(make(), secret);
		const bytes = Buffer.from(token, 'base64url');
		bytes[bytes.length - 20] ^= 1;
		expect(openSession(bytes.toString('base64url'), secret)).toBeNull();
	});

	it('returns null for garbage and truncated tokens', () => {
		expect(openSession('', secret)).toBeNull();
		expect(openSession('not a token!', secret)).toBeNull();
		expect(openSession('abcd', secret)).toBeNull();
	});

	it('returns null when expired', () => {
		const token = sealSession(make({ exp: Date.now() - 1 }), secret);
		expect(openSession(token, secret)).toBeNull();
	});

	it('returns null with the wrong secret', () => {
		expect(openSession(sealSession(make(), secret), 'other-secret')).toBeNull();
	});

	it('uses a fresh IV per seal', () => {
		const s = make();
		expect(sealSession(s, secret)).not.toBe(sealSession(s, secret));
	});

	it('refuses a session older than the absolute maximum, and one without a sign-in time', () => {
		const old = make({ iat: Date.now() - SESSION_MAX_AGE_MS - 1 });
		expect(openSession(sealSession(old, secret), secret)).toBeNull();
		const { iat: _iat, ...legacy } = make();
		expect(openSession(sealSession(legacy as Session, secret), secret)).toBeNull();
	});

	it('never renews past the absolute maximum', () => {
		const now = Date.now();
		expect(renewedExpiry(make({ iat: now }), now)).toBe(now + SESSION_TTL_MS);
		const late = make({ iat: now - SESSION_MAX_AGE_MS + 3600_000 });
		expect(renewedExpiry(late, now)).toBe(now + 3600_000);
	});

	it('keeps sealed cookie kinds apart', () => {
		const token = sealPayload({ state: 's', exp: Date.now() + 60_000 }, secret, 'login');
		expect(openPayload(token, secret, 'login')).toMatchObject({ state: 's' });
		expect(openPayload(token, secret, 'github-link')).toBeNull();
		expect(openPayload(token, secret, 'sessie')).toBeNull();
	});

	it('refuses short secrets in production only', () => {
		const strong = 'x'.repeat(32);
		expect(() =>
			assertStrongSecrets({
				NODE_ENV: 'production',
				SESSION_SECRET: strong,
				PSEUDONYM_SECRET: strong
			})
		).not.toThrow();
		expect(() =>
			assertStrongSecrets({
				NODE_ENV: 'production',
				SESSION_SECRET: 'kort',
				PSEUDONYM_SECRET: strong
			})
		).toThrow('SESSION_SECRET');
		expect(() => assertStrongSecrets({ NODE_ENV: 'production', SESSION_SECRET: strong })).toThrow(
			'PSEUDONYM_SECRET'
		);
		expect(() =>
			assertStrongSecrets({ NODE_ENV: 'development', SESSION_SECRET: 'kort' })
		).not.toThrow();
	});
});
