import { describe, it, expect, vi } from 'vitest';

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
