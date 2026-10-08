import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/assistant/vlam', () => ({
	AssistantUnavailable: class AssistantUnavailable extends Error {},
	DEFAULT_MODEL: 'm',
	vlamClientFromEnv: vi.fn(() => ({})),
	suggest: vi.fn(async () => ({ replacement: 'r', explanation: 'e' }))
}));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({
		schrijfwijzer: (id: string) => {
			if (id === 'onbekend') throw new UnknownSiteError(id);
			return 'sw';
		}
	})
}));

import { UnknownSiteError } from '../../src/lib/config/load';
import * as vlam from '../../src/lib/assistant/vlam';
import { POST } from '../../src/routes/api/assistent/+server';

const body = { siteId: 'moza', action: 'korter', text: 'tekst' };
function call(opts: { user?: boolean; header?: boolean; body?: unknown }) {
	const headers = new Headers({ 'content-type': 'application/json' });
	if (opts.header !== false) headers.set('x-requested-with', 'Schrijver');
	const request = new Request('http://x/api/assistent', {
		method: 'POST',
		headers,
		body: JSON.stringify(opts.body ?? body)
	});
	return POST({
		request,
		locals: { user: opts.user === false ? null : { session: {}, prefs: {} } }
	} as never);
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.mocked(vlam.suggest).mockClear();
});

describe('POST /api/assistent', () => {
	it('401 without user', async () => {
		expect((await call({ user: false })).status).toBe(401);
	});
	it('403 without header', async () => {
		expect((await call({ header: false })).status).toBe(403);
	});
	it('400 on bad body', async () => {
		expect((await call({ body: { siteId: 'moza', action: 'nope', text: 'x' } })).status).toBe(400);
	});
	it('400 on text over 20000 characters', async () => {
		expect((await call({ body: { ...body, text: 'a'.repeat(20001) } })).status).toBe(400);
	});
	it('404 on unknown site', async () => {
		expect((await call({ body: { ...body, siteId: 'onbekend' } })).status).toBe(404);
	});
	it('503 when VLAM is unavailable', async () => {
		vi.mocked(vlam.suggest).mockRejectedValueOnce(
			new vlam.AssistantUnavailable('VLAM is niet bereikbaar')
		);
		const res = await call({});
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ message: 'VLAM is niet bereikbaar' });
	});
	it('returns the suggestion', async () => {
		const res = await call({});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ replacement: 'r', explanation: 'e' });
	});
});

describe('POST /api/assistent in the local preview', () => {
	it('answers with a marked test suggestion when no VLAM address is configured', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('SCHRIJVER_FAKE_FORGE', '1');
		vi.stubEnv('VLAM_API_URL', '');
		const res = await call({ body: { ...body, text: 'Eerste zin. Tweede zin.' } });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			replacement: 'Eerste zin.',
			explanation: 'Testantwoord, geen AI: alleen de eerste zin blijft staan.'
		});
		expect(vlam.suggest).not.toHaveBeenCalled();
	});
	it('still checks the site', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('SCHRIJVER_FAKE_FORGE', '1');
		expect((await call({ body: { ...body, siteId: 'onbekend' } })).status).toBe(404);
	});
	it('asks the configured model once VLAM_API_URL is set', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.stubEnv('SCHRIJVER_FAKE_FORGE', '1');
		vi.stubEnv('VLAM_API_URL', 'http://localhost:11434');
		expect(await (await call({})).json()).toEqual({ replacement: 'r', explanation: 'e' });
		expect(vlam.suggest).toHaveBeenCalledOnce();
	});
	it('never answers itself in production', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('SCHRIJVER_FAKE_FORGE', '1');
		expect(await (await call({})).json()).toEqual({ replacement: 'r', explanation: 'e' });
		expect(vlam.suggest).toHaveBeenCalledOnce();
	});
});
