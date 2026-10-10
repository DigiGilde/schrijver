<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
	import type { Resultaat } from './forms';
	import SiteInstellingen from './SiteInstellingen.svelte';
	import Team from './Team.svelte';

	let { data, form } = $props();
	const resultaat = $derived((form ?? null) as Resultaat | null);
</script>

<svelte:head><title>Beheer van {data.beheer.naam} · Schrijver</title></svelte:head>

<Pagina
	titel="Beheer van {data.beheer.naam}"
	terug={{ href: '/instellingen', tekst: 'Instellingen' }}
>
	<nldd-container gap="48">
		<Team site={data.beheer} leden={data.leden} uitnodigingen={data.uitnodigingen} {resultaat} />
		<SiteInstellingen
			instellingen={data.instellingen}
			resultaat={resultaat?.actie === 'instellingen' ? resultaat : null}
		/>
	</nldd-container>
</Pagina>
