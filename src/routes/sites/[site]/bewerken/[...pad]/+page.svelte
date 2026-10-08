<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { PageData } from './$types';
	import ConceptBanner from '$lib/components/ConceptBanner.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import FrontmatterFormulier from '$lib/components/FrontmatterFormulier.svelte';
	import LeesAlleenBanner from '$lib/components/LeesAlleenBanner.svelte';
	import Opslaan from '$lib/components/Opslaan.svelte';
	import Pagina from '$lib/components/Pagina.svelte';
	import Schrijfvlak from '$lib/components/Schrijfvlak.svelte';
	import {
		readDraft,
		restoredValue,
		writeDraft as storeDraft,
		type Draft
	} from '$lib/client/draft';
	import { withoutSent, type PendingImage } from '$lib/client/pending-images';
	import { parsePage } from '$lib/content/frontmatter';
	import { applyForm, summaryField, withValue, type FormField } from '$lib/content/schema-form';

	let { data }: { data: PageData } = $props();

	const SAVE_DELAY_MS = 500;
	const BRANCH = 'new';

	/* The page is keyed by route, so the props are the initial values of the editing session. */
	// svelte-ignore state_referenced_locally
	let body = $state(data.body);
	// svelte-ignore state_referenced_locally
	let fields = $state<FormField[]>(data.form);
	let editor: ReturnType<typeof Editor> | undefined = $state();
	let restorable = $state<Draft | null>(null);
	let ready = $state(false);
	let images = $state<PendingImage[]>([]);
	let imagesLost = $state(false);

	const readOnly = $derived(data.readOnly);
	const samenvattingVeld = $derived(summaryField(fields));
	const openbaarConcept = $derived(data.site.concepten === 'openbaar' && data.isPublic);
	// svelte-ignore state_referenced_locally
	let baseSha = $state(data.sha);
	// svelte-ignore state_referenced_locally
	let activeBranch = $state(data.branch);
	const storageKey = $derived(`schrijver:${data.site.id}:${activeBranch ?? BRANCH}:${data.path}`);

	function currentFrontmatter(): Record<string, unknown> {
		return applyForm(fields, data.frontmatter).frontmatter;
	}

	function writeDraft(draft: Draft | null) {
		imagesLost = !storeDraft(storageKey, draft) && !!draft;
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
			const draft = readDraft(storageKey);
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
					sha: baseSha,
					images
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
		images = restorable.images ?? [];
		fields = fields.map((field) => ({
			...field,
			value: restoredValue(field, frontmatter[field.key])
		}));
		restorable = null;
	}

	function discard() {
		writeDraft(null);
		restorable = null;
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
</script>

<svelte:head><title>{data.path} bewerken · {data.site.naam} · Schrijver</title></svelte:head>

<Pagina
	titel={data.path}
	ondertitel={openbaarConcept ? 'Openbaar concept' : undefined}
	terug={{ href: `/sites/${data.site.id}`, tekst: data.site.naam }}
>
	<nldd-container gap="16">
		{#if readOnly}
			<LeesAlleenBanner {readOnly} />
		{/if}

		{#if restorable}
			<ConceptBanner
				verouderd={restorable.sha !== baseSha}
				onherstel={() => {
					restore();
					editor?.focus();
				}}
				onweggooien={() => {
					discard();
					editor?.focus();
				}}
			/>
		{/if}

		{#if !readOnly}
			<FrontmatterFormulier {fields} onchange={(next) => (fields = next)} />

			<Schrijfvlak
				bind:editor
				bind:body
				bind:images
				siteId={data.site.id}
				pagina={data.repoPath}
				branch={activeBranch}
				afbeeldingen={data.site.afbeeldingen}
				onsamenvatting={samenvattingVeld
					? (text) => (fields = withValue(fields, samenvattingVeld, text))
					: null}
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
					tekst={body}
					images={() => images}
					onverstuurd={(sent) => (images = withoutSent(images, sent))}
					labels={Object.fromEntries(fields.map((f) => [f.key, f.def.label ?? f.key]))}
					onveldfouten={(fouten) =>
						(fields = fields.map((f) => ({ ...f, error: fouten[f.key] ?? null })))}
					focusEditor={() => editor?.focus()}
				/>
				{#if images.length}
					<nldd-text color="secondary" size="sm"
						>Afbeeldingen worden meegestuurd bij het bewaren</nldd-text
					>
				{/if}
				{#if imagesLost}
					<nldd-text color="secondary" size="sm" role="status">
						Afbeeldingen konden niet lokaal worden bewaard; voeg ze opnieuw toe na een herlaad
					</nldd-text>
				{/if}
				{#if openbaarConcept}
					<nldd-text color="secondary" size="sm">
						Dit concept komt als voorstel op GitHub en is openbaar leesbaar, ook voordat je het
						instuurt.
					</nldd-text>
				{/if}
			</div>
		{/if}
	</nldd-container>
</Pagina>

<style>
	.opslaan {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
</style>
