<script lang="ts">
	import { page } from '$app/state';

	const titel = $derived(
		page.status === 404
			? 'Pagina niet gevonden'
			: page.status === 401 || page.status === 403
				? 'Geen toegang'
				: 'Er ging iets mis'
	);
</script>

<svelte:head><title>{titel} - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<nldd-title size="1" heading-level="1" text={titel}></nldd-title>
	<nldd-text>{page.error?.message ?? titel} (foutcode {page.status})</nldd-text>
	{#if page.error?.id}
		<nldd-text color="secondary" size="sm">Kenmerk voor de beheerders: {page.error.id}</nldd-text>
	{/if}
	<nldd-link href="/" text="Naar de startpagina"></nldd-link>
</nldd-container>
