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
		{#if data.sites.length === 0}
			<nldd-inline-dialog
				text="Nog geen sites"
				supporting-text="Vraag de beheerders om je site aan te sluiten."
			></nldd-inline-dialog>
		{:else}
			<nldd-collection item-width="320px">
				{#each data.sites as site (site.id)}
					<nldd-card href="/sites/{site.id}" accessible-label={site.naam}>
						<nldd-container padding="16" gap="8">
							<nldd-title size="4" heading-level="2" text={site.naam}></nldd-title>
							{#if site.omschrijving}
								<nldd-text>{site.omschrijving}</nldd-text>
							{/if}
							{#if site.adres}
								<nldd-text size="sm" color="secondary">{site.adres}</nldd-text>
							{/if}
						</nldd-container>
						{#if site.status.length > 0}
							<nldd-container slot="footer" padding="16" padding-top="0" gap="4">
								{#each site.status as regel (regel)}
									<nldd-text size="sm" weight="medium">{regel}</nldd-text>
								{/each}
							</nldd-container>
						{/if}
					</nldd-card>
				{/each}
			</nldd-collection>
		{/if}
	</nldd-container>
</Pagina>
