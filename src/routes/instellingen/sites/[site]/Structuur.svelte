<script lang="ts">
	import type { PageData } from './$types';

	type Props = { structuur: PageData['structuur'] };
	let { structuur }: Props = $props();

	const samenvatting = $derived(structuur.samenvatting);
</script>

<nldd-container gap="16">
	<div class="kop" id="structuur" tabindex="-1">
		<nldd-title size="3" heading-level="2" text="Structuur"></nldd-title>
	</div>
	<nldd-rich-text>
		<p>
			Hoe de site is opgebouwd, staat in de map .schrijver in de repository: welke pagina's je hier
			bewerkt, welke velden een pagina heeft en hoe een voorstel een voorbeeldsite krijgt. Dit
			wijzig je met een voorstel in de repository van de site.
		</p>
	</nldd-rich-text>
	{#if structuur.fouten.length > 0}
		<nldd-container gap="8">
			<nldd-title size="4" heading-level="3" text="Wat er niet klopt"></nldd-title>
			<nldd-rich-text>
				<ul>
					{#each structuur.fouten as fout, i (i)}
						<li>{fout}</li>
					{/each}
				</ul>
			</nldd-rich-text>
		</nldd-container>
	{/if}
	{#if samenvatting}
		<nldd-list accessible-label="Structuur van de site">
			<nldd-list-item>
				<nldd-description-cell>
					<span slot="title">Pagina's</span>
					<span slot="description"
						>{samenvatting.paginas}{samenvatting.uitsluiten.length > 0
							? `, behalve ${samenvatting.uitsluiten.join(', ')}`
							: ''}</span
					>
				</nldd-description-cell>
			</nldd-list-item>
			<nldd-list-item>
				<nldd-description-cell>
					<span slot="title">Nieuwe pagina's</span>
					<span slot="description">{samenvatting.nieuwePaginas.join(', ')}</span>
				</nldd-description-cell>
			</nldd-list-item>
			<nldd-list-item>
				<nldd-description-cell>
					<span slot="title">Afbeeldingen</span>
					<span slot="description"
						>{samenvatting.afbeeldingen ?? 'Deze site neemt geen afbeeldingen aan'}</span
					>
				</nldd-description-cell>
			</nldd-list-item>
			<nldd-list-item>
				<nldd-description-cell>
					<span slot="title">Voorbeeldsite van een voorstel</span>
					<span slot="description">{samenvatting.voorbeeld}</span>
				</nldd-description-cell>
			</nldd-list-item>
			<nldd-list-item>
				<nldd-description-cell>
					<span slot="title">Schrijfwijzer</span>
					<span slot="description">{samenvatting.schrijfwijzer ? 'Ja' : 'Nee'}</span>
				</nldd-description-cell>
			</nldd-list-item>
		</nldd-list>
	{/if}
	<nldd-link href={structuur.url} text="Bekijk .schrijver op GitHub"></nldd-link>
</nldd-container>

<style>
	.kop:focus {
		outline: none;
	}
</style>
