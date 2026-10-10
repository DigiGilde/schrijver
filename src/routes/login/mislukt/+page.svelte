<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
</script>

<svelte:head><title>Inloggen is niet gelukt · Schrijver</title></svelte:head>

<Pagina titel="Inloggen is niet gelukt">
	<nldd-container gap="16">
		<nldd-text
			>Probeer het opnieuw. Lukt het dan nog niet, vraag het de redactie van je site.</nldd-text
		>
		<nldd-link href="/login" text="Opnieuw inloggen" data-sveltekit-reload></nldd-link>
	</nldd-container>
</Pagina>
