import type { Handle, RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE, openSession, sessionSecret } from '$lib/auth/session';

export const CSP =
	"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://raw.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

type Env = Record<string, string | undefined>;

const BYPASSES = ['SCHRIJVER_FAKE_FORGE', 'SCHRIJVER_TEST_SESSION'];

/** Development bypasses are only honoured when NODE_ENV is explicitly development or test. */
export function devBypassesAllowed(env: Env = process.env): boolean {
	return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

export function assertSafeEnvironment(env: Env = process.env): void {
	const active = BYPASSES.filter((k) => env[k]);
	if (active.length > 0 && !devBypassesAllowed(env)) {
		throw new Error(
			`${active.join(' and ')} must not be set unless NODE_ENV is development or test (NODE_ENV=${env.NODE_ENV ?? 'unset'})`
		);
	}
}

const HEADERS: Record<string, string> = {
	'Content-Security-Policy': CSP,
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'no-referrer',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'X-Frame-Options': 'DENY'
};

const json = (status: number, message: string, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify({ message }), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});

/** The path as SvelteKit routes it: percent-decoded, duplicate slashes collapsed. Null when malformed. */
export function normalisePath(pathname: string): string | null {
	try {
		const path = decodeURIComponent(pathname).replace(/\/{2,}/g, '/');
		return path.split('/').includes('..') ? null : path;
	} catch {
		return null;
	}
}

function applyHeaders(response: Response) {
	for (const [k, v] of Object.entries(HEADERS)) {
		// SvelteKit sets its own CSP (with nonces) on rendered pages; do not overwrite it.
		if (k === 'Content-Security-Policy' && response.headers.has(k)) continue;
		response.headers.set(k, v);
	}
}

export const securityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	try {
		applyHeaders(response);
		return response;
	} catch {
		const copy = new Response(response.body, response);
		applyHeaders(copy);
		return copy;
	}
};

/** Preview images load through <img>, which cannot send the header; the route only reads. */
const PREVIEW_FILE = /^\/api\/sites\/[^/]+\/bestand$/;

export const apiGuard: Handle = async ({ event, resolve }) => {
	const path = normalisePath(event.url.pathname);
	if (path === null) return json(400, 'Ongeldige aanvraag');
	if (
		path.startsWith('/api/') &&
		!path.startsWith('/api/webhook/') &&
		!(event.request.method === 'GET' && PREVIEW_FILE.test(path)) &&
		event.request.headers.get('X-Requested-With') !== 'Schrijver'
	) {
		return json(403, 'Ongeldige aanvraag');
	}
	return resolve(event);
};

const WINDOW_MS = 60_000;
const RULES: { test: RegExp; name: string; limit: number; method?: string }[] = [
	{ test: /^\/api\/assistent$/, name: 'assistent', limit: 20 },
	{ test: /^\/api\/sites\/[^/]+\/opslaan$/, name: 'opslaan', limit: 60 },
	{ test: /^\/api\/sites\/[^/]+\/afbeelding$/, name: 'afbeelding', limit: 60 },
	{ test: /^\/api\/sites\/[^/]+\/afbeeldingsgebruik$/, name: 'afbeeldingsgebruik', limit: 30 },
	// What these post or change on GitHub goes out under the App's name.
	{
		test: /^\/api\/sites\/[^/]+\/voorstellen\/[^/]+\/(opmerking|aanpassing|opnieuw-insturen)$/,
		name: 'gesprek',
		limit: 10
	},
	// Generous: a page with many images asks for each of them.
	{ test: /^\/api\/sites\/[^/]+\/bestand$/, name: 'bestand', limit: 600, method: 'GET' }
];

function clientKey(event: RequestEvent): string {
	const user = event.locals?.user;
	if (user) return `sub:${user.session.sub}`;
	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		try {
			const session = openSession(token, sessionSecret());
			if (session) return `sub:${session.sub}`;
		} catch {
			// no usable secret: fall back to the address
		}
	}
	return `ip:${event.getClientAddress()}`;
}

export function createRateLimit(now: () => number = Date.now): Handle & { sweep(): void } {
	const buckets = new Map<string, number[]>();

	const sweep = () => {
		const cutoff = now() - WINDOW_MS;
		for (const [k, hits] of buckets) {
			if (hits.every((t) => t <= cutoff)) buckets.delete(k);
		}
	};
	setInterval(sweep, WINDOW_MS).unref();

	const handle: Handle = async ({ event, resolve }) => {
		const path = normalisePath(event.url.pathname);
		const method = event.request.method;
		const rule =
			path === null
				? undefined
				: RULES.find((r) => r.test.test(path) && (!r.method || r.method === method));
		if (!rule) return resolve(event);
		const key = `${rule.name}:${clientKey(event)}`;
		const t = now();
		const hits = (buckets.get(key) ?? []).filter((h) => h > t - WINDOW_MS);
		if (hits.length >= rule.limit) {
			buckets.set(key, hits);
			const retry = Math.max(1, Math.ceil((hits[0] + WINDOW_MS - t) / 1000));
			return json(429, 'Te veel aanvragen, probeer het zo opnieuw', {
				'retry-after': String(retry)
			});
		}
		hits.push(t);
		buckets.set(key, hits);
		return resolve(event);
	};
	return Object.assign(handle, { sweep });
}

export const rateLimit: Handle = createRateLimit();

/** Counts events per key in a sliding window; `take` returns false once the limit is reached. */
export function createWindowCounter(limit: number, windowMs: number, now: () => number = Date.now) {
	const hits = new Map<string, number[]>();
	setInterval(() => {
		const cutoff = now() - windowMs;
		for (const [k, times] of hits) if (times.every((t) => t <= cutoff)) hits.delete(k);
	}, windowMs).unref();
	return {
		take(key: string): boolean {
			const t = now();
			const recent = (hits.get(key) ?? []).filter((h) => h > t - windowMs);
			if (recent.length >= limit) {
				hits.set(key, recent);
				return false;
			}
			recent.push(t);
			hits.set(key, recent);
			return true;
		}
	};
}

/**
 * New branches and draft pull requests per user per hour. The e2e suite raises it, as all its tests
 * share one user; like the other test bypasses, only where NODE_ENV is development or test.
 */
export function newProposalsPerHour(env: Env = process.env): number {
	const raised = Number(env.SCHRIJVER_NIEUWE_VOORSTELLEN_PER_UUR);
	return devBypassesAllowed(env) && Number.isInteger(raised) && raised > 0 ? raised : 20;
}

export const newProposalLimit = createWindowCounter(newProposalsPerHour(), 3600_000);

/** Image usage scans per user per hour: the check before a save that drops an image, and that save. */
export const IMAGE_SCANS_PER_HOUR = 60;
export const imageScanLimit = createWindowCounter(IMAGE_SCANS_PER_HOUR, 3600_000);
export const IMAGE_SCANS_SPENT =
	'Je hebt het afgelopen uur veel afbeeldingen laten nagaan; probeer het later opnieuw';
