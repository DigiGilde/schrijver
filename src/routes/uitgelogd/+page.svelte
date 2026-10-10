<script lang="ts">
	import { onMount } from 'svelte';
	import Pagina from '$lib/components/Pagina.svelte';

	let { data } = $props();

	onMount(() => {
		if (data.endSession) window.location.assign(data.endSession);
	});
</script>

<svelte:head><title>Uitgelogd · Schrijver</title></svelte:head>

<Pagina titel="Je bent uitgelogd bij Schrijver">
	<nldd-container gap="16">
		{#if data.endSession}
			<nldd-text>Je wordt nu ook uitgelogd bij SSO Rijk.</nldd-text>
			<!-- A plain anchor: it must work before (or without) the design system scripts. -->
			<nldd-rich-text><p><a href={data.endSession}>Uitloggen bij SSO Rijk</a></p></nldd-rich-text>
		{:else}
			<nldd-link href="/" text="Naar de startpagina"></nldd-link>
		{/if}
	</nldd-container>
</Pagina>
