<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
	import { addressText } from '$lib/config/site-address';

	let { data } = $props();

	const ONDERTEKENEN = {
		anoniem: {
			naam: 'Anoniem',
			uitleg: 'op GitHub staat alleen een codenaam, geen naam of e-mailadres.'
		},
		gekoppeld: {
			naam: 'Gekoppeld aan GitHub',
			uitleg: 'je wijziging staat onder je GitHub-profiel. Je werk-e-mailadres blijft verborgen.'
		},
		'op-naam': {
			naam: 'Op naam',
			uitleg: 'je volledige naam en e-mailadres staan bij je wijziging.'
		}
	} as const;

	const VOORBEELD = {
		'bij-push':
			'Elk voorstel krijgt een voorbeeldsite. Na elke keer bewaren bouwt de site een voorbeeldsite van het voorstel. Je opent die met "Voorbeeldsite bekijken" op de pagina van het voorstel.',
		'bij-label':
			'Een voorstel krijgt een voorbeeldsite zodra het is ingestuurd. Na "Stuur in" bouwt de site een voorbeeldsite van het voorstel. Je opent die met "Voorbeeldsite bekijken" op de pagina van het voorstel.',
		geen: 'Deze site maakt geen voorbeeldsite van een voorstel. Wil je zien hoe een pagina eruitziet, kies dan "Voorbeeld" in de editor. Dat lijkt op de site, maar is niet precies hetzelfde.'
	} as const;
</script>

<svelte:head><title>Over {data.site.naam} · Schrijver</title></svelte:head>

<Pagina
	titel="Over {data.site.naam}"
	terug={{ href: `/sites/${data.site.id}`, tekst: data.site.naam }}
>
	<nldd-container gap="40">
		{#if data.site.omschrijving || data.site.adres}
			<nldd-container gap="12">
				{#if data.site.omschrijving}
					<nldd-text>{data.site.omschrijving}</nldd-text>
				{/if}
				{#if data.site.adres}
					<nldd-link
						href={data.site.adres}
						target="_blank"
						end-icon="external-link"
						text={addressText(data.site.adres)}
					></nldd-link>
				{/if}
			</nldd-container>
		{/if}

		<nldd-container gap="12">
			<nldd-title size="3" heading-level="2" text="Redactie"></nldd-title>
			<nldd-rich-text>
				{#if data.redactie.length > 0}
					<p>De redactie beslist over de voorstellen. Bij deze site zijn dat:</p>
					<ul>
						{#each data.redactie as lid, i (i)}
							<li>{lid.naam ?? 'Een collega'}{lid.beheerder ? ' (beheerder)' : ''}</li>
						{/each}
					</ul>
				{:else}
					<p>
						De redactie beslist over de voorstellen. Bij deze site staat nog niemand in de redactie.
					</p>
				{/if}
				<p>Een vraag aan de redactie stel je in het gesprek bij je voorstel.</p>
				{#if !data.mergenVanuitSchrijver}
					<p>Op deze site gebeurt het samenvoegen op GitHub, niet in Schrijver.</p>
				{/if}
				{#if data.kanBeheren}
					<p>
						Het team en de instellingen van deze site wijzig je bij <a
							href="/instellingen/sites/{data.site.id}">Beheer van {data.site.naam}</a
						>.
					</p>
				{/if}
			</nldd-rich-text>
		</nldd-container>

		{#if data.zichtbaarheid === 'team'}
			<nldd-container gap="12">
				<nldd-title size="3" heading-level="2" text="Zichtbaar voor"></nldd-title>
				<nldd-rich-text>
					<p>
						Alleen het team ziet deze site in Schrijver: de redactie hierboven en de bijdragers.
					</p>
					{#if data.repoOpenbaar === false}
						<p>
							Wie de repository op GitHub mag lezen, ziet de site ook, als die een GitHub-account
							aan Schrijver heeft gekoppeld.
						</p>
					{:else if data.repoOpenbaar}
						<p>
							De repository op GitHub is wel openbaar: daar kan iedereen de pagina's en de
							voorstellen lezen.
						</p>
					{/if}
				</nldd-rich-text>
			</nldd-container>
		{/if}

		<nldd-container gap="12">
			<nldd-title size="3" heading-level="2" text="Ondertekenen"></nldd-title>
			<nldd-rich-text>
				<p>Bij deze site kun je ondertekenen als:</p>
				<ul>
					{#each data.ondertekenen as soort (soort)}
						<li><strong>{ONDERTEKENEN[soort].naam}</strong>: {ONDERTEKENEN[soort].uitleg}</li>
					{/each}
				</ul>
				<p>
					Je keuze stel je in bij <a href="/instellingen">Instellingen</a>. Staat deze site jouw
					keuze niet toe, dan ondertekent Schrijver hier met minder gegevens van jou, bijvoorbeeld
					anoniem.
				</p>
			</nldd-rich-text>
		</nldd-container>

		<nldd-container gap="12">
			<nldd-title size="3" heading-level="2" text="Concepten"></nldd-title>
			<nldd-rich-text>
				{#if data.conceptenOpenbaar}
					<p>
						Concepten zijn openbaar. De repository van deze site is openbaar: iedereen kan een
						concept op GitHub lezen vanaf de eerste keer dat je het bewaart, ook voordat je het
						instuurt. Zet er dus niets in wat nog niet openbaar mag.
					</p>
				{:else}
					<p>
						Concepten zijn niet openbaar. De repository van deze site is niet openbaar: een concept
						lezen alleen het team in Schrijver en wie de repository op GitHub mag lezen.
					</p>
				{/if}
			</nldd-rich-text>
		</nldd-container>

		<nldd-container gap="12">
			<nldd-title size="3" heading-level="2" text="Voorbeeldsite van een voorstel"></nldd-title>
			<nldd-rich-text><p>{VOORBEELD[data.voorbeeld]}</p></nldd-rich-text>
		</nldd-container>

		<nldd-container gap="12">
			<nldd-title size="3" heading-level="2" text="Bestanden op GitHub"></nldd-title>
			<nldd-rich-text>
				<p>
					De pagina's staan op GitHub in <a href={data.repoUrl}>{data.repo}, branch {data.branch}</a
					>. Collega's die GitHub kennen, kunnen daar ook direct werken. Hun voorstellen staan ook
					bij Voorstellen, met "Via GitHub".
				</p>
				<p>
					Collega's met schrijfrechten op de repository op GitHub horen ook bij de redactie; met
					beheerrechten daar zijn ze beheerder.
				</p>
				<p>
					De structuur van de site staat in de map <a href={data.structuurUrl}
						>.schrijver op GitHub</a
					>. Die wijzig je met een voorstel in de repository van de site.
				</p>
			</nldd-rich-text>
		</nldd-container>

		<nldd-rich-text>
			<p>Hoe een wijziging op de site komt, lees je bij <a href="/help#voorstellen">Help</a>.</p>
		</nldd-rich-text>
	</nldd-container>
</Pagina>
