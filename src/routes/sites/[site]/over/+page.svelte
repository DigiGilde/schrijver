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
			'Elk voorstel krijgt een voorbeeld van de site. Na elke keer bewaren bouwt de site een voorbeeld van het voorstel. Je opent het met "Bekijk het voorbeeld" op de pagina van het voorstel.',
		'bij-label':
			'Een voorstel krijgt een voorbeeld zodra het is ingestuurd. Na "Insturen" bouwt de site een voorbeeld van het voorstel. Je opent het met "Bekijk het voorbeeld" op de pagina van het voorstel.',
		geen: 'Deze site maakt geen voorbeeld van een voorstel. Wil je zien hoe een pagina eruitziet, kies dan "Voorbeeld" in de editor. Dat lijkt op de site, maar is niet precies hetzelfde.'
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
				<p>De redactie beslist over de voorstellen. Bij deze site zijn dat:</p>
				<ul>
					{#each data.redactie as adres (adres)}
						<li><a href="mailto:{adres}">{adres}</a></li>
					{/each}
					<li>iedereen met schrijfrechten op de repository op GitHub.</li>
				</ul>
				{#if !data.mergenVanuitSchrijver}
					<p>Op deze site gebeurt het samenvoegen op GitHub, niet in Schrijver.</p>
				{/if}
			</nldd-rich-text>
		</nldd-container>

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
						is alleen te lezen voor wie toegang heeft tot de repository op GitHub.
					</p>
				{/if}
			</nldd-rich-text>
		</nldd-container>

		<nldd-container gap="12">
			<nldd-title size="3" heading-level="2" text="Voorbeeld van een voorstel"></nldd-title>
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
					Deze gegevens kun je hier alleen lezen. De instellingen van deze site staan in de
					configuratierepository{data.configuratie ? ` ${data.configuratie}` : ' van Schrijver'},
					die niet openbaar is. Wijzigingen daarin gaan via de beheerders van Schrijver.
				</p>
			</nldd-rich-text>
		</nldd-container>

		<nldd-rich-text>
			<p>Hoe een wijziging op de site komt, lees je bij <a href="/help#voorstellen">Help</a>.</p>
		</nldd-rich-text>
	</nldd-container>
</Pagina>
