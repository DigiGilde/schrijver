<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import {
		IMAGES_TOO_LARGE,
		MAX_PENDING_IMAGE_BYTES,
		pendingBytes,
		referenced,
		type PendingImage
	} from '$lib/client/pending-images';
	import { MERMAID_DESCR_MESSAGE, missingDescriptions } from '$lib/content/mermaid';

	type Nieuw = { soort: string | null; folder: string; title: string };
	type Snapshot = { body: string; frontmatter: Record<string, unknown>; changedKeys: string[] };
	type Fout = { message: string; detail?: string; fields?: Record<string, string> };
	type Conflict = { mine: string; theirs: string; sha: string };

	let {
		siteId,
		repoPath,
		sha,
		branch,
		prNumber,
		nieuw,
		snapshot,
		tekst,
		labels,
		images,
		onverstuurd,
		onbewaard,
		onovernemen,
		onbasis,
		onveldfouten,
		oneigenschappen = null,
		focusEditor,
		knop = true,
		busy = $bindable(false),
		knoptekst = $bindable()
	}: {
		siteId: string;
		repoPath: string;
		sha: string | null;
		branch: string | null;
		prNumber: number | null;
		nieuw: Nieuw | null;
		snapshot: () => Snapshot;
		tekst: string;
		labels: Record<string, string>;
		images: () => PendingImage[];
		onverstuurd: (sent: PendingImage[]) => void;
		onbewaard: (saved: { sha: string; branch: string }) => void;
		onovernemen: (text: string) => void;
		onbasis: (sha: string) => void;
		/** Field errors from the server, so the form can mark the fields. */
		onveldfouten: (fields: Record<string, string>) => void;
		/** Opens the page properties; offered with field errors. */
		oneigenschappen?: (() => void) | null;
		focusEditor: () => void;
		/** Without its own button, a parent shows one and calls opslaan(). */
		knop?: boolean;
		busy?: boolean;
		knoptekst?: string;
	} = $props();

	/* The props are the initial values of the editing session; later saves update them locally. */
	// svelte-ignore state_referenced_locally
	let baseSha = $state(sha);
	// svelte-ignore state_referenced_locally
	let huidigeBranch = $state(branch);
	// svelte-ignore state_referenced_locally
	let huidigPr = $state(prNumber);
	// svelte-ignore state_referenced_locally
	let nieuwePagina = $state(nieuw);
	let bewaard = $state<{ nummer: number; url: string } | null>(null);
	let fout = $state<Fout | null>(null);
	let conflict = $state<Conflict | null>(null);
	let mermaidFout = $state<string | null>(null);
	/* One persistent live region: a region inserted together with its text is not reliably announced. */
	let status = $state('');
	let foutBlok: HTMLElement | undefined = $state();
	let conflictKop: HTMLElement | undefined = $state();

	const knopTekst = $derived(huidigPr ? 'Opslaan' : 'Concept bewaren');
	$effect.pre(() => {
		knoptekst = knopTekst;
	});

	async function toon(element: () => HTMLElement | undefined) {
		await tick();
		element()?.focus();
	}

	export async function opslaan(overrideSha?: string) {
		if (busy) return;
		const { body, frontmatter, changedKeys } = snapshot();
		const zonder = missingDescriptions(body);
		if (zonder.length) {
			mermaidFout = `${MERMAID_DESCR_MESSAGE} (regel ${zonder.join(', ')})`;
			void toon(() => foutBlok);
			return;
		}
		mermaidFout = null;
		const sent = referenced(images(), body);
		if (pendingBytes(sent) > MAX_PENDING_IMAGE_BYTES) {
			fout = { message: IMAGES_TOO_LARGE };
			status = '';
			void toon(() => foutBlok);
			return;
		}
		busy = true;
		fout = null;
		conflict = null;
		status = 'Bezig met bewaren';
		try {
			const res = await fetch(`/api/sites/${siteId}/opslaan`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'X-Requested-With': 'Schrijver' },
				body: JSON.stringify({
					path: repoPath,
					body,
					frontmatter,
					changedKeys,
					baseSha: overrideSha ?? baseSha,
					branch: huidigeBranch,
					prNumber: huidigPr,
					images: sent,
					...(nieuwePagina ? { newPage: nieuwePagina } : {})
				})
			});
			const result = await res.json().catch(() => null);
			if (result?.ok) {
				baseSha = result.sha;
				huidigeBranch = result.branch;
				huidigPr = result.prNumber;
				nieuwePagina = null;
				repoPath = result.path;
				bewaard = { nummer: result.prNumber, url: result.url };
				const params = new URLSearchParams({ branch: result.branch, pr: String(result.prNumber) });
				replaceState(`?${params}`, {});
				onverstuurd(sent);
				onbewaard({ sha: result.sha, branch: result.branch });
				status = `Concept bewaard als voorstel #${result.prNumber}`;
			} else if (result?.conflict) {
				conflict = result.conflict;
				status = '';
				void toon(() => conflictKop);
			} else {
				fout = result?.error ??
					// The server's body limit answers 413 without JSON.
					{ message: res.status === 413 ? IMAGES_TOO_LARGE : 'Opslaan is mislukt' };
			}
		} catch (e) {
			fout = { message: 'Opslaan is mislukt: geen verbinding', detail: String(e) };
		} finally {
			busy = false;
		}
		if (fout) {
			status = '';
			if (fout.fields) onveldfouten(fout.fields);
			void toon(() => foutBlok);
		}
	}

	function behoudMijn() {
		if (!conflict) return;
		const sha = conflict.sha;
		focusEditor();
		void opslaan(sha);
	}

	function neemOver() {
		if (!conflict) return;
		baseSha = conflict.sha;
		onbasis(conflict.sha);
		onovernemen(conflict.theirs);
		conflict = null;
		status = 'Hun versie overgenomen';
		focusEditor();
	}

	$effect(() => {
		void tekst;
		mermaidFout = null;
	});

	onMount(() => {
		const onkey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				void opslaan();
			}
		};
		window.addEventListener('keydown', onkey);
		return () => window.removeEventListener('keydown', onkey);
	});
</script>

{#if knop}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-button
		appearance="primary"
		text={knopTekst}
		loading={busy || undefined}
		onclick={() => opslaan()}
	></nldd-button>
{/if}

<p class="sr-only" role="status">{status}</p>

{#if mermaidFout}
	<p role="alert" class="fout" tabindex="-1" bind:this={foutBlok}>{mermaidFout}</p>
{/if}

{#if bewaard}
	<nldd-notification
		variant="success"
		text={`Concept bewaard als voorstel #${bewaard.nummer}`}
		ondismiss={() => {
			bewaard = null;
			focusEditor();
		}}
	>
		<nldd-button
			slot="actions"
			appearance="secondary"
			text="Open op GitHub"
			href={bewaard.url}
			target="_blank"
		></nldd-button>
		<nldd-button
			slot="actions"
			appearance="secondary"
			text="Bekijk voorstel"
			href={`/sites/${siteId}/voorstellen/${bewaard.nummer}`}
		></nldd-button>
	</nldd-notification>
{/if}

{#if fout}
	<div role="alert" class="fout" tabindex="-1" bind:this={foutBlok}>
		<p>{fout.message}</p>
		{#if fout.fields}
			<ul>
				{#each Object.entries(fout.fields) as [veld, melding] (veld)}
					<li>{labels[veld] ?? veld}: {melding}</li>
				{/each}
			</ul>
			{#if oneigenschappen}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button appearance="secondary" text="Eigenschappen aanpassen" onclick={oneigenschappen}
				></nldd-button>
			{/if}
		{/if}
		{#if fout.detail}
			<details>
				<summary>Technische details</summary>
				<pre>{fout.detail}</pre>
			</details>
		{/if}
	</div>
{/if}

{#if conflict}
	<div class="conflict">
		<p role="alert" tabindex="-1" bind:this={conflictKop}>
			Deze pagina is intussen door iemand anders gewijzigd. Kies welke versie je wilt houden.
		</p>
		<div class="versies">
			<section aria-label="Mijn versie">
				<h3>Mijn versie</h3>
				<pre>{conflict.mine}</pre>
			</section>
			<section aria-label="Hun versie">
				<h3>Hun versie</h3>
				<pre>{conflict.theirs}</pre>
			</section>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button appearance="primary" text="Mijn versie behouden" onclick={behoudMijn}
		></nldd-button>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button appearance="secondary" text="Hun versie overnemen" onclick={neemOver}
		></nldd-button>
	</div>
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 0;
	}
	.versies {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 16px;
	}
</style>
