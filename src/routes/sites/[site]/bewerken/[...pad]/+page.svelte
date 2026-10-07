<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { TextEditorState } from '@nldd/design-system/text-editor';
	import type { PageData } from './$types';
	import AfbeeldingDialoog from '../../../../../components/AfbeeldingDialoog.svelte';
	import Assistent from '../../../../../components/Assistent.svelte';
	import Editor from '../../../../../components/Editor.svelte';
	import FrontmatterFormulier from '../../../../../components/FrontmatterFormulier.svelte';
	import Opslaan from '../../../../../components/Opslaan.svelte';
	import Voorbeeld from '../../../../../components/Voorbeeld.svelte';
	import Werkbalk, { type Actie } from '../../../../../components/Werkbalk.svelte';
	import { addImage, withoutSent, type PendingImage } from '$lib/client/pending-images';
	import { mermaidScaffold } from '$lib/content/mermaid';
	import { parsePage } from '$lib/content/frontmatter';
	import { applyForm, type FormField } from '$lib/content/schema-form';

	let { data }: { data: PageData } = $props();

	const SAVE_DELAY_MS = 500;
	const BRANCH = 'new';

	/* The page is keyed by route, so the props are the initial values of the editing session. */
	// svelte-ignore state_referenced_locally
	let body = $state(data.body);
	// svelte-ignore state_referenced_locally
	let fields = $state<FormField[]>(data.form);
	let editor: ReturnType<typeof Editor> | undefined = $state();
	let editorState = $state<TextEditorState | null>(null);
	let tab = $state<'schrijven' | 'voorbeeld'>('schrijven');
	let restorable = $state<Draft | null>(null);
	let ready = $state(false);
	let images = $state<PendingImage[]>([]);
	let dialogOpen = $state(false);
	let dialogFile = $state<File | null>(null);
	let hulpOpen = $state(false);
	let returnFocus: HTMLElement | null = null;

	type Draft = {
		path: string;
		body: string;
		frontmatter: Record<string, unknown>;
		at: number;
		sha?: string | null;
	};

	const readOnly = $derived(data.readOnly);
	const leesAlleenTekst = {
		toml: 'Deze pagina gebruikt TOML-frontmatter, dat Schrijver nog niet ondersteunt.',
		'yaml-error': 'De frontmatter van deze pagina bevat een fout en kan niet veilig worden bewerkt.',
		unterminated: 'De frontmatter van deze pagina is niet afgesloten met ---.'
	};
	const openbaarConcept = $derived(data.site.concepten === 'openbaar' && data.isPublic);
	// svelte-ignore state_referenced_locally
	let baseSha = $state(data.sha);
	// svelte-ignore state_referenced_locally
	let activeBranch = $state(data.branch);
	const storageKey = $derived(`schrijver:${data.site.id}:${activeBranch ?? BRANCH}:${data.path}`);

	function currentFrontmatter(): Record<string, unknown> {
		return applyForm(fields, data.frontmatter).frontmatter;
	}

	function readDraft(): Draft | null {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return null;
			const draft = JSON.parse(raw) as Draft;
			return typeof draft?.body === 'string' && draft.frontmatter && typeof draft.at === 'number'
				? draft
				: null;
		} catch {
			return null;
		}
	}

	function writeDraft(draft: Draft | null) {
		try {
			if (draft) localStorage.setItem(storageKey, JSON.stringify(draft));
			else localStorage.removeItem(storageKey);
		} catch {
			/* storage unavailable or full: the safety net is best effort */
		}
	}

	function sameAsServer(draft: { body: string; frontmatter: Record<string, unknown> }) {
		return (
			draft.body === data.body &&
			JSON.stringify(draft.frontmatter) ===
				JSON.stringify(applyForm(data.form, data.frontmatter).frontmatter)
		);
	}

	onMount(() => {
		if (!readOnly) {
			const draft = readDraft();
			if (draft && !sameAsServer(draft)) restorable = draft;
			else if (draft) writeDraft(null);
		}
		ready = true;
	});

	let timer: ReturnType<typeof setTimeout> | undefined;
	let flushPending: (() => void) | null = null;
	function flush() {
		clearTimeout(timer);
		flushPending?.();
		flushPending = null;
	}
	$effect(() => {
		const snapshot = { body, fields };
		if (!ready || restorable || readOnly) return;
		clearTimeout(timer);
		flushPending = () => {
			const frontmatter = applyForm(snapshot.fields, data.frontmatter).frontmatter;
			if (sameAsServer({ body: snapshot.body, frontmatter })) writeDraft(null);
			else
				writeDraft({
					path: data.path,
					body: snapshot.body,
					frontmatter,
					at: Date.now(),
					sha: baseSha
				});
		};
		timer = setTimeout(flush, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	});
	onMount(() => {
		window.addEventListener('pagehide', flush);
		return () => window.removeEventListener('pagehide', flush);
	});
	onDestroy(() => {
		if (typeof window !== 'undefined') flush();
	});

	function restore() {
		if (!restorable) return;
		const frontmatter = restorable.frontmatter;
		body = restorable.body;
		fields = fields.map((field) => ({
			...field,
			value: restoredValue(field, frontmatter[field.key])
		}));
		restorable = null;
	}

	function restoredValue(field: FormField, raw: unknown): unknown {
		if (field.def.type === 'ja-nee') return typeof raw === 'boolean' ? raw : null;
		if (field.def.type === 'paginaverwijzing' && field.def.meervoud)
			return Array.isArray(raw) ? raw : [];
		return raw ?? '';
	}

	function discard() {
		writeDraft(null);
		restorable = null;
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
		const active = document.activeElement;
		returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
		dialogFile = file;
		dialogOpen = true;
	}

	function closeDialog() {
		const target = returnFocus;
		returnFocus = null;
		setTimeout(() => (target?.isConnected ? target.focus() : editor?.focus()), 0);
	}

	function imageFrom(list: FileList | null | undefined): File | null {
		return Array.from(list ?? []).find((f) => f.type.startsWith('image/')) ?? null;
	}

	function onDrop(event: DragEvent) {
		const file = imageFrom(event.dataTransfer?.files);
		if (!file) return;
		event.preventDefault();
		event.stopPropagation();
		openDialog(file);
	}

	function onDragOver(event: DragEvent) {
		if (Array.from(event.dataTransfer?.items ?? []).some((i) => i.kind === 'file')) event.preventDefault();
	}

	function onPaste(event: ClipboardEvent) {
		const file = imageFrom(event.clipboardData?.files);
		if (!file) return;
		event.preventDefault();
		event.stopPropagation();
		openDialog(file);
	}

	function imageInserted(alt: string, result: { repoPath: string; markdownRef: string; base64: string }) {
		images = addImage(images, { path: result.repoPath, base64: result.base64 });
		editor?.insertAtCursor(`![${alt.replace(/[[\]]/g, '')}](${result.markdownRef})`);
	}

	function insertMermaid() {
		const sel = editor?.getSelection();
		const before = sel ? body.slice(0, sel.start) : body;
		const prefix = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
		editor?.insertAtCursor(prefix + mermaidScaffold());
		editor?.focus();
	}

	function selection() {
		const sel = editor?.getSelection();
		return sel && !sel.empty ? { text: body.slice(sel.start, sel.end), from: sel.start, to: sel.end } : null;
	}

	function mark(from: number, to: number) {
		editor?.setAnnotations([{ id: 'schrijfhulp', start: from, end: to, quote: body.slice(from, to) }]);
	}

	function applySuggestion(from: number, to: number, replacement: string, original: string) {
		if (body.slice(from, to) !== original) {
			return 'De tekst is intussen veranderd, het voorstel is niet overgenomen';
		}
		editor?.replaceRange(from, to, replacement);
		return null;
	}

	function neemOver(text: string) {
		const page = parsePage(text);
		if (!page.ok) return;
		body = page.body;
		fields = fields.map((field) => ({
			...field,
			value: restoredValue(field, page.frontmatter[field.key])
		}));
	}

	function onTabChange(event: Event) {
		const item = (event as CustomEvent<{ item: HTMLElement }>).detail.item;
		tab = item.dataset.tab === 'voorbeeld' ? 'voorbeeld' : 'schrijven';
	}
</script>

<svelte:head><title>{data.path} bewerken - {data.site.naam} - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<div>
		<nldd-title size="2" heading-level="1" text={data.path}></nldd-title>
		{#if openbaarConcept}
			<nldd-text color="secondary" size="sm">Openbaar concept</nldd-text>
		{/if}
	</div>

	{#if readOnly}
		<nldd-banner
			variant="warning"
			text="Deze pagina kan niet in Schrijver worden bewerkt"
			supporting-text={`${leesAlleenTekst[readOnly.reason as keyof typeof leesAlleenTekst] ?? 'De frontmatter van deze pagina kan niet worden gelezen.'} Je kunt het bestand wel bekijken en bewerken op GitHub.`}
		>
			<nldd-text color="secondary" size="sm">{readOnly.message}</nldd-text>
			<nldd-button
				slot="actions"
				appearance="secondary"
				text="Open op GitHub"
				href={readOnly.githubUrl}
				target="_blank"
			></nldd-button>
		</nldd-banner>
	{/if}

	{#if restorable}
		<nldd-banner
			variant={restorable.sha === baseSha ? 'accent' : 'warning'}
			text="Niet-opgeslagen concept gevonden"
			supporting-text={restorable.sha === baseSha
				? undefined
				: 'De pagina is intussen gewijzigd; het concept is gebaseerd op een oudere versie'}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<nldd-button slot="actions" appearance="primary" text="Herstellen" onclick={() => { restore(); editor?.focus(); }}
			></nldd-button>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<nldd-button slot="actions" appearance="secondary" text="Weggooien" onclick={() => { discard(); editor?.focus(); }}
			></nldd-button>
		</nldd-banner>
	{/if}

	{#if !readOnly}
		<FrontmatterFormulier {fields} onchange={(next) => (fields = next)} />

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
					onmermaid={insertMermaid}
					schrijfhulpOpen={hulpOpen}
					onschrijfhulp={() => (hulpOpen = !hulpOpen)}
				/>
				<div role="presentation" ondropcapture={onDrop} ondragovercapture={onDragOver} onpastecapture={onPaste}>
					<Editor bind:this={editor} bind:value={body} onstate={(s) => (editorState = s)} />
				</div>
			</section>
			<section class="paneel" class:verborgen={tab !== 'voorbeeld'} aria-label="Voorbeeld">
				<Voorbeeld value={body} />
			</section>
		</div>

		{#if hulpOpen}
			<aside class="hulp" aria-label="Schrijfhulp">
				<Assistent
					siteId={data.site.id}
					getSelection={selection}
					getAll={() => body}
					onApply={applySuggestion}
					onMark={mark}
					onUnmark={() => editor?.setAnnotations([])}
				/>
			</aside>
		{/if}

		<AfbeeldingDialoog
			bind:open={dialogOpen}
			bind:file={dialogFile}
			siteId={data.site.id}
			pagina={data.repoPath}
			oninvoegen={imageInserted}
			onclose={closeDialog}
		/>

		<div class="opslaan">
			<Opslaan
				siteId={data.site.id}
				repoPath={data.repoPath}
				sha={data.sha}
				branch={data.branch}
				prNumber={data.prNumber}
				nieuw={data.nieuw}
				snapshot={() => ({ body, ...applyForm(fields, data.frontmatter) })}
				onbewaard={(saved) => {
					clearTimeout(timer);
					writeDraft(null);
					baseSha = saved.sha;
					activeBranch = saved.branch;
					flushPending = null;
					writeDraft(null);
				}}
				onovernemen={neemOver}
				onbasis={(sha) => (baseSha = sha)}
				images={() => images}
				onverstuurd={(sent) => (images = withoutSent(images, sent))}
				labels={Object.fromEntries(fields.map((f) => [f.key, f.def.label ?? f.key]))}
			/>
			{#if images.length}
				<p class="gedimd">Afbeeldingen worden meegestuurd bij het bewaren</p>
			{/if}
			{#if openbaarConcept}
				<p class="gedimd">
					Dit concept komt als voorstel op GitHub en is openbaar leesbaar, ook voordat je het
					instuurt.
				</p>
			{/if}
		</div>
	{/if}
</nldd-container>

<style>
	.gedimd {
		margin: 0;
		opacity: 0.7;
	}
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
	.opslaan {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
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
