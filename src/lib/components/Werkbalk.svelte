<script module lang="ts">
	export type Actie = 'bold' | 'italic' | 'bullet' | 'quote' | 'link' | 'code';
	export type Weergave = 'schrijven' | 'voorbeeld';
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
		weergave: Weergave;
		onweergave: (weergave: Weergave) => void;
		/** Opens the page properties; null when the page has none. */
		oneigenschappen?: (() => void) | null;
		/** How many required properties are still empty. */
		eigenschappenLeeg?: number;
		schrijfhulpOpen?: boolean;
		onschrijfhulp?: () => void;
	};
	let {
		state,
		disabled = false,
		onactie,
		onkop,
		onafbeelding,
		onmermaid,
		afbeeldingen = true,
		weergave,
		onweergave,
		oneigenschappen = null,
		eigenschappenLeeg = 0,
		schrijfhulpOpen = false,
		onschrijfhulp
	}: Props = $props();

	const active = $derived(state?.active);

	/*
	 * `expanded` goes in as a property, never as an attribute: server-rendered expanded="false" is a
	 * present boolean attribute (Lit reads it as true), and `undefined` renders as aria-expanded="undefined".
	 * Lit keeps a property set before the element upgrades.
	 */
	function uitgeklapt(node: HTMLElement, open: boolean) {
		const element = node as HTMLElement & { expanded: boolean };
		element.expanded = open;
		return { update: (next: boolean) => (element.expanded = next) };
	}

	type Opmaak = { icon: string; label: string; aan: () => boolean | undefined; doe: () => void };
	const koppen = [2, 3, 4] as const;
	const opmaak: Opmaak[] = [
		{ icon: 'bold', label: 'Vet', aan: () => active?.bold, doe: () => onactie('bold') },
		{ icon: 'italic', label: 'Cursief', aan: () => active?.italic, doe: () => onactie('italic') },
		...koppen.map((niveau) => ({
			icon: `heading-${niveau}`,
			label: `Kop ${niveau}`,
			aan: () => active?.heading === niveau,
			doe: () => onkop(niveau)
		})),
		{
			icon: 'bullet-list',
			label: 'Lijst met opsommingstekens',
			aan: () => active?.bulletList,
			doe: () => onactie('bullet')
		},
		{ icon: 'text-quote', label: 'Citaat', aan: () => active?.quote, doe: () => onactie('quote') },
		{ icon: 'link', label: 'Link', aan: () => active?.link, doe: () => onactie('link') },
		{
			icon: 'chevron-left-forward-slash-chevron-right',
			label: 'Code in de regel',
			aan: () => active?.inlineCode,
			doe: () => onactie('code')
		}
	];

	/*
	 * Lower priorities move into the overflow menu first: the insert buttons, then the formatting from
	 * right to left. The end of the bar goes last, the view switch at the very last.
	 */
	const PRIORITEIT = {
		mermaid: 1,
		afbeelding: 2,
		schrijfhulp: 12,
		eigenschappen: 13,
		weergave: 14
	};
	const prioriteit = (index: number) => opmaak.length + 2 - index;

	const afbeeldingLabel = $derived(
		afbeeldingen
			? 'Afbeelding invoegen'
			: 'Afbeelding invoegen (deze site accepteert geen afbeeldingen)'
	);

	/** The toggle flips itself on click; put it back in line with the editor once the state event has landed. */
	function resync(event: Event, aan: () => boolean | undefined) {
		const element = event.currentTarget as HTMLElement & { selected: boolean };
		setTimeout(() => (element.selected = !!aan()), 0);
	}

	function kies(event: Event) {
		onweergave(
			(event as CustomEvent<{ value?: string }>).detail?.value === 'voorbeeld'
				? 'voorbeeld'
				: 'schrijven'
		);
	}
</script>

<!-- Every item carries its own twin in slot="overflow": the toolbar shows those in its menu once the item no longer fits. -->
<nldd-toolbar label="Opmaak" size="sm">
	{#if weergave === 'schrijven'}
		{#each opmaak as knop, index (knop.label)}
			<nldd-toolbar-item slot="start" priority={prioriteit(index)}>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-toggle-button
					type="button"
					icon={knop.icon}
					accessible-label={knop.label}
					appearance="neutral-transparent"
					selected={knop.aan() || undefined}
					disabled={disabled || undefined}
					onclick={(event: Event) => {
						knop.doe();
						resync(event, knop.aan);
					}}
				></nldd-toggle-button>
				<nldd-menu-item
					slot="overflow"
					type="checkbox"
					icon={knop.icon}
					text={knop.label}
					selected={knop.aan() || undefined}
					disabled={disabled || undefined}
					onselect={knop.doe}
				></nldd-menu-item>
			</nldd-toolbar-item>
		{/each}
		<nldd-toolbar-item slot="start" priority={PRIORITEIT.afbeelding}>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<nldd-icon-button
				icon="photo"
				accessible-label={afbeeldingLabel}
				appearance="neutral-transparent"
				disabled={disabled || !afbeeldingen || undefined}
				onclick={onafbeelding}
			></nldd-icon-button>
			<nldd-menu-item
				slot="overflow"
				icon="photo"
				text={afbeeldingLabel}
				disabled={disabled || !afbeeldingen || undefined}
				onselect={onafbeelding}
			></nldd-menu-item>
		</nldd-toolbar-item>
		<nldd-toolbar-item slot="start" priority={PRIORITEIT.mermaid}>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<nldd-icon-button
				icon="network-structure"
				accessible-label="Mermaid-diagram invoegen"
				appearance="neutral-transparent"
				disabled={disabled || undefined}
				onclick={onmermaid}
			></nldd-icon-button>
			<nldd-menu-item
				slot="overflow"
				icon="network-structure"
				text="Mermaid-diagram invoegen"
				disabled={disabled || undefined}
				onselect={onmermaid}
			></nldd-menu-item>
		</nldd-toolbar-item>
	{/if}
	<nldd-toolbar-item slot="end" priority={PRIORITEIT.weergave}>
		<!-- A radio group that shows the editor or the preview, rather than tabs: tab roles cannot reach a panel across the shadow root. -->
		<nldd-segmented-control accessible-label="Weergave" value={weergave} onchange={kies}>
			<nldd-segmented-control-item value="schrijven" text="Schrijven"></nldd-segmented-control-item>
			<nldd-segmented-control-item value="voorbeeld" text="Voorbeeld"></nldd-segmented-control-item>
		</nldd-segmented-control>
		<nldd-menu-group slot="overflow" text="Weergave">
			<nldd-menu-item
				type="radio"
				text="Schrijven"
				selected={weergave === 'schrijven' || undefined}
				onselect={() => onweergave('schrijven')}
			></nldd-menu-item>
			<nldd-menu-item
				type="radio"
				text="Voorbeeld"
				selected={weergave === 'voorbeeld' || undefined}
				onselect={() => onweergave('voorbeeld')}
			></nldd-menu-item>
		</nldd-menu-group>
	</nldd-toolbar-item>
	{#if oneigenschappen}
		{@const leeg = eigenschappenLeeg
			? `${eigenschappenLeeg} ${eigenschappenLeeg === 1 ? 'verplicht veld' : 'verplichte velden'} leeg`
			: ''}
		<nldd-toolbar-item slot="end" priority={PRIORITEIT.eigenschappen}>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<nldd-button
				appearance="secondary"
				text={eigenschappenLeeg ? `Eigenschappen (${eigenschappenLeeg})` : 'Eigenschappen'}
				accessible-label={leeg ? `Eigenschappen, ${leeg}` : undefined}
				onclick={oneigenschappen}
			></nldd-button>
			<nldd-menu-item
				slot="overflow"
				text={leeg ? `Eigenschappen (${leeg})` : 'Eigenschappen'}
				onselect={oneigenschappen}
			></nldd-menu-item>
		</nldd-toolbar-item>
	{/if}
	{#if onschrijfhulp}
		<nldd-toolbar-item slot="end" priority={PRIORITEIT.schrijfhulp}>
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<!-- `expandable` keeps aria-expanded present while closed; aria-controls cannot cross the shadow root. -->
			<nldd-button
				appearance="secondary"
				text="Schrijfhulp"
				expandable
				use:uitgeklapt={schrijfhulpOpen}
				onclick={onschrijfhulp}
			></nldd-button>
			<nldd-menu-item
				slot="overflow"
				type="checkbox"
				text="Schrijfhulp"
				selected={schrijfhulpOpen || undefined}
				onselect={onschrijfhulp}
			></nldd-menu-item>
		</nldd-toolbar-item>
	{/if}
</nldd-toolbar>
{#if !afbeeldingen && weergave === 'schrijven'}
	<nldd-text color="secondary" size="sm">Deze site accepteert geen afbeeldingen.</nldd-text>
{/if}
