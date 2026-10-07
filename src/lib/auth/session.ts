import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface Session {
	sub: string;
	name: string;
	email: string;
	emailVerified: boolean;
	organisation: string | null;
	/** Sign-in time in epoch milliseconds; renewal never extends a session past SESSION_MAX_AGE_MS from here. */
	iat: number;
	/** Expiry in epoch milliseconds. */
	exp: number;
}

export const SESSION_COOKIE = 'schrijver_sessie';
export const SESSION_TTL_MS = 8 * 3600_000;
export const SESSION_RENEW_BELOW_MS = 4 * 3600_000;
export const SESSION_MAX_AGE_MS = 12 * 3600_000;
export const MIN_SECRET_BYTES = 32;

/** Each sealed cookie kind gets its own key, so one kind can never be opened as another. */
export type Purpose = 'sessie' | 'login' | 'github-link';

const IV_LEN = 12;
const TAG_LEN = 16;

const keyOf = (secret: string, purpose: Purpose) =>
	Buffer.from(hkdfSync('sha256', secret, 'schrijver', `schrijver:${purpose}`, 32));

/** Seals any JSON payload that carries a numeric `exp` (epoch ms). */
export function sealPayload<T extends { exp: number }>(
	payload: T,
	secret: string,
	purpose: Purpose
): string {
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv('aes-256-gcm', keyOf(secret, purpose), iv);
	const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
	return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64url');
}

export function openPayload(
	token: string,
	secret: string,
	purpose: Purpose
): Record<string, unknown> | null {
	try {
		if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
		const raw = Buffer.from(token, 'base64url');
		if (raw.length < IV_LEN + TAG_LEN + 1) return null;
		const decipher = createDecipheriv(
			'aes-256-gcm',
			keyOf(secret, purpose),
			raw.subarray(0, IV_LEN)
		);
		decipher.setAuthTag(raw.subarray(raw.length - TAG_LEN));
		const plain = Buffer.concat([
			decipher.update(raw.subarray(IV_LEN, raw.length - TAG_LEN)),
			decipher.final()
		]);
		const data = JSON.parse(plain.toString('utf8'));
		if (typeof data !== 'object' || data === null || typeof data.exp !== 'number') return null;
		return data.exp < Date.now() ? null : data;
	} catch {
		return null;
	}
}

export function sealSession(s: Session, secret: string): string {
	return sealPayload(s, secret, 'sessie');
}

export function openSession(token: string, secret: string): Session | null {
	const d = openPayload(token, secret, 'sessie');
	if (
		!d ||
		typeof d.iat !== 'number' ||
		d.iat + SESSION_MAX_AGE_MS < Date.now() ||
		typeof d.sub !== 'string' ||
		typeof d.name !== 'string' ||
		typeof d.email !== 'string' ||
		typeof d.emailVerified !== 'boolean' ||
		!(d.organisation === null || typeof d.organisation === 'string')
	)
		return null;
	return d as unknown as Session;
}

export function cookieOptions(maxAgeSeconds: number) {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV !== 'development',
		sameSite: 'lax' as const,
		path: '/',
		maxAge: maxAgeSeconds
	};
}

export function sessionSecret(): string {
	const s = process.env.SESSION_SECRET;
	if (!s) throw new Error('SESSION_SECRET is not set');
	return s;
}

/** Expiry for a renewed session: a sliding window, capped by the absolute maximum since sign-in. */
export function renewedExpiry(session: Session, now = Date.now()): number {
	return Math.min(now + SESSION_TTL_MS, session.iat + SESSION_MAX_AGE_MS);
}

/** In production, refuses to start with a session or pseudonym secret shorter than 32 bytes. */
export function assertStrongSecrets(env: Record<string, string | undefined> = process.env): void {
	if (env.NODE_ENV !== 'production') return;
	for (const name of ['SESSION_SECRET', 'PSEUDONYM_SECRET']) {
		if (Buffer.byteLength(env[name] ?? '') < MIN_SECRET_BYTES) {
			throw new Error(`${name} must be at least ${MIN_SECRET_BYTES} bytes`);
		}
	}
}
