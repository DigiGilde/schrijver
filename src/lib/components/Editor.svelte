<script lang="ts">
	import { onMount } from 'svelte';
	import type { NLDDTextEditor, TextEditorState } from '@nldd/design-system/text-editor';
	import { keepCaretBelow } from '$lib/client/caret';
	import * as actions from '$lib/client/editor-actions';

	type Props = {
		value: string;
		readonly?: boolean;
		onstate?: (state: TextEditorState) => void;
		/** The sticky bars above the editor; the caret stays below them. */
		kop?: HTMLElement;
	};
	let { value = $bindable(), readonly = false, onstate, kop }: Props = $props();

	let element: NLDDTextEditor | undefined = $state();

	// The editable inside the shadow root also lets its native `input` event escape; only the component's own event carries the value.
	function onInput(event: Event) {
		if (!(event instanceof CustomEvent)) return;
		const next = (event.detail as { value?: string } | null)?.value;
		if (typeof next === 'string') value = next;
	}

	function onState(event: Event) {
		onstate?.((event as CustomEvent<TextEditorState>).detail);
	}

	/*
	 * nldd-text-editor-state only fires when a toggle state changes, so a caret move between two
	 * paragraphs goes unseen there; the document's selectionchange sees every move. The check waits
	 * for the next frame, after CodeMirror has scrolled the caret into view its own way.
	 */
	onMount(() => {
		let frame = 0;
		const onSelection = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				if (element && kop && element.matches(':focus-within')) keepCaretBelow(element, kop);
			});
		};
		document.addEventListener('selectionchange', onSelection);
		return () => {
			document.removeEventListener('selectionchange', onSelection);
			cancelAnimationFrame(frame);
		};
	});

	export const toggleBold = () => element?.toggleBold();
	export const toggleItalic = () => element?.toggleItalic();
	export const toggleHeading = (level: 2 | 3 | 4) => element?.toggleHeading(level);
	export const toggleList = (type: 'bullet' | 'ordered', active: boolean) =>
		actions.toggleList(element ?? null, type, active);
	export const indent = () => element?.indent();
	export const outdent = () => element?.outdent();
	export const toggleQuote = () => element?.toggleQuote();
	export const toggleLink = (href?: string) => element?.toggleLink(href);
	export const toggleInlineCode = () => element?.toggleInlineCode();
	export const toggleCodeBlock = () => actions.toggleCodeBlock(element ?? null);
	export const insertBlock = (block: string) => actions.insertBlock(element ?? null, block);
	export const insertAtCursor = (text: string) => element?.insertAtCursor(text);
	export const replaceRange = (from: number, to: number, text: string) =>
		element?.replaceRange(from, to, text);
	export const getSelection = () => element?.getSelection();
	export const focus = () => element?.focus();
	export const setAnnotations = (
		list: { id: string; start: number; end: number; quote?: string }[]
	) => {
		if (element) element.annotations = list;
	};
	export const getState = () => element?.getState();
</script>

<nldd-text-editor
	bind:this={element}
	appearance="input-field"
	rows="20"
	accessible-label="Tekst"
	{value}
	annotatable
	readonly={readonly ? true : undefined}
	oninput={onInput}
	onnldd-text-editor-state={onState}
></nldd-text-editor>
