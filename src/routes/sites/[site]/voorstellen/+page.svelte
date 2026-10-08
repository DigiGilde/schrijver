<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
	import SiteKop from '$lib/components/SiteKop.svelte';
	import VoorstelLijst from '$lib/components/VoorstelLijst.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Voorstellen · {data.site.naam} · Schrijver</title></svelte:head>

<Pagina
	titel={data.site.naam}
	ondertitel={data.site.omschrijving ?? undefined}
	terug={{ href: '/', tekst: 'Sites' }}
>
	<SiteKop site={data.site} huidig="voorstellen" wachtend={data.wachtend} />

	{#snippet vervolg()}
		<nldd-simple-section padding-top="0">
			{#if data.proposalsError}
				<nldd-text color="critical">De voorstellen konden niet worden opgehaald.</nldd-text>
			{:else}
				<VoorstelLijst
					siteId={data.site.id}
					proposals={data.proposals}
					filter={data.filter}
					editorial={data.editorial}
				/>
			{/if}
		</nldd-simple-section>
	{/snippet}
</Pagina>
