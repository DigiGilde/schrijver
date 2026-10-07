<script lang="ts">
	import { tick } from 'svelte';

	type Result = { repoPath: string; markdownRef: string; base64: string; mime: string };
	type Props = {
		open: boolean;
		siteId: string;
		pagina: string;
		file: File | null;
		oninvoegen: (alt: string, result: Result) => void;
		onclose: () => void;
	};
	let { open = $bindable(), siteId, pagina, file = $bindable(), oninvoegen, onclose }: Props = $props();

	let alt = $state('');
	let fout = $state<string | null>(null);
	let busy = $state(false);
	let altField: HTMLElement | undefined = $state();

	const size = $derived(
		file ? (file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} kB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`) : ''
	);
	const klaar = $derived(!!file && alt.trim().length > 0 && !busy);

	$effect(() => {
		if (!open) return;
		fout = null;
		void tick().then(() => setTimeout(() => altField?.focus(), 50));
	});

	function reset() {
		alt = '';
		fout = null;
		file = null;
	}

	function sluit() {
		open = false;
		reset();
		onclose();
	}

	function meldingVoor(status: number, message?: string) {
		if (status === 413) return 'De afbeelding is groter dan 5 MB';
		if (status === 415) return 'Dit bestandstype wordt niet ondersteund (png, jpg, webp, svg)';
		return message ?? 'De afbeelding kon niet worden verwerkt';
	}

	async function invoegen() {
		if (!klaar || !file) return;
		busy = true;
		fout = null;
		try {
			const form = new FormData();
			form.set('bestand', file);
			form.set('pagina', pagina);
			form.set('alt', alt.trim());
			const res = await fetch(`/api/sites/${siteId}/afbeelding`, {
				method: 'POST',
				headers: { 'X-Requested-With': 'Schrijver' },
				body: form
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				fout = meldingVoor(res.status, data.message);
				return;
			}
			oninvoegen(alt.trim(), data as Result);
			sluit();
		} catch {
			fout = 'De afbeelding kon niet worden verstuurd: geen verbinding';
		} finally {
			busy = false;
		}
	}
</script>

<nldd-modal-dialog
	text="Afbeelding invoegen"
	open={open || undefined}
	onclose={() => {
		if (open) sluit();
	}}
>
	<div class="velden">
		<nldd-form-field label="Bestand">
			<nldd-file-field
				accept="image/png,image/jpeg,image/webp,image/svg+xml"
				onchange={(e: Event) => {
					file = (e as CustomEvent<{ files: File[] }>).detail.files[0] ?? null;
					fout = null;
				}}
			></nldd-file-field>
		</nldd-form-field>
		{#if file}
			<p class="bestand">{file.name} ({size})</p>
		{/if}

		<nldd-form-field label="Alt-tekst">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<nldd-text-field
				bind:this={altField}
				value={alt}
				maxlength={500}
				required
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						void invoegen();
					}
				}}
				oninput={(e: Event) => (alt = (e.target as HTMLInputElement).value)}
			></nldd-text-field>
			<nldd-form-field-help-text
				>Beschrijf wat er op de afbeelding staat voor wie die niet kan zien</nldd-form-field-help-text
			>
		</nldd-form-field>

		{#if fout}
			<p role="alert" class="fout">{fout}</p>
		{/if}
	</div>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-button slot="actions" appearance="secondary" text="Annuleren" onclick={sluit}></nldd-button>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-button
		slot="actions"
		appearance="primary"
		text="Invoegen"
		disabled={!klaar || undefined}
		loading={busy || undefined}
		onclick={invoegen}
	></nldd-button>
</nldd-modal-dialog>

<style>
	.velden {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: min(28rem, 80vw);
	}
	.bestand,
	.fout {
		margin: 0;
	}
</style>
