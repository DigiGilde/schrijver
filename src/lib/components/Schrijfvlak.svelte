<script lang="ts">
	import { tick } from 'svelte';
	import type { TextEditorState } from '@nldd/design-system/text-editor';
	import AfbeeldingDialoog from './AfbeeldingDialoog.svelte';
	import Assistent from './Assistent.svelte';
	import Editor from './Editor.svelte';
	import Voorbeeld from './Voorbeeld.svelte';
	import Werkbalk, { type Actie, type Weergave } from './Werkbalk.svelte';
	import * as actions from '$lib/client/editor-actions';
	import { addImage, uniqueImage, type PendingImage } from '$lib/client/pending-images';
	import { previewImages } from '$lib/content/markdown-preview';

	type Props = {
		body: string;
		images: PendingImage[];
		siteId: string;
		pagina: string;
		branch: string | null;
		afbeeldingen: boolean;
		/** Fills the description field with a summary; null when the page has none. */
		onsamenvatting?: ((text: string) => void) | null;
		/** Opens the page properties; null when the page has none. */
		oneigenschappen?: (() => void) | null;
		/** The sticky bars above the page; the caret stays below them. */
		kop?: HTMLElement;
	};
	let {
		body = $bindable(),
		images = $bindable(),
		siteId,
		pagina,
		branch,
		afbeeldingen,
		onsamenvatting = null,
		oneigenschappen = null,
		kop
	}: Props = $props();

	let editor: ReturnType<typeof Editor> | undefined = $state();
	let editorState = $state<TextEditorState | null>(null);
	let weergave = $state<Weergave>('schrijven');
	let dialogOpen = $state(false);
	let dialogFile = $state<File | null>(null);
	let hulpOpen = $state(false);
	let hulpPaneel: HTMLElement | undefined = $state();
	let voorbeeld: HTMLElement | undefined = $state();
	let returnFocus: HTMLElement | null = null;

	/*
	 * On a narrow screen the panel opens below the text and its toggle sits in the toolbar menu,
	 * so the panel takes the focus; beside the text on a wide screen the toggle keeps it.
	 */
	async function wisselHulp() {
		hulpOpen = !hulpOpen;
		if (!hulpOpen || window.matchMedia('(min-width: 1008px)').matches) return;
		await tick();
		hulpPaneel?.focus({ preventScroll: true });
		hulpPaneel?.scrollIntoView({ block: 'start' });
	}

	/**
	 * Puts focus in the editor, switching back from the preview when that is showing. With `wissel`
	 * false the preview stays and takes the focus itself.
	 */
	export async function focus(wissel = true) {
		if (weergave !== 'schrijven') {
			if (!wissel) return voorbeeld?.focus();
			weergave = 'schrijven';
			await tick();
		}
		editor?.focus();
	}

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
		actions.restoreFocus(returnFocus, () => void focus(false));
		returnFocus = null;
	}

	const dnd = actions.dropHandlers((file) => openDialog(file));
</script>

<Werkbalk
	state={editorState}
	onactie={onActie}
	onkop={(niveau) => editor?.toggleHeading(niveau)}
	onafbeelding={() => openDialog()}
	onmermaid={() => actions.insertMermaid(editor, body)}
	{afbeeldingen}
	{weergave}
	onweergave={(keuze) => (weergave = keuze)}
	{oneigenschappen}
	schrijfhulpOpen={hulpOpen}
	onschrijfhulp={wisselHulp}
/>

<div class="vlak" class:met-hulp={hulpOpen}>
	<div class="tekst">
		<!-- Hidden rather than unmounted while the preview shows: the editor keeps its undo history and selection. -->
		<div
			role="presentation"
			class:verborgen={weergave !== 'schrijven'}
			ondropcapture={afbeeldingen ? dnd.ondrop : undefined}
			ondragovercapture={afbeeldingen ? dnd.ondragover : undefined}
			onpastecapture={afbeeldingen ? dnd.onpaste : undefined}
		>
			<Editor bind:this={editor} bind:value={body} onstate={(s) => (editorState = s)} {kop} />
		</div>
		{#if weergave === 'voorbeeld'}
			<section aria-label="Voorbeeld" tabindex="-1" bind:this={voorbeeld}>
				<nldd-card>
					<nldd-container padding="24" sm-padding="16">
						<Voorbeeld
							value={body}
							resolveImage={previewImages({ siteId, page: pagina, ref: branch, pending: images })}
						/>
					</nldd-container>
				</nldd-card>
			</section>
		{/if}
	</div>

	<aside
		bind:this={hulpPaneel}
		class="hulp"
		id="schrijfhulp-paneel"
		aria-label="Schrijfhulp"
		tabindex="-1"
		hidden={!hulpOpen}
	>
		{#if hulpOpen}
			<Assistent
				{siteId}
				getSelection={() => actions.currentSelection(editor, body)}
				getAll={() => body}
				onApply={(from, to, text, original) =>
					actions.applySuggestion(editor, body, from, to, text, original)}
				onMark={(from, to) => actions.markRange(editor, body, from, to)}
				onUnmark={() => editor?.setAnnotations([])}
				onDone={() => void focus()}
				onSummary={onsamenvatting}
			/>
		{/if}
	</aside>
</div>

<AfbeeldingDialoog
	bind:open={dialogOpen}
	bind:file={dialogFile}
	{siteId}
	{pagina}
	{branch}
	oninvoegen={(alt, result) =>
		(images = addImage(images, actions.insertImage(editor, alt, uniqueImage(images, result))))}
	onclose={closeDialog}
/>

<style>
	.vlak {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	.tekst {
		min-width: 0;
	}
	.verborgen {
		display: none;
	}
	.hulp {
		border: 1px solid currentColor;
		border-radius: 8px;
		padding: 16px;
	}
	@media (min-width: 1008px) {
		.vlak.met-hulp {
			grid-template-columns: minmax(0, 1fr) 22rem;
		}
		/* Beside a long text the panel stays in view, below the sticky bars the page reports. */
		.hulp {
			position: sticky;
			top: calc(var(--context-inset-top, 0px) + 16px);
			max-height: calc(100dvh - var(--context-inset-top, 0px) - 32px);
			overflow-y: auto;
		}
	}
</style>
