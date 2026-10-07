<script lang="ts">
	import { diffWords } from 'diff';
	import type { Action, Suggestion } from '$lib/assistant/vlam';

	type Props = {
		siteId: string;
		getSelection: () => { text: string; from: number; to: number } | null;
		getAll: () => string;
		onApply: (from: number, to: number, replacement: string) => void;
		onMark: (from: number, to: number) => void;
		onUnmark: () => void;
	};
	let { siteId, getSelection, getAll, onApply, onMark, onUnmark }: Props = $props();

	const actions: { action: Exclude<Action, 'vrij'>; label: string }[] = [
		{ action: 'korter', label: 'Korter' },
		{ action: 'b1', label: 'Naar B1' },
		{ action: 'actiever', label: 'Actiever' },
		{ action: 'kopjes', label: 'Kopjes voorstellen' },
		{ action: 'samenvatting', label: 'Samenvatting' }
	];

	type Pending = { from: number; to: number; original: string; suggestion: Suggestion };

	let instruction = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let pending = $state<Pending | null>(null);
	let scope = $state<'selectie' | 'tekst'>('tekst');

	let parts = $derived(pending ? diffWords(pending.original, pending.suggestion.replacement) : []);

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

		dismiss();
		busy = true;
		error = null;
		onMark(target.from, target.to);
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
			pending = { from: target.from, to: target.to, original: target.text, suggestion: data };
		} catch (e) {
			onUnmark();
			error = e instanceof Error ? e.message : 'De schrijfhulp is niet beschikbaar';
		} finally {
			busy = false;
		}
	}

	function dismiss() {
		if (pending) onUnmark();
		pending = null;
	}

	function accept() {
		if (!pending) return;
		const { from, to, suggestion } = pending;
		pending = null;
		onUnmark();
		onApply(from, to, suggestion.replacement);
	}
</script>

<section
	aria-labelledby="schrijfhulp-kop"
	aria-busy={busy}
	onpointerenter={refreshScope}
	onfocusin={refreshScope}
>
	<h2 id="schrijfhulp-kop">Schrijfhulp</h2>
	<p class="status">
		<small>{scope === 'selectie' ? 'Op de selectie' : 'Op de hele tekst'}</small>
	</p>

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

	{#if pending}
		<div class="voorstel">
			<p>{pending.suggestion.explanation}</p>
			<p class="diff" aria-label="Voorgestelde wijziging">
				{#each parts as part, i (i)}
					{#if part.added}<ins>{part.value}</ins>{:else if part.removed}<del>{part.value}</del
						>{:else}{part.value}{/if}
				{/each}
			</p>
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
</style>
