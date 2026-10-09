import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fitsInWindow, watchFit } from '../../src/lib/client/sticky-fit';

describe('fitsInWindow', () => {
	it('fits when the panel and a margin below it end inside the window', () => {
		expect(fitsInWindow(200, 584, 800)).toBe(true);
		expect(fitsInWindow(200, 585, 800)).toBe(false);
	});

	it('does not fit a panel as tall as the window', () => {
		expect(fitsInWindow(0, 800, 800)).toBe(false);
	});
});

describe('watchFit', () => {
	let height = 435;
	let top = '177px';
	let viewport = 900;
	let observe: ReturnType<typeof vi.fn>;
	let disconnect: ReturnType<typeof vi.fn>;
	let resized: (() => void) | undefined;
	const listeners = new Map<string, () => void>();
	const node = {
		get offsetHeight() {
			return height;
		}
	} as HTMLElement;

	beforeEach(() => {
		height = 435;
		top = '177px';
		viewport = 900;
		listeners.clear();
		observe = vi.fn();
		disconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: () => void) {
					resized = callback;
				}
				observe = observe;
				disconnect = disconnect;
			}
		);
		vi.stubGlobal('window', {
			get innerHeight() {
				return viewport;
			},
			addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
			removeEventListener: (type: string, listener: () => void) => {
				if (listeners.get(type) === listener) listeners.delete(type);
			}
		});
		vi.stubGlobal('getComputedStyle', () => ({ top }));
	});
	afterEach(() => vi.unstubAllGlobals());

	it('reports at once whether the panel fits below its sticky offset', () => {
		const set = vi.fn();
		watchFit(node, set);
		expect(set).toHaveBeenCalledExactlyOnceWith(true);
		expect(observe).toHaveBeenCalledWith(node);

		height = 720;
		const taller = vi.fn();
		watchFit(node, taller);
		expect(taller).toHaveBeenCalledExactlyOnceWith(false);
	});

	it('measures again when the panel changes size', () => {
		const set = vi.fn();
		watchFit(node, set);
		height = 720;
		resized!();
		expect(set).toHaveBeenLastCalledWith(false);
		height = 300;
		resized!();
		expect(set).toHaveBeenLastCalledWith(true);
	});

	it('measures again when the window changes size', () => {
		const set = vi.fn();
		watchFit(node, set);
		viewport = 600;
		listeners.get('resize')!();
		expect(set).toHaveBeenLastCalledWith(false);
		viewport = 1100;
		listeners.get('resize')!();
		expect(set).toHaveBeenLastCalledWith(true);
	});

	it('measures again when the sticky offset moves', () => {
		const set = vi.fn();
		watchFit(node, set);
		top = '500px';
		resized!();
		expect(set).toHaveBeenLastCalledWith(false);
	});

	it('counts an offset that is not a length as none', () => {
		top = 'auto';
		height = 880;
		const set = vi.fn();
		watchFit(node, set);
		expect(set).toHaveBeenCalledExactlyOnceWith(true);
	});

	it('stops observing and listening when cleaned up', () => {
		const stop = watchFit(node, vi.fn());
		expect(listeners.has('resize')).toBe(true);
		stop();
		expect(disconnect).toHaveBeenCalledOnce();
		expect(listeners.has('resize')).toBe(false);
	});
});
