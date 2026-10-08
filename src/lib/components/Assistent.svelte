<script lang="ts">
	import { diffWords } from 'diff';
	import { AI_NOTICE } from '$lib/assistant/shared';
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
	let instructionMissing = $state(false);
	let instructionField: HTMLElement | undefined = $state();
	let busy = $state(false);
	let error = $state<string | null>(null);
	let pending = $state<Pending | null>(null);
	let scope = $state<'selectie' | 'tekst'>('tekst');
	let outcome = $state<'voorstel' | 'overgenomen' | 'samenvatting' | 'verworpen' | null>(null);
	let status = $derived(
		busy
			? 'Bezig...'
			: outcome === 'voorstel'
				? 'Voorstel beschikbaar'
				: outcome === 'overgenomen'
					? 'Overgenomen'
					: outcome === 'samenvatting'
						? 'Samenvatting ingevuld bij Eigenschappen'
						: outcome === 'verworpen'
							? 'Verworpen'
							: ''
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

	function ask(event: SubmitEvent) {
		event.preventDefault();
		if (!instruction.trim()) {
			instructionMissing = true;
			instructionField?.focus();
			return;
		}
		void run('vrij');
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
		outcome = 'samenvatting';
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
	<nldd-title size="5"><h2 id="schrijfhulp-kop">Schrijfhulp</h2></nldd-title>
	<nldd-spacer size="8"></nldd-spacer>
	<nldd-text size="sm" color="secondary">{AI_NOTICE}</nldd-text>
	<nldd-spacer size="24"></nldd-spacer>

	<div role="group" aria-labelledby="schrijfhulp-bereik">
		<nldd-text id="schrijfhulp-bereik" line-height="flat">
			{scope === 'selectie' ? 'Op de selectie' : 'Op de hele tekst'}
		</nldd-text>
		<nldd-spacer size="8"></nldd-spacer>
		<nldd-container layout="wrap" gap="8">
			{#each actions as { action, label } (action)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button
					appearance="secondary"
					size="sm"
					text={label}
					loading={busy || undefined}
					onclick={() => run(action)}
				></nldd-button>
			{/each}
		</nldd-container>
	</div>
	<nldd-spacer size="24"></nldd-spacer>

	<nldd-form>
		<form onsubmit={ask}>
			<nldd-form-field label="Eigen opdracht">
				<nldd-text-field
					bind:this={instructionField}
					value={instruction}
					maxlength={1000}
					invalid={instructionMissing || undefined}
					oninput={(e: Event) => {
						instruction = (e.target as HTMLInputElement).value;
						instructionMissing = false;
					}}
				></nldd-text-field>
				{#if instructionMissing}
					<nldd-form-field-help-text
						>Een opdracht is nodig om iets te vragen</nldd-form-field-help-text
					>
				{/if}
			</nldd-form-field>
			<nldd-form-actions>
				<nldd-button-group size="sm">
					<nldd-button
						appearance="secondary"
						size="sm"
						type="submit"
						text="Vraag"
						loading={busy || undefined}
					></nldd-button>
				</nldd-button-group>
			</nldd-form-actions>
		</form>
	</nldd-form>

	{#if error}
		<nldd-notification variant="warning" text={error} ondismiss={() => (error = null)}
		></nldd-notification>
	{/if}

	{#if pending}
		<nldd-spacer size="24"></nldd-spacer>
		<nldd-box>
			<nldd-container padding="16">
				<nldd-title size="6">
					<h3 id="voorstel-kop">
						{pending.action === 'samenvatting'
							? 'Voorgestelde samenvatting'
							: 'Voorgestelde wijziging'}
					</h3>
				</nldd-title>
				<nldd-spacer size="4"></nldd-spacer>
				<nldd-text size="sm" color="secondary">{pending.suggestion.explanation}</nldd-text>
				<nldd-spacer size="12"></nldd-spacer>
				<nldd-text size="sm">
					<div role="group" aria-labelledby="voorstel-kop" class="voorstel">
						{#if pending.action === 'samenvatting'}
							{pending.suggestion.replacement}
						{:else}
							{#each parts as part, i (i)}
								{#if part.added}<ins><span class="sr-only">toegevoegd: </span>{part.value}</ins
									>{:else if part.removed}<del
										><span class="sr-only">verwijderd: </span>{part.value}</del
									>{:else}{part.value}{/if}
							{/each}
						{/if}
					</div>
				</nldd-text>
				{#if pending.action === 'samenvatting' && !onSummary}
					<nldd-spacer size="12"></nldd-spacer>
					<nldd-text size="sm" color="secondary">
						Deze pagina heeft geen samenvattingsveld; kopieer de tekst als je hem wilt gebruiken.
					</nldd-text>
				{/if}
				<nldd-spacer size="16"></nldd-spacer>
				<nldd-button-group size="sm">
					{#if pending.action !== 'samenvatting'}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<nldd-button appearance="primary" size="sm" text="Overnemen" onclick={accept}
						></nldd-button>
					{:else if onSummary}
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
				</nldd-button-group>
			</nldd-container>
		</nldd-box>
	{/if}

	{#if status}
		<nldd-spacer size="16"></nldd-spacer>
	{/if}
	<nldd-text size="sm" color="secondary" role="status">{status}</nldd-text>
</section>

<style>
	.voorstel {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	ins {
		text-decoration: underline;
		background-color: var(--semantics-categories-success-tinted-background-color);
		color: var(--semantics-categories-success-tinted-content-color);
	}
	del {
		text-decoration: line-through;
		background-color: var(--semantics-categories-critical-tinted-background-color);
		color: var(--semantics-categories-critical-tinted-content-color);
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
