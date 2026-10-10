import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mermaid', () => ({ default: { registerIconPacks: vi.fn() } }));

const PACK = { prefix: 'nldd', width: 24, height: 24, icons: {}, aliases: {} };

/** The loader that the preview registers for the nldd icons, as Mermaid would call it. */
async function iconLoader(): Promise<() => Promise<unknown>> {
	const { loadMermaid } = await import('../../src/lib/client/mermaid-preview');
	const { default: mermaid } = await import('mermaid');
	await loadMermaid();
	const [[[pack]]] = vi.mocked(mermaid.registerIconPacks).mock.calls;
	if (!('loader' in pack)) throw new Error('the preview registers the icons with a loader');
	return pack.loader;
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('the nldd icon pack of the Mermaid preview', () => {
	it('is fetched and parsed once, however often Mermaid asks for it', async () => {
		const fetchPack = vi.fn(async () => Response.json(PACK));
		vi.stubGlobal('fetch', fetchPack);
		const loader = await iconLoader();
		const [first, second, third] = await Promise.all([loader(), loader(), loader()]);
		expect(fetchPack).toHaveBeenCalledTimes(1);
		expect(first).toEqual(PACK);
		expect(second).toBe(first);
		expect(third).toBe(first);
		expect(await loader()).toBe(first);
		expect(fetchPack).toHaveBeenCalledTimes(1);
	});

	it('is asked for again after a failed fetch', async () => {
		const fetchPack = vi
			.fn()
			.mockResolvedValueOnce(new Response('kapot', { status: 500 }))
			.mockResolvedValueOnce(Response.json(PACK));
		vi.stubGlobal('fetch', fetchPack);
		const loader = await iconLoader();
		await expect(loader()).rejects.toThrow('500');
		expect(await loader()).toEqual(PACK);
		expect(fetchPack).toHaveBeenCalledTimes(2);
	});
});
