<script lang="ts">
	import { onMount } from 'svelte';

	let { data } = $props();

	onMount(() => window.location.assign(data.url));
</script>

<svelte:head><title>Koppelen met GitHub - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<nldd-title size="1" heading-level="1" text="Koppelen met GitHub"></nldd-title>
	<nldd-text>Je gaat naar GitHub om je account te koppelen.</nldd-text>
	<!-- A plain anchor: it must work before (or without) the design system scripts. -->
	<nldd-rich-text><p><a href={data.url}>Ga verder naar GitHub</a></p></nldd-rich-text>
</nldd-container>
