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
		<nldd-list accessible-label="Sites">
			<nldd-inline-dialog
				slot="empty"
				text="Nog geen sites"
				supporting-text="Vraag de beheerders om je site aan te sluiten."
			></nldd-inline-dialog>
			{#each data.sites as site (site.id)}
				<nldd-list-item href="/sites/{site.id}">
					<nldd-text-cell text={site.naam} supporting-text="{site.repo} · {site.model}"
					></nldd-text-cell>
					<nldd-spacer-cell size="8"></nldd-spacer-cell>
					<nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
				</nldd-list-item>
			{/each}
		</nldd-list>
	</nldd-container>
</Pagina>
