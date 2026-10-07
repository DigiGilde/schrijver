import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface Session {
	sub: string;
	name: string;
	email: string;
	emailVerified: boolean;
	organisation: string | null;
	/** Expiry in epoch milliseconds. */
	exp: number;
}

export const SESSION_COOKIE = 'schrijver_sessie';
export const SESSION_TTL_MS = 8 * 3600_000;
export const SESSION_RENEW_BELOW_MS = 4 * 3600_000;

const IV_LEN = 12;
const TAG_LEN = 16;

const keyOf = (secret: string) => createHash('sha256').update(secret).digest();

/** Seals any JSON payload that carries a numeric `exp` (epoch ms). */
export function sealPayload<T extends { exp: number }>(payload: T, secret: string): string {
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
	const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
	return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64url');
}

export function openPayload(token: string, secret: string): Record<string, unknown> | null {
	try {
		if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
		const raw = Buffer.from(token, 'base64url');
		if (raw.length < IV_LEN + TAG_LEN + 1) return null;
		const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), raw.subarray(0, IV_LEN));
		decipher.setAuthTag(raw.subarray(raw.length - TAG_LEN));
		const plain = Buffer.concat([decipher.update(raw.subarray(IV_LEN, raw.length - TAG_LEN)), decipher.final()]);
		const data = JSON.parse(plain.toString('utf8'));
		if (typeof data !== 'object' || data === null || typeof data.exp !== 'number') return null;
		return data.exp < Date.now() ? null : data;
	} catch {
		return null;
	}
}

export function sealSession(s: Session, secret: string): string {
	return sealPayload(s, secret);
}

export function openSession(token: string, secret: string): Session | null {
	const d = openPayload(token, secret);
	if (
		!d ||
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
