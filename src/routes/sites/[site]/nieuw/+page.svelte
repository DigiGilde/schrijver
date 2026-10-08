<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
	import { filePreview } from './new-page';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let soort = $state(data.options[0].naam ?? '');
	// svelte-ignore state_referenced_locally
	let map = $state('');
	// svelte-ignore state_referenced_locally
	let titel = $state(form?.titel ?? '');

	const option = $derived(data.options.find((o) => (o.naam ?? '') === soort) ?? data.options[0]);
	const gekozenMap = $derived(
		option.fixed ?? (option.folders.includes(map) ? map : (option.folders[0] ?? ''))
	);
	const bestand = $derived.by(() => {
		try {
			return (
				filePreview(data.schema, option.naam, gekozenMap, titel, data.today) ??
				'de naam komt uit de titel'
			);
		} catch {
			return null;
		}
	});
</script>

<svelte:head><title>Nieuwe pagina · {data.site.naam} · Schrijver</title></svelte:head>

<Pagina titel="Nieuwe pagina" terug={{ href: `/sites/${data.site.id}`, tekst: data.site.naam }}>
	<nldd-container max-width="720px" gap="16">
		{#if form?.error}
			<nldd-banner variant="critical" text={form.error}></nldd-banner>
		{/if}

		<nldd-form>
			<form method="POST">
				{#if data.options[0].naam !== null}
					<nldd-form-field label="Soort">
						<nldd-dropdown>
							<select name="soort" bind:value={soort}>
								{#each data.options as o (o.naam)}
									<option value={o.naam}>{o.naam}</option>
								{/each}
							</select>
						</nldd-dropdown>
					</nldd-form-field>
				{/if}
				{#if option.fixed === null && option.folders.length > 0}
					<nldd-form-field label="Map">
						<nldd-dropdown>
							<!-- nldd-dropdown stops the select's change event and sends its own; input still bubbles. -->
							<select name="map" value={gekozenMap} oninput={(e) => (map = e.currentTarget.value)}>
								{#each option.folders as f (f)}
									<option value={f}>{f}</option>
								{/each}
							</select>
						</nldd-dropdown>
					</nldd-form-field>
				{:else if option.fixed !== null}
					<input type="hidden" name="map" value={option.fixed} />
				{/if}
				<nldd-form-field label="Titel">
					<nldd-text-field
						name="titel"
						required
						value={titel}
						invalid={form?.veld === 'titel' || undefined}
						oninput={(e: Event) => (titel = (e.target as HTMLInputElement).value)}
					></nldd-text-field>
					{#if form?.veld === 'titel'}
						<nldd-form-field-help-text>{form.error}</nldd-form-field-help-text>
					{/if}
					{#if bestand}
						<nldd-form-field-help-text>Bestand: {bestand}</nldd-form-field-help-text>
					{/if}
				</nldd-form-field>
				<nldd-form-actions>
					<nldd-button-group>
						<nldd-button appearance="primary" type="submit" text="Pagina maken"></nldd-button>
					</nldd-button-group>
				</nldd-form-actions>
			</form>
		</nldd-form>
	</nldd-container>
</Pagina>
