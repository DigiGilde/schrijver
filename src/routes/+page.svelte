<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Kies een site · Schrijver</title></svelte:head>

<Pagina titel="Kies een site">
	<nldd-container gap="16">
		{#if data.configNotLoaded}
			<nldd-banner
				variant="critical"
				text="Configuratie niet geladen"
				supporting-text="Schrijver probeert het elke minuut opnieuw. Blijft dit zo, meld het dan bij de beheerders."
			></nldd-banner>
		{/if}
		<nldd-container layout="grid" gap="16">
			{#each data.sites as site (site.id)}
				<nldd-card>
					<nldd-container gap="8" padding="16">
						<nldd-title size="4" heading-level="2" text={site.naam}></nldd-title>
						<nldd-text color="secondary">{site.repo}</nldd-text>
						<nldd-text>{site.model}</nldd-text>
						<nldd-link size="md" href="/sites/{site.id}" text="Open {site.naam}"></nldd-link>
					</nldd-container>
				</nldd-card>
			{/each}
		</nldd-container>
	</nldd-container>
</Pagina>
