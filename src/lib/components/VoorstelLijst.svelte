<script lang="ts">
	import type { Proposal } from '$lib/forge/proposals';

	type Tab = 'mijn' | 'alle' | 'beoordelen';

	let {
		siteId,
		proposals,
		tab,
		tabHref,
		editorial = false,
		tabs = true
	}: {
		siteId: string;
		proposals: Proposal[];
		tab: Tab;
		tabHref: (tab: Tab) => string;
		editorial?: boolean;
		tabs?: boolean;
	} = $props();

	const STATUS: Record<Proposal['status'], { text: string; color: string }> = {
		concept: { text: 'Concept', color: 'neutral' },
		ingestuurd: { text: 'Ingestuurd', color: 'accent' },
		goedgekeurd: { text: 'Goedgekeurd', color: 'success' },
		'wijzigingen-gevraagd': { text: 'Wijzigingen gevraagd', color: 'warning' },
		samengevoegd: { text: 'Samengevoegd', color: 'success' },
		gesloten: { text: 'Gesloten', color: 'neutral' }
	};
	const LABEL: Record<Tab, string> = {
		mijn: 'Mijn voorstellen',
		alle: 'Alle voorstellen',
		beoordelen: 'Te beoordelen'
	};
	const EMPTY: Record<Tab, string> = {
		mijn: 'Je hebt geen open voorstellen.',
		alle: 'Er zijn geen open voorstellen.',
		beoordelen: 'Er wachten geen voorstellen op de redactie.'
	};

	const shown = $derived(
		tab === 'mijn'
			? proposals.filter((p) => p.mine)
			: tab === 'beoordelen'
				? proposals.filter((p) => p.status === 'ingestuurd' || p.status === 'wijzigingen-gevraagd')
				: proposals
	);
	const date = (iso: string) => new Date(iso).toLocaleDateString('nl-NL');
</script>

{#snippet cellen(p: Proposal)}
	<nldd-text-cell
		text={p.title}
		supporting-text="{date(p.updatedAt)}{p.viaSchrijver ? '' : ' · Via GitHub'}"
	></nldd-text-cell>
	<nldd-spacer-cell size="8"></nldd-spacer-cell>
	<nldd-cell>
		<nldd-badge text={STATUS[p.status].text} color={STATUS[p.status].color}></nldd-badge>
	</nldd-cell>
	<nldd-spacer-cell size="8"></nldd-spacer-cell>
	<nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
{/snippet}

<nldd-container gap="16">
	{#if tabs}
		<nldd-tab-bar navigation accessible-label="Voorstellen">
			<nldd-tab-bar-item
				text="Mijn voorstellen"
				href={tabHref('mijn')}
				current={tab === 'mijn' || undefined}
			></nldd-tab-bar-item>
			<nldd-tab-bar-item
				text="Alle voorstellen"
				href={tabHref('alle')}
				current={tab === 'alle' || undefined}
			></nldd-tab-bar-item>
			{#if editorial}
				<nldd-tab-bar-item
					text="Te beoordelen"
					href={tabHref('beoordelen')}
					current={tab === 'beoordelen' || undefined}
				></nldd-tab-bar-item>
			{/if}
		</nldd-tab-bar>
	{/if}

	<nldd-list accessible-label={LABEL[tab]}>
		<nldd-inline-dialog slot="empty" text={EMPTY[tab]}></nldd-inline-dialog>
		{#each shown as p (p.number)}
			{@const verder =
				(p.mine || editorial) && p.verderBewerken.length === 1 ? p.verderBewerken[0] : null}
			{#if verder}
				<nldd-list-item>
					<nldd-list-item-segment href="/sites/{siteId}/voorstellen/{p.number}" width="full">
						{@render cellen(p)}
					</nldd-list-item-segment>
					<nldd-list-item-segment href={verder.href} accessible-label="Verder bewerken: {p.title}">
						<nldd-icon-cell size="20" color="accent" icon="pencil"></nldd-icon-cell>
						<nldd-spacer-cell size="8" hide-below="360px"></nldd-spacer-cell>
						<nldd-text-cell
							text="Verder bewerken"
							color="accent"
							width="fit-content"
							hide-below="360px"
						></nldd-text-cell>
					</nldd-list-item-segment>
				</nldd-list-item>
			{:else}
				<nldd-list-item href="/sites/{siteId}/voorstellen/{p.number}">
					{@render cellen(p)}
				</nldd-list-item>
			{/if}
		{/each}
	</nldd-list>
</nldd-container>
