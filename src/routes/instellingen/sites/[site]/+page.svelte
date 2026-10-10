<script lang="ts">
	import { onMount } from 'svelte';
	import Pagina from '$lib/components/Pagina.svelte';
	import type { Resultaat } from './forms';
	import SiteInstellingen from './SiteInstellingen.svelte';
	import SiteVerwijderen from './SiteVerwijderen.svelte';
	import Structuur from './Structuur.svelte';
	import Team from './Team.svelte';

	let { data, form } = $props();
	const resultaat = $derived((form ?? null) as Resultaat | null);

	const toegevoegd = $derived(`${data.beheer.naam} staat nu in Schrijver.`);
	/* Filled after the page is there: a live region that arrives with its text is not announced. */
	let gemeld = $state('');
	onMount(() => {
		if (data.toegevoegd) gemeld = toegevoegd;
	});
</script>

<svelte:head><title>Beheer van {data.beheer.naam} · Schrijver</title></svelte:head>

<Pagina
	titel="Beheer van {data.beheer.naam}"
	terug={{ href: '/instellingen', tekst: 'Instellingen' }}
>
	<nldd-container gap="48">
		{#if data.toegevoegd || data.structuur.fouten.length > 0}
			<nldd-container gap="16">
				<p class="sr-only" role="status">{gemeld}</p>
				{#if data.toegevoegd}
					<nldd-banner
						variant="success"
						text={toegevoegd}
						supporting-text="Hieronder regel je het team en de instellingen van de site."
					></nldd-banner>
				{/if}
				{#if data.structuur.fouten.length > 0}
					<nldd-banner
						variant="critical"
						text="De structuur in .schrijver klopt niet"
						supporting-text={data.structuur.bruikbaar
							? 'Schrijver werkt met de laatste structuur die wel klopte. Wat er niet klopt, staat bij Structuur.'
							: 'Zolang dat zo is, kan niemand de site bewerken. Wat er niet klopt, staat bij Structuur.'}
					></nldd-banner>
				{/if}
			</nldd-container>
		{/if}
		<Team site={data.beheer} leden={data.leden} uitnodigingen={data.uitnodigingen} {resultaat} />
		<SiteInstellingen
			instellingen={data.instellingen}
			resultaat={resultaat?.actie === 'instellingen' ? resultaat : null}
		/>
		<Structuur structuur={data.structuur} />
		{#if data.magVerwijderen}
			<SiteVerwijderen
				naam={data.beheer.naam}
				resultaat={resultaat?.actie === 'verwijderSite' ? resultaat : null}
			/>
		{/if}
	</nldd-container>
</Pagina>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
