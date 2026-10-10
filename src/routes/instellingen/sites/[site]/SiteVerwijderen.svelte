<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { pageReady } from '$lib/client/page-ready.svelte';
	import type { Resultaat } from './forms';

	type Props = { naam: string; resultaat: Resultaat | null };
	let { naam, resultaat }: Props = $props();

	const pagina = pageReady();
	let bevestigen = $state(false);
	let bezig = $state(false);
	let formulier: HTMLFormElement | undefined = $state();
	let knop: HTMLElement | undefined = $state();

	function verwijder() {
		bevestigen = false;
		formulier?.requestSubmit();
	}

	/** A dialog belongs in the document root, outside the panes of the application shell. */
	function naarDocument(node: HTMLElement) {
		document.body.append(node);
		return () => node.remove();
	}
</script>

<nldd-box background="critical">
	<nldd-container padding="16" gap="8">
		<nldd-title size="5" heading-level="2" text="Site verwijderen"></nldd-title>
		<nldd-rich-text>
			<p>
				{naam} verdwijnt uit Schrijver, met de instellingen, het team en de uitnodigingen. De repository,
				de pagina's en de voorstellen blijven op GitHub.
			</p>
		</nldd-rich-text>
		<p class="sr-only" role="status">{resultaat?.fout ?? ''}</p>
		{#if resultaat?.fout}
			<nldd-banner variant="critical" text={resultaat.fout}></nldd-banner>
		{/if}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button
			bind:this={knop}
			appearance="destructive"
			text="Verwijder site"
			loading={bezig || undefined}
			onclick={() => (bevestigen = true)}
		></nldd-button>
	</nldd-container>
</nldd-box>
<form
	method="post"
	action="?/verwijderSite"
	hidden
	bind:this={formulier}
	use:enhance={() => {
		bezig = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			bezig = false;
			if (result.type === 'failure') {
				await tick();
				knop?.focus();
			}
		};
	}}
></form>

{#if pagina.ready}
	<nldd-modal-dialog
		variant="alert"
		text="Verwijder {naam} uit Schrijver?"
		supporting-text="De instellingen, het team en de uitnodigingen gaan weg. Dat kun je niet terugdraaien. De repository en de voorstellen blijven op GitHub."
		open={bevestigen || undefined}
		onclose={() => (bevestigen = false)}
		{@attach naarDocument}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button
			slot="actions"
			appearance="primary"
			text="Houd de site"
			onclick={() => (bevestigen = false)}
		></nldd-button>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button slot="actions" appearance="destructive" text="Verwijder site" onclick={verwijder}
		></nldd-button>
	</nldd-modal-dialog>
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
