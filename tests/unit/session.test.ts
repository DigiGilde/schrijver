import { describe, it, expect } from 'vitest';
import { sealSession, openSession, type Session } from '../../src/lib/auth/session';

const secret = 'test-secret-with-enough-entropy';
const make = (over: Partial<Session> = {}): Session => ({
	sub: 'abc',
	name: 'Jan Jansen',
	email: 'jan@example.org',
	emailVerified: true,
	organisation: 'Ministerie X',
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
});
