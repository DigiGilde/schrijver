<script lang="ts">
	import PrefsForm from '$lib/components/PrefsForm.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Instellingen - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<nldd-title size="1" heading-level="1" text="Instellingen"></nldd-title>
	<PrefsForm
		identity={form?.identity ?? data.identity}
		githubLogin={form?.githubLogin ?? data.githubLogin}
		emailVerified={data.emailVerified}
		error={form?.error}
		saved={form?.saved}
	/>
	<nldd-link href="/uitloggen" text="Uitloggen" data-sveltekit-reload></nldd-link>
</nldd-container>
