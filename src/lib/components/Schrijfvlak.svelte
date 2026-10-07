<script lang="ts">
	import type { TextEditorState } from '@nldd/design-system/text-editor';
	import AfbeeldingDialoog from './AfbeeldingDialoog.svelte';
	import Assistent from './Assistent.svelte';
	import Editor from './Editor.svelte';
	import Voorbeeld from './Voorbeeld.svelte';
	import Werkbalk, { type Actie } from './Werkbalk.svelte';
	import * as actions from '$lib/client/editor-actions';
	import { addImage, type PendingImage } from '$lib/client/pending-images';

	type Props = {
		editor?: ReturnType<typeof Editor>;
		body: string;
		images: PendingImage[];
		siteId: string;
		pagina: string;
		afbeeldingen: boolean;
	};
	let {
		editor = $bindable(),
		body = $bindable(),
		images = $bindable(),
		siteId,
		pagina,
		afbeeldingen
	}: Props = $props();

	let editorState = $state<TextEditorState | null>(null);
	let tab = $state<'schrijven' | 'voorbeeld'>('schrijven');
	let dialogOpen = $state(false);
	let dialogFile = $state<File | null>(null);
	let hulpOpen = $state(false);
	let returnFocus: HTMLElement | null = null;

	function onActie(actie: Actie) {
		const commands = {
			bold: () => editor?.toggleBold(),
			italic: () => editor?.toggleItalic(),
			bullet: () => editor?.toggleBulletList(),
			quote: () => editor?.toggleQuote(),
			link: () => editor?.toggleLink(),
			code: () => editor?.toggleInlineCode()
		};
		commands[actie]();
	}

	function openDialog(file: File | null = null) {
		returnFocus = actions.focusTarget();
		dialogFile = file;
		dialogOpen = true;
	}

	function closeDialog() {
		actions.restoreFocus(returnFocus, editor);
		returnFocus = null;
	}

	const dnd = actions.dropHandlers((file) => openDialog(file));

	function onTabChange(event: Event) {
		const item = (event as CustomEvent<{ item: HTMLElement }>).detail.item;
		tab = item.dataset.tab === 'voorbeeld' ? 'voorbeeld' : 'schrijven';
	}
</script>

<nldd-tab-bar class="tabs" accessible-label="Weergave" ontabchange={onTabChange}>
	<nldd-tab-bar-item
		data-tab="schrijven"
		text="Schrijven"
		current={tab === 'schrijven' || undefined}
	></nldd-tab-bar-item>
	<nldd-tab-bar-item
		data-tab="voorbeeld"
		text="Voorbeeld"
		current={tab === 'voorbeeld' || undefined}
	></nldd-tab-bar-item>
</nldd-tab-bar>

<div class="panelen">
	<section class="paneel" class:verborgen={tab !== 'schrijven'} aria-label="Schrijven">
		<Werkbalk
			state={editorState}
			onactie={onActie}
			onkop={(niveau) => editor?.toggleHeading(niveau)}
			onafbeelding={() => openDialog()}
			onmermaid={() => actions.insertMermaid(editor, body)}
			{afbeeldingen}
			schrijfhulpOpen={hulpOpen}
			onschrijfhulp={() => (hulpOpen = !hulpOpen)}
		/>
		<div
			role="presentation"
			ondropcapture={afbeeldingen ? dnd.ondrop : undefined}
			ondragovercapture={afbeeldingen ? dnd.ondragover : undefined}
			onpastecapture={afbeeldingen ? dnd.onpaste : undefined}
		>
			<Editor bind:this={editor} bind:value={body} onstate={(s) => (editorState = s)} />
		</div>
	</section>
	<section class="paneel" class:verborgen={tab !== 'voorbeeld'} aria-label="Voorbeeld">
		<Voorbeeld value={body} />
	</section>
</div>

<aside class="hulp" id="schrijfhulp-paneel" hidden={!hulpOpen}>
	{#if hulpOpen}
			<Assistent
			{siteId}
			getSelection={() => actions.currentSelection(editor, body)}
			getAll={() => body}
			onApply={(from, to, text, original) =>
				actions.applySuggestion(editor, body, from, to, text, original)}
			onMark={(from, to) => actions.markRange(editor, body, from, to)}
			onUnmark={() => editor?.setAnnotations([])}
		/>
	{/if}
</aside>

<AfbeeldingDialoog
	bind:open={dialogOpen}
	bind:file={dialogFile}
	{siteId}
	{pagina}
	oninvoegen={(alt, result) => (images = addImage(images, actions.insertImage(editor, alt, result)))}
	onclose={closeDialog}
/>

<style>
	.panelen {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
	}
	.paneel {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.paneel.verborgen {
		display: none;
	}
	.hulp {
		border: 1px solid currentColor;
		border-radius: 8px;
		padding: 16px;
	}
	@media (min-width: 1024px) {
		.panelen {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.paneel.verborgen {
			display: flex;
		}
		.tabs {
			display: none;
		}
	}
</style>
