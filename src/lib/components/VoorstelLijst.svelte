<script lang="ts">
	import type { Proposal } from '$lib/forge/proposals';

	let {
		siteId,
		proposals,
		tab,
		tabHref
	}: {
		siteId: string;
		proposals: Proposal[];
		tab: 'mijn' | 'alle';
		tabHref: (tab: 'mijn' | 'alle') => string;
	} = $props();

	const STATUS: Record<Proposal['status'], { text: string; color: string }> = {
		concept: { text: 'Concept', color: 'neutral' },
		ingestuurd: { text: 'Ingestuurd', color: 'accent' },
		goedgekeurd: { text: 'Goedgekeurd', color: 'success' },
		'wijzigingen-gevraagd': { text: 'Wijzigingen gevraagd', color: 'warning' },
		samengevoegd: { text: 'Samengevoegd', color: 'success' },
		gesloten: { text: 'Gesloten', color: 'neutral' }
	};

	const shown = $derived(tab === 'mijn' ? proposals.filter((p) => p.mine) : proposals);
	const date = (iso: string) => new Date(iso).toLocaleDateString('nl-NL');
</script>

<nldd-container gap="16">
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
	</nldd-tab-bar>

	{#if shown.length === 0}
		<nldd-text
			>{tab === 'mijn'
				? 'Je hebt geen open voorstellen.'
				: 'Er zijn geen open voorstellen.'}</nldd-text
		>
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
