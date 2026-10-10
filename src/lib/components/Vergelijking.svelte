<script lang="ts">
	import { onMount } from 'svelte';
	import Diff from './Diff.svelte';
	import type { Comparison } from '$lib/client/suggestion';

	type Props = {
		/** The page the text belongs to, as Diff names it. */
		pagina: string;
		vergelijking: Comparison;
		/** The heading, which takes the focus once the comparison is there. */
		kop?: HTMLElement;
		onovernemen: () => void;
		onverwerpen: () => void;
	};
	let { pagina, vergelijking, kop = $bindable(), onovernemen, onverwerpen }: Props = $props();
	let titel: (HTMLElement & { updateComplete?: Promise<unknown> }) | undefined = $state();

	// A heading in the slot of a title that has not rendered yet is not rendered either, and cannot take focus.
	onMount(async () => {
		await titel?.updateComplete;
		kop?.focus();
	});
</script>

<section id="schrijfhulp-vergelijking" aria-labelledby="schrijfhulp-vergelijking-kop">
	<nldd-card>
		<nldd-container padding="24" sm-padding="16">
			<nldd-title size="3" bind:this={titel}>
				<h2 id="schrijfhulp-vergelijking-kop" tabindex="-1" bind:this={kop}>
					{vergelijking.title}
				</h2>
			</nldd-title>
			<nldd-spacer size="16"></nldd-spacer>
			<Diff
				path={pagina}
				before={vergelijking.before}
				after={vergelijking.after}
				source={vergelijking.source}
				status="modified"
			/>
			<nldd-spacer size="24"></nldd-spacer>
			<nldd-button-group>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button appearance="primary" text="Overnemen" onclick={onovernemen}></nldd-button>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button appearance="secondary" text="Verwerpen" onclick={onverwerpen}></nldd-button>
			</nldd-button-group>
		</nldd-container>
	</nldd-card>
</section>
