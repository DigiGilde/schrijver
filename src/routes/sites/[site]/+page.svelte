<script lang="ts">
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
</script>

<svelte:head><title>{data.site.naam} - Schrijver</title></svelte:head>

<nldd-simple-section>
	<nldd-container gap="24">
		<nldd-title size="1" heading-level="1" text={data.site.naam}>
			<nldd-link
				slot="end"
				href="/sites/{data.site.id}/nieuw"
				start-icon="plus"
				text="Nieuwe pagina"
			></nldd-link>
		</nldd-title>

		{#if data.editorial}
			<section aria-label="Te beoordelen">
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
			</section>
		{/if}

		<nldd-container layout="wrap" gap="32">
			<nav aria-label="Mappen">
				<nldd-title size="4" heading-level="2" text="Mappen"></nldd-title>
				<ul class="lijst">
					<li>
						<nldd-link href={mapHref('')} text="Hoogste niveau"></nldd-link>
					</li>
					{#each data.folders as folder (folder)}
						<li style:padding-inline-start="{depth(folder) * 16}px">
							<nldd-link
								href={mapHref(folder)}
								text={label(folder)}
								aria-current={folder === data.map ? 'true' : undefined}
							></nldd-link>
						</li>
					{/each}
				</ul>
			</nav>

			<section aria-label="Pagina's">
				<nldd-title
					size="4"
					heading-level="2"
					text={data.map ? `Pagina's in ${data.map}` : "Pagina's"}
				></nldd-title>
				{#if data.pages.length === 0}
					<nldd-text>Geen pagina's in deze map.</nldd-text>
				{:else}
					<ul class="lijst">
						{#each data.pages as page (page.path)}
							<li>
								<nldd-container layout="wrap" gap="12">
									<nldd-text weight="bold">{page.title}</nldd-text>
									<nldd-text color="secondary" size="sm">{page.name}</nldd-text>
									<nldd-link
										size="sm"
										href="/sites/{data.site.id}/bewerken/{encodePath(page.path)}"
										text="Bewerken"
										accessible-label="Bewerken {page.title}"
									></nldd-link>
									{#if page.verderBewerken}
										<nldd-link
											size="sm"
											href={page.verderBewerken}
											text="Verder met je voorstel"
											accessible-label="Verder met je voorstel voor {page.title}"
										></nldd-link>
									{/if}
								</nldd-container>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</nldd-container>

		<section aria-label="Voorstellen">
			<nldd-title size="3" heading-level="2" text="Voorstellen"></nldd-title>
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
		</section>
	</nldd-container>
</nldd-simple-section>

<style>
	.lijst {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
</style>
