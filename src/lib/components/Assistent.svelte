<script lang="ts">
	import { diffWords } from 'diff';
	import type { Action, Suggestion } from '$lib/assistant/vlam';

	type Props = {
		siteId: string;
		getSelection: () => { text: string; from: number; to: number } | null;
		getAll: () => string;
		/** Returns an error message when the text could not be replaced. */
		onApply: (from: number, to: number, replacement: string, original: string) => string | null;
		onMark: (from: number, to: number) => void;
		onUnmark: () => void;
		/** Called once a suggestion is taken or dropped: its buttons are gone, so focus has to go somewhere. */
		onDone: () => void;
		/** Writes a summary into the page's description field; null when the page has none. */
		onSummary?: ((text: string) => void) | null;
	};
	let {
		siteId,
		getSelection,
		getAll,
		onApply,
		onMark,
		onUnmark,
		onDone,
		onSummary = null
	}: Props = $props();

	const actions: { action: Exclude<Action, 'vrij'>; label: string }[] = [
		{ action: 'korter', label: 'Korter' },
		{ action: 'b1', label: 'Naar B1' },
		{ action: 'actiever', label: 'Actiever' },
		{ action: 'kopjes', label: 'Kopjes voorstellen' },
		{ action: 'samenvatting', label: 'Samenvatting' }
	];

	type Pending = {
		action: Action;
		from: number;
		to: number;
		original: string;
		suggestion: Suggestion;
	};

	let instruction = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let pending = $state<Pending | null>(null);
	let scope = $state<'selectie' | 'tekst'>('tekst');
	let outcome = $state<'voorstel' | 'overgenomen' | 'verworpen' | null>(null);
	let status = $derived(
		busy
			? 'Bezig...'
			: outcome === 'voorstel'
				? 'Voorstel beschikbaar'
				: outcome === 'overgenomen'
					? 'Overgenomen'
					: outcome === 'verworpen'
						? 'Verworpen'
						: scope === 'selectie'
							? 'Op de selectie'
							: 'Op de hele tekst'
	);

	let parts = $derived(
		pending && pending.action !== 'samenvatting'
			? diffWords(pending.original, pending.suggestion.replacement)
			: []
	);

	function refreshScope() {
		scope = getSelection() ? 'selectie' : 'tekst';
	}

	async function run(action: Action) {
		if (busy) return;
		if (action === 'vrij' && !instruction.trim()) return;
		const selection = getSelection();
		const all = selection ? null : getAll();
		const target = selection
			? { text: selection.text, from: selection.from, to: selection.to }
			: { text: all ?? '', from: 0, to: (all ?? '').length };
		if (!target.text.trim()) return;

		clearPending();
		outcome = null;
		busy = true;
		error = null;
		// A summary never replaces the text, so nothing in the editor is marked for it.
		if (action !== 'samenvatting') onMark(target.from, target.to);
		try {
			const res = await fetch('/api/assistent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Schrijver' },
				body: JSON.stringify({
					siteId,
					action,
					text: target.text,
					...(action === 'vrij' ? { instruction: instruction.trim() } : {})
				})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.message ?? 'De schrijfhulp is niet beschikbaar');
			pending = {
				action,
				from: target.from,
				to: target.to,
				original: target.text,
				suggestion: data
			};
			outcome = 'voorstel';
		} catch (e) {
			onUnmark();
			error = e instanceof Error ? e.message : 'De schrijfhulp is niet beschikbaar';
		} finally {
			busy = false;
		}
	}

	function clearPending() {
		if (pending && pending.action !== 'samenvatting') onUnmark();
		pending = null;
	}

	function dismiss() {
		clearPending();
		outcome = 'verworpen';
		onDone();
	}

	function useSummary() {
		if (!pending || !onSummary) return;
		onSummary(pending.suggestion.replacement.trim());
		pending = null;
		outcome = 'overgenomen';
		onDone();
	}

	function accept() {
		if (!pending || pending.action === 'samenvatting') return;
		const { from, to, suggestion, original } = pending;
		pending = null;
		onUnmark();
		const refused = onApply(from, to, suggestion.replacement, original);
		if (refused) {
			error = refused;
			outcome = null;
		} else {
			outcome = 'overgenomen';
		}
		onDone();
	}
</script>

<section
	aria-labelledby="schrijfhulp-kop"
	aria-busy={busy}
	onpointerenter={refreshScope}
	onfocusin={refreshScope}
>
	<h2 id="schrijfhulp-kop">Schrijfhulp</h2>
	<p class="uitleg">
		<small
			>Voorstellen komen van een AI-taalmodel (VLAM). Je tekst gaat daarvoor naar VLAM: zet er geen
			persoonsgegevens of vertrouwelijke informatie in. Controleer elk voorstel zelf.</small
		>
	</p>
	<p class="status" role="status" aria-live="polite"><small>{status}</small></p>

	<div class="acties">
		{#each actions as { action, label } (action)}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<nldd-button
				appearance="secondary"
				size="sm"
				text={label}
				loading={busy}
				onclick={() => run(action)}
			></nldd-button>
		{/each}
	</div>

	<nldd-form-field label="Eigen opdracht">
		<nldd-text-field
			value={instruction}
			maxlength={1000}
			oninput={(e: Event) => (instruction = (e.target as HTMLInputElement).value)}
		></nldd-text-field>
	</nldd-form-field>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-button
		appearance="secondary"
		size="sm"
		text="Vraag"
		loading={busy}
		disabled={!instruction.trim()}
		onclick={() => run('vrij')}
	></nldd-button>

	{#if error}
		<nldd-notification variant="warning" text={error} ondismiss={() => (error = null)}
		></nldd-notification>
	{/if}

	{#if pending && pending.action === 'samenvatting'}
		<div class="voorstel">
			<p id="voorstel-kop">Voorgestelde samenvatting</p>
			<blockquote aria-labelledby="voorstel-kop">{pending.suggestion.replacement}</blockquote>
			{#if !onSummary}
				<p>
					<small
						>Deze pagina heeft geen samenvattingsveld; kopieer de tekst als je hem wilt gebruiken.</small
					>
				</p>
			{/if}
			<div class="acties">
				{#if onSummary}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<nldd-button
						appearance="primary"
						size="sm"
						text="Gebruik als samenvatting"
						onclick={useSummary}
					></nldd-button>
				{/if}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button appearance="secondary" size="sm" text="Verwerpen" onclick={dismiss}
				></nldd-button>
			</div>
		</div>
	{:else if pending}
		<div class="voorstel">
			<p>{pending.suggestion.explanation}</p>
			<p id="voorstel-kop">Voorgestelde wijziging</p>
			<div role="group" aria-labelledby="voorstel-kop" class="diff">
				{#each parts as part, i (i)}
					{#if part.added}<ins><span class="sr-only">toegevoegd: </span>{part.value}</ins
						>{:else if part.removed}<del><span class="sr-only">verwijderd: </span>{part.value}</del
						>{:else}{part.value}{/if}
				{/each}
			</div>
			<div class="acties">
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button appearance="primary" size="sm" text="Overnemen" onclick={accept}></nldd-button>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button appearance="secondary" size="sm" text="Verwerpen" onclick={dismiss}
				></nldd-button>
			</div>
		</div>
	{/if}
</section>

<style>
	.acties {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-block: 0.75rem;
	}
	.diff {
		white-space: pre-wrap;
	}
	ins {
		text-decoration: underline;
	}
	del {
		text-decoration: line-through;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
