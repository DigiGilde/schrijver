import { GET } from '../../src/routes/healthz/+server';
import { describe, it, expect } from 'vitest';
describe('healthz', () => {
	it('returns ok', async () => {
		const res = await GET();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: 'ok' });
	});
});
