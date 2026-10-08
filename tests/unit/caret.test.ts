import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepCaretBelow } from '../../src/lib/client/caret';

const bar = (bottom: number) =>
	({ getBoundingClientRect: () => ({ bottom }) }) as unknown as Element;
const header = bar(111);
const caret = (top: number | null, empty = true) => ({
	getSelection: () => ({ empty, rect: top === null ? null : ({ top } as DOMRect) })
});
const sticky = (...bars: Element[]) =>
	vi.stubGlobal('document', {
		querySelectorAll: (selector: string) => (selector === '[data-plakt]' ? bars : [])
	});

beforeEach(() => sticky());
afterEach(() => vi.unstubAllGlobals());

describe('keepCaretBelow', () => {
	it('scrolls up by the overlap and a margin when the caret is under the bars', () => {
		const scrollBy = vi.fn();
		vi.stubGlobal('window', { scrollBy });
		keepCaretBelow(caret(5), header);
		expect(scrollBy).toHaveBeenCalledWith({ top: -114, behavior: 'instant' });
	});

	it('keeps the caret below a sticky toolbar under the header too', () => {
		const scrollBy = vi.fn();
		vi.stubGlobal('window', { scrollBy });
		sticky(bar(155), bar(0));
		keepCaretBelow(caret(140), header);
		expect(scrollBy).toHaveBeenCalledWith({ top: -23, behavior: 'instant' });
	});

	it('leaves a caret below the bars, a selection and an unmeasured caret alone', () => {
		const scrollBy = vi.fn();
		vi.stubGlobal('window', { scrollBy });
		keepCaretBelow(caret(119), header);
		keepCaretBelow(caret(5, false), header);
		keepCaretBelow(caret(null), header);
		sticky(bar(155));
		keepCaretBelow(caret(163), header);
		expect(scrollBy).not.toHaveBeenCalled();
	});
});
