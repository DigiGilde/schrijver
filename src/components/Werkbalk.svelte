<script module lang="ts">
	export type Actie = 'bold' | 'italic' | 'bullet' | 'quote' | 'link' | 'code';
</script>

<script lang="ts">
	import type { TextEditorState } from '@nldd/design-system/text-editor';

	type Props = {
		state: TextEditorState | null;
		disabled?: boolean;
		onactie: (actie: Actie) => void;
		onkop: (niveau: 2 | 3 | 4) => void;
		onafbeelding: () => void;
		onmermaid: () => void;
	};
	let { state, disabled = false, onactie, onkop, onafbeelding, onmermaid }: Props = $props();

	const active = $derived(state?.active);

	const knoppen: {
		actie: Actie;
		icon: string;
		label: string;
		actief: () => boolean | undefined;
	}[] = [
		{ actie: 'bold', icon: 'bold', label: 'Vet', actief: () => active?.bold },
		{ actie: 'italic', icon: 'italic', label: 'Cursief', actief: () => active?.italic }
	];
	const lijst: typeof knoppen = [
		{
			actie: 'bullet',
			icon: 'bullet-list',
			label: 'Lijst met opsommingstekens',
			actief: () => active?.bulletList
		},
		{ actie: 'quote', icon: 'blockquote', label: 'Citaat', actief: () => active?.quote },
		{ actie: 'link', icon: 'link', label: 'Link', actief: () => active?.link },
		{ actie: 'code', icon: 'code', label: 'Code in de regel', actief: () => active?.inlineCode }
	];
	const koppen = [2, 3, 4] as const;

	const appearance = (aan: boolean | undefined) => (aan ? 'neutral-tinted' : 'neutral-transparent');
</script>

<div class="werkbalk" role="toolbar" aria-label="Opmaak">
	{#each knoppen as knop (knop.actie)}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-icon-button
			icon={knop.icon}
			accessible-label={knop.label}
			size="sm"
			appearance={appearance(knop.actief())}
			disabled={disabled || undefined}
			onclick={() => onactie(knop.actie)}
		></nldd-icon-button>
	{/each}
	{#each koppen as niveau (niveau)}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-icon-button
			icon={`heading-${niveau}`}
			accessible-label={`Kop ${niveau}`}
			size="sm"
			appearance={appearance(active?.heading === niveau)}
			disabled={disabled || undefined}
			onclick={() => onkop(niveau)}
		></nldd-icon-button>
	{/each}
	{#each lijst as knop (knop.actie)}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-icon-button
			icon={knop.icon}
			accessible-label={knop.label}
			size="sm"
			appearance={appearance(knop.actief())}
			disabled={disabled || undefined}
			onclick={() => onactie(knop.actie)}
		></nldd-icon-button>
	{/each}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-icon-button
		icon="image"
		accessible-label="Afbeelding invoegen"
		size="sm"
		appearance="neutral-transparent"
		disabled={disabled || undefined}
		onclick={onafbeelding}
	></nldd-icon-button>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-icon-button
		icon="chart-line"
		accessible-label="Mermaid-diagram invoegen"
		size="sm"
		appearance="neutral-transparent"
		disabled={disabled || undefined}
		onclick={onmermaid}
	></nldd-icon-button>
</div>

<style>
	.werkbalk {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
</style>
