<script lang="ts">
	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let soort = $state(data.options[0].naam ?? '');
	// svelte-ignore state_referenced_locally
	let map = $state('');
	const option = $derived(data.options.find((o) => (o.naam ?? '') === soort) ?? data.options[0]);
	const gekozenMap = $derived(option.fixed ?? (option.folders.includes(map) ? map : option.folders[0] ?? ''));
</script>

<svelte:head><title>Nieuwe pagina - {data.site.naam} - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<nldd-title size="1" heading-level="1" text="Nieuwe pagina"></nldd-title>

	{#if form?.error}
		<nldd-banner variant="critical" text={form.error}></nldd-banner>
	{/if}

	<form method="POST" class="formulier">
		{#if data.options[0].naam !== null}
			<label>
				Soort
				<select name="soort" bind:value={soort}>
					{#each data.options as o (o.naam)}
						<option value={o.naam}>{o.naam}</option>
					{/each}
				</select>
			</label>
		{/if}
		{#if option.fixed === null && option.folders.length > 0}
			<label>
				Map
				<select name="map" value={gekozenMap} onchange={(e) => (map = e.currentTarget.value)}>
					{#each option.folders as f (f)}
						<option value={f}>{f}</option>
					{/each}
				</select>
			</label>
		{:else if option.fixed !== null}
			<input type="hidden" name="map" value={option.fixed} />
		{/if}
		<label>
			Titel
			<input name="titel" required />
		</label>
		<div><button type="submit">Pagina maken</button></div>
	</form>
</nldd-container>

<style>
	.formulier {
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: flex-start;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
</style>
