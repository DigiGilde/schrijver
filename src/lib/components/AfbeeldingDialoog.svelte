<script lang="ts">
	import { tick } from 'svelte';
	import { formatBytes, isLarge, shrink, type Shrunk } from '$lib/client/verkleinen';

	type Result = { repoPath: string; markdownRef: string; base64: string; mime: string };
	type Props = {
		open: boolean;
		siteId: string;
		pagina: string;
		/** The proposal branch, so the server can avoid a name already used there. */
		branch: string | null;
		file: File | null;
		oninvoegen: (alt: string, result: Result) => void;
		/** Called with the dialog element once it has fully closed, however it was closed. */
		onclose: (dialoog: Element) => void;
	};
	let {
		open = $bindable(),
		siteId,
		pagina,
		branch,
		file = $bindable(),
		oninvoegen,
		onclose
	}: Props = $props();

	let alt = $state('');
	let fout = $state<string | null>(null);
	let bestandFout = $state<string | null>(null);
	let altFout = $state<string | null>(null);
	let busy = $state(false);
	let ronde = $state(0);
	let abort: AbortController | null = null;
	let altField: HTMLElement | undefined = $state();
	let berekent = $state(false);
	let aanbod = $state.raw<Shrunk | null>(null);
	let verklein = $state(false);

	const size = $derived(file ? formatBytes(file.size) : '');
	/* Only a large file gets the message; any other is judged on its dimensions, too quick to announce. */
	const toonBerekenen = $derived(berekent && file !== null && isLarge(file));
	const aanbodMelding = $derived(
		toonBerekenen
			? 'Bezig met berekenen of de afbeelding kleiner kan'
			: aanbod
				? 'Je kunt de afbeelding verkleinen: zie de optie Verklein voor het web'
				: ''
	);

	const beschrijf = (m: Shrunk['from']) =>
		`${formatBytes(m.bytes)}, ${m.width} × ${m.height} pixels`;

	$effect(() => {
		const gekozen = file;
		aanbod = null;
		verklein = false;
		berekent = gekozen !== null;
		if (!gekozen) return;
		let vervallen = false;
		void shrink(gekozen).then((uitkomst) => {
			if (vervallen) return;
			aanbod = uitkomst;
			berekent = false;
		});
		return () => (vervallen = true);
	});

	$effect(() => {
		if (!open) return;
		fout = null;
		bestandFout = null;
		altFout = null;
		void tick().then(() => setTimeout(() => altField?.focus(), 50));
	});

	function reset() {
		abort?.abort();
		abort = null;
		busy = false;
		ronde += 1;
		alt = '';
		fout = null;
		bestandFout = null;
		altFout = null;
		file = null;
	}

	function sluit() {
		open = false;
		reset();
	}

	function meldingVoor(status: number, message?: string) {
		if (status === 413)
			return aanbod && !verklein
				? 'De afbeelding is groter dan 5 MB. Kies "Verklein voor het web" en voeg haar opnieuw in.'
				: 'De afbeelding is groter dan 5 MB';
		if (status === 415) return 'Dit bestandstype wordt niet ondersteund (png, jpg, webp, svg)';
		return message ?? 'De afbeelding kon niet worden verwerkt';
	}

	/* The button stays enabled, so pressing it can say what is missing (a disabled button gives no reason). */
	async function invoegen() {
		if (busy) return;
		bestandFout = file ? null : 'Kies eerst een afbeelding';
		altFout = alt.trim() ? null : 'Vul een alt-tekst in';
		if (altFout) altField?.focus();
		if (bestandFout || altFout || !file) return;
		busy = true;
		fout = null;
		const controller = new AbortController();
		abort = controller;
		try {
			const form = new FormData();
			form.set('bestand', verklein && aanbod ? aanbod.file : file);
			form.set('pagina', pagina);
			if (branch) form.set('branch', branch);
			form.set('alt', alt.trim());
			const res = await fetch(`/api/sites/${siteId}/afbeelding`, {
				method: 'POST',
				headers: { 'X-Requested-With': 'Schrijver' },
				body: form,
				signal: controller.signal
			});
			const data = await res.json().catch(() => ({}));
			if (controller.signal.aborted) return;
			if (!res.ok) {
				fout = meldingVoor(res.status, data.message);
				return;
			}
			oninvoegen(alt.trim(), data as Result);
			sluit();
		} catch {
			if (controller.signal.aborted) return;
			fout = 'De afbeelding kon niet worden verstuurd: geen verbinding';
		} finally {
			if (abort === controller) {
				abort = null;
				busy = false;
			}
		}
	}
</script>

<nldd-modal-dialog
	text="Afbeelding invoegen"
	open={open || undefined}
	onclose={(event: Event) => {
		if (open) sluit();
		onclose(event.currentTarget as Element);
	}}
>
	<div class="velden">
		{#key ronde}
			<nldd-form-field label="Bestand">
				<nldd-file-field
					accept="image/png,image/jpeg,image/webp,image/svg+xml"
					onchange={(e: Event) => {
						file = (e as CustomEvent<{ files: File[] }>).detail.files[0] ?? null;
						fout = null;
						bestandFout = null;
					}}
					invalid={bestandFout !== null || undefined}
				></nldd-file-field>
				{#if bestandFout}
					<nldd-form-field-help-text>{bestandFout}</nldd-form-field-help-text>
				{/if}
			</nldd-form-field>
		{/key}
		{#if file}
			<p class="bestand">{file.name} ({size})</p>
		{/if}
		{#if toonBerekenen}
			<nldd-text size="sm" color="secondary" aria-hidden="true"
				>Bezig met berekenen of de afbeelding kleiner kan...</nldd-text
			>
		{:else if aanbod}
			<nldd-form-field>
				<nldd-checkbox-field
					label="Verklein voor het web"
					checked={verklein || undefined}
					onchange={(e: Event) =>
						(verklein = (e as CustomEvent<{ checked: boolean }>).detail.checked)}
				></nldd-checkbox-field>
				<nldd-form-field-help-text
					>Van {beschrijf(aanbod.from)}, naar {beschrijf(aanbod.to)}. De pagina laadt sneller.</nldd-form-field-help-text
				>
				<nldd-form-field-help-text
					>Ook de fotogegevens, zoals de locatie, gaan eruit.</nldd-form-field-help-text
				>
			</nldd-form-field>
		{/if}

		<nldd-form-field label="Alt-tekst">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<nldd-text-field
				bind:this={altField}
				value={alt}
				maxlength={500}
				required
				invalid={altFout !== null || undefined}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						void invoegen();
					}
				}}
				oninput={(e: Event) => {
					alt = (e.target as HTMLInputElement).value;
					altFout = null;
				}}
			></nldd-text-field>
			{#if altFout}
				<nldd-form-field-help-text>{altFout}</nldd-form-field-help-text>
			{/if}
			<nldd-form-field-help-text
				>Beschrijf wat er op de afbeelding staat voor wie die niet kan zien</nldd-form-field-help-text
			>
		</nldd-form-field>

		<p class="sr-only" role="status">{[bestandFout, altFout].filter(Boolean).join('. ')}</p>
		<p class="sr-only" role="status">{aanbodMelding}</p>
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
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
