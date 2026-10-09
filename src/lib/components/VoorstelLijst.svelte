<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import type { Proposal } from '$lib/forge/proposals';
	import { STATUS, updatedText, waitsForReview } from '$lib/forge/status';

	type Filter = 'mijn' | 'alle' | 'beoordelen';

	let {
		siteId,
		proposals,
		filter,
		editorial = false
	}: {
		siteId: string;
		proposals: Proposal[];
		/** The filter from the address; choosing another one shows it at once, before the address has followed. */
		filter: Filter;
		editorial?: boolean;
	} = $props();

	let gekozen = $state<Filter | null>(null);
	const huidig = $derived(gekozen ?? filter);
	afterNavigate(() => (gekozen = null));

	const LABEL: Record<Filter, string> = {
		mijn: 'Mijn voorstellen',
		alle: 'Alle voorstellen',
		beoordelen: 'Te beoordelen'
	};
	const EMPTY: Record<Filter, string> = {
		mijn: 'Je hebt geen open voorstellen.',
		alle: 'Er zijn geen open voorstellen.',
		beoordelen: 'Er wachten geen voorstellen op de redactie.'
	};

	const teBeoordelen = $derived(
		proposals
			.filter((p) => waitsForReview(p.status))
			.sort((a, b) => Number(a.status !== 'ingestuurd') - Number(b.status !== 'ingestuurd'))
	);
	const shown = $derived(
		huidig === 'mijn'
			? proposals.filter((p) => p.mine)
			: huidig === 'beoordelen'
				? teBeoordelen
				: proposals
	);
	const resultaat = $derived(
		shown.length === 0
			? EMPTY[huidig]
			: `${LABEL[huidig]}: ${shown.length} ${shown.length === 1 ? 'voorstel' : 'voorstellen'}`
	);
	const adres = (p: Proposal) => `/sites/${siteId}/voorstellen/${p.number}?filter=${huidig}`;
	const regel = (p: Proposal) =>
		[
			STATUS[p.status].line,
			updatedText(p.updatedAt),
			...(p.viaSchrijver ? [] : ['Via GitHub'])
		].join(' · ');

	function kies(e: Event) {
		const { selected, value } =
			(e as CustomEvent<{ selected?: boolean; value?: string }>).detail ?? {};
		if (!selected || !value || !Object.hasOwn(LABEL, value)) return;
		gekozen = value as Filter;
		const url = new URL(location.href);
		url.searchParams.set('filter', value);
		// Not a shallow replaceState: SvelteKit would then still open the old address on Back.
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

{#snippet cellen(p: Proposal)}
	{@const status = STATUS[p.status]}
	<nldd-text-cell hide-below="md" text={p.title} supporting-text={regel(p)}></nldd-text-cell>
	<nldd-text-cell hide-above="sm" supporting-text={regel(p)}>
		{p.title}
		<nldd-badge size="sm" color={status.color} text={status.label}></nldd-badge>
	</nldd-text-cell>
	<nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
	<nldd-cell hide-below="md">
		<nldd-badge color={status.color} decorative></nldd-badge>
	</nldd-cell>
	<nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
	<nldd-text-cell hide-below="md" width="fit-content" text={status.label}></nldd-text-cell>
{/snippet}

<nldd-container gap="16">
	<nldd-toggle-button-group
		type="radio"
		appearance="neutral-transparent"
		size="sm"
		accessible-label="Welke voorstellen"
		onchange={kies}
	>
		<nldd-toggle-button value="mijn" text={LABEL.mijn} selected={huidig === 'mijn' || undefined}
		></nldd-toggle-button>
		<nldd-toggle-button value="alle" text={LABEL.alle} selected={huidig === 'alle' || undefined}
		></nldd-toggle-button>
		{#if editorial}
			<nldd-toggle-button
				value="beoordelen"
				text={teBeoordelen.length > 0
					? `${LABEL.beoordelen} (${teBeoordelen.length})`
					: LABEL.beoordelen}
				selected={huidig === 'beoordelen' || undefined}
			></nldd-toggle-button>
		{/if}
	</nldd-toggle-button-group>

	<p class="sr-only" role="status">{resultaat}</p>

	<nldd-list accessible-label={LABEL[huidig]}>
		<nldd-inline-dialog slot="empty" text={EMPTY[huidig]}></nldd-inline-dialog>
		{#each shown as p (p.number)}
			{@const verder =
				(p.mine || editorial) && p.verderBewerken.length === 1 ? p.verderBewerken[0] : null}
			{#if verder}
				<nldd-list-item>
					<nldd-list-item-segment href={adres(p)} width="full">
						{@render cellen(p)}
					</nldd-list-item-segment>
					<nldd-list-item-segment href={verder.href} accessible-label="Verder bewerken: {p.title}">
						<nldd-icon-cell size="20" color="accent" icon="pencil"></nldd-icon-cell>
						<nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
						<nldd-text-cell
							text="Verder bewerken"
							color="accent"
							width="fit-content"
							hide-below="md"
						></nldd-text-cell>
					</nldd-list-item-segment>
				</nldd-list-item>
			{:else}
				<nldd-list-item href={adres(p)}>
					{@render cellen(p)}
					<nldd-spacer-cell size="8"></nldd-spacer-cell>
					<nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
				</nldd-list-item>
			{/if}
		{/each}
	</nldd-list>
</nldd-container>

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
