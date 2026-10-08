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
	const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
</script>

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

	{#if shown.length === 0}
		<nldd-text>{EMPTY[tab]}</nldd-text>
	{:else}
		<ul class="voorstellen">
			{#each shown as p (p.number)}
				<li>
					<nldd-container layout="wrap" gap="12" vertical-alignment="center">
						<nldd-text weight="bold">{p.title}</nldd-text>
						<nldd-badge text={STATUS[p.status].text} color={STATUS[p.status].color}></nldd-badge>
						<nldd-text color="secondary" size="sm">{date(p.updatedAt)}</nldd-text>
						{#if !p.viaSchrijver}
							<nldd-tag text="Via GitHub"></nldd-tag>
						{/if}
						{#if p.previewUrl}
							<nldd-link
								size="sm"
								href={p.previewUrl}
								target="_blank"
								text="Voorbeeld"
								accessible-label="Voorbeeld van {p.title}"
							></nldd-link>
						{/if}
						<nldd-link
							size="sm"
							href="/sites/{siteId}/voorstellen/{p.number}"
							text="Bekijken"
							accessible-label="Bekijken {p.title}"
						></nldd-link>
						{#if p.mine || editorial}
							{#each p.verderBewerken as link (link.page)}
								<nldd-link
									size="sm"
									href={link.href}
									text={p.verderBewerken.length === 1
										? 'Verder bewerken'
										: `Verder bewerken: ${fileName(link.page)}`}
									accessible-label="Verder bewerken {p.title}, {fileName(link.page)}"
								></nldd-link>
							{/each}
						{/if}
					</nldd-container>
				</li>
			{/each}
		</ul>
	{/if}
</nldd-container>

<style>
	.voorstellen {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}
</style>
