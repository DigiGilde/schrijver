<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { onMount } from 'svelte';

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
		onbewaard,
		onovernemen
	}: {
		siteId: string;
		repoPath: string;
		sha: string | null;
		branch: string | null;
		prNumber: number | null;
		nieuw: Nieuw | null;
		snapshot: () => Snapshot;
		onbewaard: () => void;
		onovernemen: (text: string) => void;
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
	let busy = $state(false);
	let bewaard = $state<{ nummer: number; url: string } | null>(null);
	let fout = $state<Fout | null>(null);
	let conflict = $state<Conflict | null>(null);

	async function opslaan(overrideSha?: string) {
		if (busy) return;
		busy = true;
		fout = null;
		conflict = null;
		const { body, frontmatter, changedKeys } = snapshot();
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
					images: [],
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
				onbewaard();
			} else if (result?.conflict) {
				conflict = result.conflict;
			} else {
				fout = result?.error ?? { message: 'Opslaan is mislukt' };
			}
		} catch (e) {
			fout = { message: 'Opslaan is mislukt: geen verbinding', detail: String(e) };
		} finally {
			busy = false;
		}
	}

	function behoudMijn() {
		if (conflict) void opslaan(conflict.sha);
	}

	function neemOver() {
		if (!conflict) return;
		baseSha = conflict.sha;
		onovernemen(conflict.theirs);
		conflict = null;
	}

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

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<nldd-button
	appearance="primary"
	text={huidigPr ? 'Opslaan' : 'Concept bewaren'}
	loading={busy || undefined}
	onclick={() => opslaan()}
></nldd-button>

{#if bewaard}
	<nldd-notification
		variant="success"
		text={`Concept bewaard als voorstel #${bewaard.nummer}`}
		ondismiss={() => (bewaard = null)}
	>
		<nldd-button slot="actions" appearance="secondary" text="Open op GitHub" href={bewaard.url} target="_blank"
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
	<div role="alert" class="fout">
		<p>{fout.message}</p>
		{#if fout.fields}
			<ul>
				{#each Object.entries(fout.fields) as [veld, melding] (veld)}
					<li>{veld}: {melding}</li>
				{/each}
			</ul>
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
	<div role="alert" class="conflict">
		<p>Deze pagina is intussen door iemand anders gewijzigd. Kies welke versie je wilt houden.</p>
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
		<nldd-button appearance="primary" text="Mijn versie behouden" onclick={behoudMijn}></nldd-button>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button appearance="secondary" text="Hun versie overnemen" onclick={neemOver}></nldd-button>
	</div>
{/if}

<style>
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
