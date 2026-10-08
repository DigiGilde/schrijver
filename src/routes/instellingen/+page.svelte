<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
	import PrefsForm from '$lib/components/PrefsForm.svelte';
	import { clearAllDrafts } from '$lib/client/draft';

	let { data, form } = $props();
</script>

<svelte:head><title>Instellingen · Schrijver</title></svelte:head>

<Pagina titel="Instellingen">
	<nldd-container gap="32">
		<PrefsForm
			identity={form?.identity ?? data.identity}
			githubLogin={data.githubLogin}
			emailVerified={data.emailVerified}
			sites={data.sites}
			error={form?.error ??
				(data.linkFailed ? 'Koppelen met GitHub is niet gelukt. Probeer het opnieuw.' : undefined)}
			saved={form?.saved || form?.unlinked}
			justLinked={data.justLinked}
			headings
		/>
		<nldd-container id="uitloggen" gap="8">
			<nldd-title size="3" heading-level="2" text="Uitloggen"></nldd-title>
			<nldd-text color="secondary" size="sm"
				>Uitloggen wist ook de niet-bewaarde concepten in deze browser.</nldd-text
			>
			<form method="post" action="/uitloggen" data-sveltekit-reload onsubmit={clearAllDrafts}>
				<nldd-button appearance="secondary" type="submit" text="Log uit"></nldd-button>
			</form>
		</nldd-container>
	</nldd-container>
</Pagina>
