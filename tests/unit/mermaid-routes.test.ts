import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseSitesYaml } from '../../src/lib/config/types';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
vi.mock('../../src/lib/server/services', () => ({
	getConfigStore: () => ({ site: (id: string) => [digi, moza].find((s) => s.id === id) })
}));

import { GET as iconen } from '../../src/routes/api/iconen/+server';
import { GET as kleuren } from '../../src/routes/api/sites/[site]/mermaid/+server';

const user = { session: {}, prefs: {} };

function tokens(site: string, signedIn = true) {
	return kleuren({
		params: { site },
		locals: { user: signedIn ? user : null }
	} as never) as Response;
}

describe('GET /api/sites/[site]/mermaid', () => {
	it("gives the site's token colours", async () => {
		const res = tokens('moza-site');
		expect(res.status).toBe(200);
		expect((await res.json()).tokens['--color-text']).toEqual({
			licht: '#091629',
			donker: '#ebeef2'
		});
	});

	it('gives an empty table for a site without one', async () => {
		expect(await tokens('digi-handboek').json()).toEqual({ tokens: {} });
	});

	it('401 without a user, 404 for an unknown site', () => {
		expect(tokens('moza-site', false).status).toBe(401);
		expect(tokens('onbekend').status).toBe(404);
	});
});

describe('GET /api/iconen', () => {
	it('serves the nldd icon pack with a private cache', async () => {
		const res = iconen({ locals: { user } } as never) as Response;
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('private, max-age=3600');
		const pack = await res.json();
		expect(pack.prefix).toBe('nldd');
		expect(pack.icons.bell.body).toContain('<path');
	});

	it('401 without a user', () => {
		expect((iconen({ locals: { user: null } } as never) as Response).status).toBe(401);
	});
});
