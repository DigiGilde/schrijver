<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
	import PrefsForm from '$lib/components/PrefsForm.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Hoe wil je je wijzigingen ondertekenen? · Schrijver</title></svelte:head>

<Pagina titel="Hoe wil je je wijzigingen ondertekenen?">
	<nldd-container gap="16">
		<PrefsForm
			identity={form?.identity ?? data.identity}
			githubLogin={data.githubLogin}
			emailVerified={data.emailVerified}
			sites={data.sites}
			error={form?.error}
		/>
	</nldd-container>
</Pagina>
