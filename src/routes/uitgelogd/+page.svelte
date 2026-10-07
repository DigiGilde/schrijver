<script lang="ts">
	import { onMount } from 'svelte';

	let { data } = $props();

	onMount(() => {
		if (data.endSession) window.location.assign(data.endSession);
	});
</script>

<svelte:head><title>Uitgelogd - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<nldd-title size="1" heading-level="1" text="Je bent uitgelogd bij Schrijver"></nldd-title>
	{#if data.endSession}
		<nldd-text>Je wordt nu ook afgemeld bij SSO Rijk.</nldd-text>
		<!-- A plain anchor: it must work before (or without) the design system scripts. -->
		<nldd-rich-text><p><a href={data.endSession}>Meld je af bij SSO Rijk</a></p></nldd-rich-text>
	{:else}
		<nldd-link href="/" text="Naar de startpagina"></nldd-link>
	{/if}
</nldd-container>
