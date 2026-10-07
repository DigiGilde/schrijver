<script lang="ts">
	import PrefsForm from '$lib/components/PrefsForm.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Hoe wil je je wijzigingen ondertekenen? - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<nldd-title size="1" heading-level="1" text="Hoe wil je je wijzigingen ondertekenen?"></nldd-title>
	<PrefsForm
		identity={form?.identity ?? data.identity}
		githubLogin={form?.githubLogin ?? data.githubLogin}
		emailVerified={data.emailVerified}
		error={form?.error}
	/>
</nldd-container>
