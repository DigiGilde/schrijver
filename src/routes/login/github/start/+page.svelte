<script lang="ts">
	import { onMount } from 'svelte';
	import Pagina from '$lib/components/Pagina.svelte';

	let { data } = $props();

	onMount(() => window.location.assign(data.url));
</script>

<svelte:head><title>Koppelen met GitHub · Schrijver</title></svelte:head>

<Pagina titel="Koppelen met GitHub">
	<nldd-container gap="16">
		<nldd-text>Je gaat naar GitHub om je account te koppelen.</nldd-text>
		<!-- A plain anchor: it must work before (or without) the design system scripts. -->
		<nldd-rich-text><p><a href={data.url}>Verder naar GitHub</a></p></nldd-rich-text>
	</nldd-container>
</Pagina>
