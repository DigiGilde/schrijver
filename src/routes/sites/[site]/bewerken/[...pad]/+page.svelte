<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import type { PageData } from './$types';
	import ConceptBanner from '$lib/components/ConceptBanner.svelte';
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
	import { focusTarget, restoreFocus } from '$lib/client/editor-actions';
	import { pageReady } from '$lib/client/page-ready.svelte';
	import { withoutSent, type PendingImage } from '$lib/client/pending-images';
	import { parsePage } from '$lib/content/frontmatter';
	import {
		applyForm,
		pageTitle,
		summaryField,
		validateForm,
		withValue,
		type FormField
	} from '$lib/content/schema-form';

	let { data }: { data: PageData } = $props();

	const SAVE_DELAY_MS = 500;
	const BRANCH = 'new';

	/* The layout keys the page by file and branch: the props are the initial values of the session. */
	// svelte-ignore state_referenced_locally
	let body = $state(data.body);
	// svelte-ignore state_referenced_locally
	let fields = $state<FormField[]>(data.form);
	let schrijfvlak: ReturnType<typeof Schrijfvlak> | undefined = $state();
	let opslaan: ReturnType<typeof Opslaan> | undefined = $state();
	let bezig = $state(false);
	let knoptekst = $state('');
	let conflictOpen = $state(false);
	let eigenschappenOpen = $state(false);
	let kop: HTMLElement | undefined = $state();
	let restorable = $state<Draft | null>(null);
	let ready = $state(false);
	let images = $state<PendingImage[]>([]);
	let imagesLost = $state(false);

	const readOnly = $derived(data.readOnly);
	const samenvattingVeld = $derived(summaryField(fields));
	const openbaarConcept = $derived(data.site.concepten === 'openbaar' && data.isPublic);
	const titel = $derived(
		pageTitle(
			{ titel: data.titel },
			currentFrontmatter(),
			// Unparsed, the frontmatter is part of the text, and its comments would pass for a heading.
			readOnly ? '' : body,
			data.path
		)
	);
	// svelte-ignore state_referenced_locally
	let baseSha = $state(data.sha);
	// svelte-ignore state_referenced_locally
	let activeBranch = $state(data.branch);
	const storageKey = $derived(`schrijver:${data.site.id}:${activeBranch ?? BRANCH}:${data.path}`);

	function currentFrontmatter(): Record<string, unknown> {
		return applyForm(fields, data.frontmatter).frontmatter;
	}

	function writeDraft(draft: Draft | null, key = storageKey) {
		imagesLost = !storeDraft(key, draft) && !!draft;
	}

	function sameAsServer(
		draft: { body: string; frontmatter: Record<string, unknown> },
		server: PageData = data
	) {
		return (
			draft.body === server.body &&
			JSON.stringify(draft.frontmatter) ===
				JSON.stringify(applyForm(server.form, server.frontmatter).frontmatter)
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
		// Taken now: a flush while the page leaves runs when `data` already holds the next page.
		const { key, server } = untrack(() => ({ key: storageKey, server: data }));
		flushPending = () => {
			const frontmatter = applyForm(snapshot.fields, server.frontmatter).frontmatter;
			if (sameAsServer({ body: snapshot.body, frontmatter }, server)) writeDraft(null, key);
			else
				writeDraft(
					{
						path: server.path,
						body: snapshot.body,
						frontmatter,
						at: Date.now(),
						sha: baseSha,
						images
					},
					key
				);
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

	let eigenschappenTerug: HTMLElement | null = null;
	function openEigenschappen() {
		eigenschappenTerug = focusTarget();
		eigenschappenOpen = true;
	}

	function sluitEigenschappen(event: Event) {
		eigenschappenOpen = false;
		restoreFocus(
			event.currentTarget as Element,
			eigenschappenTerug,
			() => void schrijfvlak?.focus(false)
		);
		eigenschappenTerug = null;
	}

	/* The sheet holds a title bar with a collapse anchor. */
	const sheetPagina = pageReady();

	/* A new page whose properties would fail the first save shows them once, on arrival. */
	$effect(() => {
		if (!sheetPagina.ready) return;
		untrack(() => {
			if (data.nieuw && !validateForm(fields).ok) void tick().then(openEigenschappen);
		});
	});

	/** A sheet belongs in the document root, outside the panes of the application shell. */
	function naarDocument(node: HTMLElement) {
		document.body.append(node);
		return () => node.remove();
	}
</script>

<svelte:head><title>{titel} bewerken · {data.site.naam} · Schrijver</title></svelte:head>

{#snippet bewaarKnop()}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-button
		appearance="primary"
		text={knoptekst}
		loading={bezig || undefined}
		onclick={() => void opslaan?.opslaan()}
	></nldd-button>
{/snippet}

<Pagina
	{titel}
	ondertitel={openbaarConcept ? `${data.repoPath} · Openbaar concept` : data.repoPath}
	terug={{ href: `/sites/${data.site.id}`, tekst: data.site.naam }}
	balk={readOnly || conflictOpen ? undefined : bewaarKnop}
	bind:kop
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
					void schrijfvlak?.focus();
				}}
				onweggooien={() => {
					discard();
					void schrijfvlak?.focus();
				}}
			/>
		{/if}

		{#if !readOnly}
			<div class="meldingen">
				<Opslaan
					bind:this={opslaan}
					bind:busy={bezig}
					bind:knoptekst
					bind:conflictOpen
					oneigenschappen={fields.length > 0 ? openEigenschappen : null}
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
					focusEditor={(wissel) => void schrijfvlak?.focus(wissel)}
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

			<Schrijfvlak
				bind:this={schrijfvlak}
				bind:body
				bind:images
				siteId={data.site.id}
				pagina={data.repoPath}
				branch={activeBranch}
				afbeeldingen={data.site.afbeeldingen}
				onsamenvatting={samenvattingVeld
					? (text) => (fields = withValue(fields, samenvattingVeld, text))
					: null}
				oneigenschappen={fields.length > 0 ? openEigenschappen : null}
				{kop}
			/>
		{/if}
	</nldd-container>
</Pagina>

{#if sheetPagina.ready && !readOnly && fields.length > 0}
	<nldd-sheet
		placement="right"
		width="480px"
		open={eigenschappenOpen || undefined}
		onclose={sluitEigenschappen}
		{@attach naarDocument}
	>
		<nldd-page>
			<nldd-top-title-bar
				slot="header"
				text="Eigenschappen"
				dismiss-text="Sluit"
				collapse-anchor="eigenschappen-titel"
			></nldd-top-title-bar>
			<nldd-simple-section>
				<nldd-title
					id="eigenschappen-titel"
					slot="header"
					size="2"
					heading-level="1"
					text="Eigenschappen"
					supporting-text="Deze waarden worden met de pagina bewaard."
				></nldd-title>
				<FrontmatterFormulier {fields} onchange={(next) => (fields = next)} />
			</nldd-simple-section>
		</nldd-page>
	</nldd-sheet>
{/if}

<style>
	.meldingen {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}
</style>
