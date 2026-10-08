import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
	RULE,
	TABLE_TEMPLATE,
	editorBeside,
	insertBlock,
	toggleCodeBlock,
	toggleList,
	type FormattingEditor
} from '../../src/lib/client/editor-actions';

/**
 * A stand-in for nldd-text-editor with its documented offsets and caret placement. Its code block
 * command fences the caret's line and leaves the caret where it was, as the editor does on an
 * empty line: before the opening fence.
 */
function fakeEditor(initial: string, start = initial.length, end = start) {
	let text = initial;
	const calls: string[] = [];
	const editor: FormattingEditor & { calls: string[]; caret: () => number } = {
		get value() {
			return text;
		},
		calls,
		caret: () => start,
		getSelection: () => ({ start, end }),
		insertAtCursor(insert) {
			text = text.slice(0, start) + insert + text.slice(end);
			start = end = start + insert.length;
		},
		replaceRange(from, to, insert) {
			text = text.slice(0, from) + insert + text.slice(to);
			start = end = from + insert.length;
		},
		setList: (type) => calls.push(`setList:${type}`),
		indent: () => calls.push('indent'),
		outdent: () => calls.push('outdent'),
		toggleCodeBlock() {
			const from = text.lastIndexOf('\n', start - 1) + 1;
			const next = text.indexOf('\n', start);
			const to = next === -1 ? text.length : next;
			text = `${text.slice(0, from)}\`\`\`\n${text.slice(from, to)}\n\`\`\`${text.slice(to)}`;
			if (start !== from) start = end = start + 4;
		}
	};
	return editor;
}

describe('insertBlock', () => {
	it('separates the block from the paragraph before it and leaves the caret after it', () => {
		const editor = fakeEditor('Inleiding');
		insertBlock(editor, TABLE_TEMPLATE);
		expect(editor.value).toBe(`Inleiding\n\n${TABLE_TEMPLATE}\n\n`);
		expect(editor.caret()).toBe(editor.value.length);
	});

	it('adds no blank lines that are already there', () => {
		const editor = fakeEditor('Boven\n\nOnder', 'Boven\n\n'.length);
		insertBlock(editor, RULE);
		expect(editor.value).toBe('Boven\n\n---\n\nOnder');
	});

	it('splits a paragraph when the caret is inside it', () => {
		const editor = fakeEditor('Eerste helft. Tweede helft.', 'Eerste helft.'.length);
		insertBlock(editor, RULE);
		expect(editor.value).toBe('Eerste helft.\n\n---\n\n Tweede helft.');
	});

	it('puts a block in an empty text without a blank line before it', () => {
		const editor = fakeEditor('');
		insertBlock(editor, RULE);
		expect(editor.value).toBe('---\n\n');
	});
});

describe('toggleCodeBlock', () => {
	it('moves the caret from the opening fence into the block', () => {
		const editor = fakeEditor('Voor\n\n');
		toggleCodeBlock(editor);
		expect(editor.value).toBe('Voor\n\n```\n\n```');
		expect(editor.caret()).toBe('Voor\n\n```\n'.length);
	});

	it('leaves a caret inside the text where the editor put it', () => {
		const editor = fakeEditor('npm test', 3);
		toggleCodeBlock(editor);
		expect(editor.value).toBe('```\nnpm test\n```');
		expect(editor.caret()).toBe('```\nnpm'.length);
	});
});

describe('toggleList', () => {
	it('sets the list type, or clears the active one', () => {
		const editor = fakeEditor('tekst');
		toggleList(editor, 'ordered', false);
		toggleList(editor, 'ordered', true);
		toggleList(editor, 'bullet', false);
		expect(editor.calls).toEqual(['setList:ordered', 'setList:none', 'setList:bullet']);
	});
});

describe('editorBeside', () => {
	it('finds the editor rendered next to the toolbar', () => {
		const { document } = new JSDOM(
			'<main><nldd-toolbar></nldd-toolbar><div><nldd-text-editor></nldd-text-editor></div></main>'
		).window;
		const toolbar = document.querySelector('nldd-toolbar')!;
		expect(editorBeside(toolbar)).toBe(document.querySelector('nldd-text-editor'));
		expect(editorBeside(undefined)).toBeNull();
	});
});
