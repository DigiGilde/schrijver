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
		{#if data.beheer.sites.length > 0}
			<nldd-container gap="8">
				<nldd-title size="3" heading-level="2" text="Beheer"></nldd-title>
				<nldd-text>
					{data.beheer.platform
						? 'Je bent beheerder van Schrijver. Je beheert het team en de instellingen van elke site.'
						: 'Je beheert het team en de instellingen van deze sites.'}
				</nldd-text>
				<nldd-list accessible-label="Sites die je beheert">
					{#each data.beheer.sites as site (site.id)}
						<nldd-list-item href="/instellingen/sites/{encodeURIComponent(site.id)}">
							<nldd-text-cell text={site.naam}></nldd-text-cell>
							<nldd-spacer-cell size="8"></nldd-spacer-cell>
							<nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
						</nldd-list-item>
					{/each}
				</nldd-list>
			</nldd-container>
		{/if}
		<nldd-container id="uitloggen" gap="8">
			<nldd-title size="3" heading-level="2" text="Uitloggen"></nldd-title>
			<nldd-text color="secondary" size="sm"
				>Uitloggen wist ook de niet-bewaarde concepten in deze browser.</nldd-text
			>
			<form method="post" action="/uitloggen" data-sveltekit-reload onsubmit={clearAllDrafts}>
				<nldd-button appearance="secondary" type="submit" text="Log uit"></nldd-button>
			</form>
		</nldd-container>
		<nldd-text color="secondary" size="sm" class="kenmerk"
			>Je kenmerk bij SSO Rijk: {data.kenmerk}</nldd-text
		>
	</nldd-container>
</Pagina>

<style>
	/* A sub can be one long token; it wraps instead of widening the page at 400% zoom. */
	.kenmerk {
		overflow-wrap: anywhere;
	}
</style>
