<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import Pagina from '$lib/components/Pagina.svelte';
	import VoorstelLijst from '$lib/components/VoorstelLijst.svelte';

	let { data } = $props();

	const mapHref = (map: string) =>
		`/sites/${data.site.id}${map ? `?map=${encodeURIComponent(map)}` : ''}`;
	const tabHref = (tab: 'mijn' | 'alle' | 'beoordelen') => {
		const params = new URLSearchParams();
		if (data.map) params.set('map', data.map);
		params.set('tab', tab);
		return `/sites/${data.site.id}?${params}`;
	};
	const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
	const depth = (folder: string) => folder.split('/').length - 1;
	const label = (folder: string) => folder.slice(folder.lastIndexOf('/') + 1);

	let mappen = $state<(HTMLElement & { show(): void; hide(): void }) | null>(null);
	let mappenKnop = $state<(HTMLElement & { expanded: boolean }) | null>(null);
	const mappenOpen = (open: boolean) => mappenKnop && (mappenKnop.expanded = open);

	// Choosing a folder navigates within this page, so the sheet it was chosen in has to close itself.
	// The first navigation is hydration, before the design system has upgraded the element: no hide() yet.
	afterNavigate(() => mappen?.hide?.());
</script>

<svelte:head><title>{data.site.naam} · Schrijver</title></svelte:head>

<Pagina titel={data.site.naam} ondertitel={data.site.repo} terug={{ href: '/', tekst: 'Sites' }}>
	<nldd-container gap="24">
		<nldd-toolbar label="Acties voor {data.site.naam}">
			<nldd-toolbar-item slot="start">
				<nldd-button
					appearance="primary"
					start-icon="plus"
					text="Nieuwe pagina"
					href="/sites/{data.site.id}/nieuw"
				></nldd-button>
				<nldd-menu-item
					slot="overflow"
					icon="plus"
					text="Nieuwe pagina"
					href="/sites/{data.site.id}/nieuw"
				></nldd-menu-item>
			</nldd-toolbar-item>
		</nldd-toolbar>

		{#if data.editorial}
			<nldd-container gap="8">
				<nldd-title size="3" heading-level="2" text="Te beoordelen ({data.teBeoordelen.length})"
				></nldd-title>
				<VoorstelLijst
					siteId={data.site.id}
					proposals={data.teBeoordelen}
					tab="beoordelen"
					{tabHref}
					editorial
					tabs={false}
				/>
			</nldd-container>
		{/if}
	</nldd-container>

	{#snippet vervolg()}
		<nldd-sidebar-section
			bind:this={mappen}
			sidebar-label="Mappen"
			onopen={() => mappenOpen(true)}
			onclose={() => mappenOpen(false)}
		>
			<nldd-container slot="header" layout="wrap" gap="16" vertical-alignment="center">
				<nldd-title
					size="3"
					heading-level="2"
					text={data.map ? `Pagina's in ${data.map}` : "Pagina's"}
				></nldd-title>
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<nldd-button
					bind:this={mappenKnop}
					class="mappen"
					appearance="secondary"
					start-icon="folder"
					text="Mappen"
					popup-type="dialog"
					onclick={() => mappen?.show()}
				></nldd-button>
			</nldd-container>

			<nldd-container slot="sidebar" padding="16">
				<!-- A navigation list is named by aria-label; it ignores accessible-label. -->
				<nldd-list type="navigation" accessible-label="Mappen" aria-label="Mappen">
					<nldd-list-item href={mapHref('')} current={data.map === '' || undefined}>
						<nldd-text-cell text="Hoogste niveau"></nldd-text-cell>
					</nldd-list-item>
					{#each data.folders as folder (folder)}
						<nldd-list-item href={mapHref(folder)} current={folder === data.map || undefined}>
							{#each { length: depth(folder) } as _, niveau (niveau)}
								<nldd-spacer-cell size="16"></nldd-spacer-cell>
							{/each}
							<nldd-text-cell text={label(folder)}></nldd-text-cell>
						</nldd-list-item>
					{/each}
				</nldd-list>
			</nldd-container>

			<nldd-list accessible-label={data.map ? `Pagina's in ${data.map}` : "Pagina's"}>
				<nldd-inline-dialog slot="empty" text="Geen pagina's in deze map"></nldd-inline-dialog>
				{#each data.pages as page (page.path)}
					{@const bewerkHref = `/sites/${data.site.id}/bewerken/${encodePath(page.path)}`}
					{#if page.verderBewerken}
						<nldd-list-item>
							<nldd-list-item-segment href={bewerkHref} width="full">
								<nldd-text-cell text={page.title} supporting-text={page.name}></nldd-text-cell>
							</nldd-list-item-segment>
							<nldd-list-item-segment
								href={page.verderBewerken}
								accessible-label="Verder met je voorstel voor {page.title}"
							>
								<nldd-text-cell text="Verder met je voorstel" width="fit-content"></nldd-text-cell>
							</nldd-list-item-segment>
						</nldd-list-item>
					{:else}
						<nldd-list-item href={bewerkHref}>
							<nldd-text-cell text={page.title} supporting-text={page.name}></nldd-text-cell>
							<nldd-spacer-cell size="8"></nldd-spacer-cell>
							<nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
						</nldd-list-item>
					{/if}
				{/each}
			</nldd-list>
		</nldd-sidebar-section>

		<nldd-simple-section>
			<nldd-title slot="header" size="3" heading-level="2" text="Voorstellen"></nldd-title>
			{#if data.proposalsError}
				<nldd-text color="critical">De voorstellen konden niet worden opgehaald.</nldd-text>
			{:else}
				<VoorstelLijst
					siteId={data.site.id}
					proposals={data.proposals}
					tab={data.tab}
					{tabHref}
					editorial={data.editorial}
				/>
			{/if}
		</nldd-simple-section>
	{/snippet}
</Pagina>

<style>
	.mappen {
		display: none;
	}
	:global(nldd-sidebar-section[collapsed]) .mappen {
		display: inline-flex;
	}
</style>
