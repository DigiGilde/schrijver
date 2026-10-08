import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepCaretBelow } from '../../src/lib/client/caret';

const bars = { getBoundingClientRect: () => ({ bottom: 111 }) } as unknown as Element;
const caret = (top: number | null, empty = true) => ({
	getSelection: () => ({ empty, rect: top === null ? null : ({ top } as DOMRect) })
});

afterEach(() => vi.unstubAllGlobals());

describe('keepCaretBelow', () => {
	it('scrolls up by the overlap and a margin when the caret is under the bars', () => {
		const scrollBy = vi.fn();
		vi.stubGlobal('window', { scrollBy });
		keepCaretBelow(caret(5), bars);
		expect(scrollBy).toHaveBeenCalledWith({ top: -114, behavior: 'instant' });
	});

	it('leaves a caret below the bars, a selection and an unmeasured caret alone', () => {
		const scrollBy = vi.fn();
		vi.stubGlobal('window', { scrollBy });
		keepCaretBelow(caret(119), bars);
		keepCaretBelow(caret(5, false), bars);
		keepCaretBelow(caret(null), bars);
		expect(scrollBy).not.toHaveBeenCalled();
	});
});
