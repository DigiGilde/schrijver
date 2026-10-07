<script lang="ts">
	import PrefsForm from '$lib/components/PrefsForm.svelte';
	import { clearAllDrafts } from '$lib/client/draft';

	let { data, form } = $props();
</script>

<svelte:head><title>Instellingen - Schrijver</title></svelte:head>

<nldd-container padding="16" gap="16">
	<nldd-title size="1" heading-level="1" text="Instellingen"></nldd-title>
	<PrefsForm
		identity={form?.identity ?? data.identity}
		githubLogin={data.githubLogin}
		emailVerified={data.emailVerified}
		sites={data.sites}
		error={form?.error}
		saved={form?.saved || form?.unlinked}
		justLinked={data.justLinked}
	/>
	<form method="post" action="/uitloggen" data-sveltekit-reload onsubmit={clearAllDrafts}>
		<nldd-button appearance="secondary" type="submit" text="Uitloggen"></nldd-button>
		<nldd-text color="secondary" size="sm">Uitloggen wist ook de niet-bewaarde concepten in deze browser.</nldd-text>
	</form>
</nldd-container>
