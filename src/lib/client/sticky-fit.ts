/** The room kept free below a sticky panel. */
const MARGIN = 16;

/** Whether a panel of `height` pixels, held `top` pixels from the top of the window, ends clear of its bottom. */
export function fitsInWindow(top: number, height: number, viewport: number): boolean {
	return top + height + MARGIN <= viewport;
}

/**
 * Reports whether `node` fits in the window below its sticky `top`: at once, and again whenever the
 * node or the window changes size. The returned function stops it.
 */
export function watchFit(node: HTMLElement, set: (fits: boolean) => void): () => void {
	const measure = () => {
		const top = parseFloat(getComputedStyle(node).top) || 0;
		set(fitsInWindow(top, node.offsetHeight, window.innerHeight));
	};
	const observer = new ResizeObserver(measure);
	observer.observe(node);
	window.addEventListener('resize', measure);
	measure();
	return () => {
		observer.disconnect();
		window.removeEventListener('resize', measure);
	};
}
