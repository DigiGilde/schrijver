<script lang="ts">
	import type { NLDDTextEditor, TextEditorState } from '@nldd/design-system/text-editor';

	type Props = {
		value: string;
		readonly?: boolean;
		onstate?: (state: TextEditorState) => void;
	};
	let { value = $bindable(), readonly = false, onstate }: Props = $props();

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

	export const toggleBold = () => element?.toggleBold();
	export const toggleItalic = () => element?.toggleItalic();
	export const toggleHeading = (level: 2 | 3 | 4) => element?.toggleHeading(level);
	export const toggleBulletList = () => element?.toggleBulletList();
	export const toggleQuote = () => element?.toggleQuote();
	export const toggleLink = (href?: string) => element?.toggleLink(href);
	export const toggleInlineCode = () => element?.toggleInlineCode();
	export const insertAtCursor = (text: string) => element?.insertAtCursor(text);
	export const replaceRange = (from: number, to: number, text: string) =>
		element?.replaceRange(from, to, text);
	export const getSelection = () => element?.getSelection();
	export const getState = () => element?.getState();
</script>

<nldd-form-field label="Tekst">
	<nldd-text-editor
		bind:this={element}
		appearance="input-field"
		rows="20"
		{value}
		readonly={readonly ? true : undefined}
		oninput={onInput}
		onnldd-text-editor-state={onState}
	></nldd-text-editor>
</nldd-form-field>
