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
		afbeeldingen?: boolean;
		schrijfhulpOpen?: boolean;
		onschrijfhulp?: () => void;
	};
	let { state, disabled = false, onactie, onkop, onafbeelding, onmermaid, afbeeldingen = true, schrijfhulpOpen = false, onschrijfhulp }: Props = $props();

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
		{ actie: 'quote', icon: 'text-quote', label: 'Citaat', actief: () => active?.quote },
		{ actie: 'link', icon: 'link', label: 'Link', actief: () => active?.link },
		{
			actie: 'code',
			icon: 'chevron-left-forward-slash-chevron-right',
			label: 'Code in de regel',
			actief: () => active?.inlineCode
		}
	];
	const koppen = [2, 3, 4] as const;

	/** The toggle flips itself on click; put it back in line with the editor once the state event has landed. */
	function resync(event: Event, aan: () => boolean | undefined) {
		const element = event.currentTarget as HTMLElement & { selected: boolean };
		setTimeout(() => (element.selected = !!aan()), 0);
	}
</script>

<div class="werkbalk" role="toolbar" aria-label="Opmaak">
	{#each knoppen as knop (knop.actie)}
		{@render schakel(knop.icon, knop.label, knop.actief, () => onactie(knop.actie))}
	{/each}
	{#each koppen as niveau (niveau)}
		{@render schakel(
			`heading-${niveau}`,
			`Kop ${niveau}`,
			() => active?.heading === niveau,
			() => onkop(niveau)
		)}
	{/each}
	{#each lijst as knop (knop.actie)}
		{@render schakel(knop.icon, knop.label, knop.actief, () => onactie(knop.actie))}
	{/each}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-icon-button
		icon="photo"
		accessible-label={afbeeldingen
			? 'Afbeelding invoegen'
			: 'Afbeelding invoegen (deze site accepteert geen afbeeldingen)'}
		size="sm"
		appearance="neutral-transparent"
		disabled={disabled || !afbeeldingen || undefined}
		onclick={onafbeelding}
	></nldd-icon-button>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-icon-button
		icon="network-structure"
		accessible-label="Mermaid-diagram invoegen"
		size="sm"
		appearance="neutral-transparent"
		disabled={disabled || undefined}
		onclick={onmermaid}
	></nldd-icon-button>
	{#if onschrijfhulp}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<!-- `expandable` keeps aria-expanded present while closed; aria-controls cannot cross the shadow root. -->
		<nldd-button
			appearance="secondary"
			size="sm"
			text="Schrijfhulp"
			expandable
			expanded={schrijfhulpOpen || undefined}
			onclick={onschrijfhulp}
		></nldd-button>
	{/if}
</div>
{#if !afbeeldingen}
	<nldd-text color="secondary" size="sm">Deze site accepteert geen afbeeldingen.</nldd-text>
{/if}

{#snippet schakel(icon: string, label: string, aan: () => boolean | undefined, doe: () => void)}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-toggle-button
		type="button"
		{icon}
		accessible-label={label}
		size="sm"
		appearance="neutral-transparent"
		selected={aan() || undefined}
		disabled={disabled || undefined}
		onclick={(event: Event) => {
			doe();
			resync(event, aan);
		}}
	></nldd-toggle-button>
{/snippet}

<style>
	.werkbalk {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
</style>
