<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
	import SiteKop from '$lib/components/SiteKop.svelte';

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
		'bij-push': {
			kop: 'Elk voorstel krijgt een voorbeeld van de site',
			uitleg:
				'Na elke keer bewaren bouwt de site een voorbeeld van het voorstel. Je opent het met "Bekijk het voorbeeld" op de pagina van het voorstel.'
		},
		'bij-label': {
			kop: 'Een voorstel krijgt een voorbeeld zodra het is ingestuurd',
			uitleg:
				'Na "Insturen" bouwt de site een voorbeeld van het voorstel. Je opent het met "Bekijk het voorbeeld" op de pagina van het voorstel.'
		},
		geen: {
			kop: 'Deze site maakt geen voorbeeld van een voorstel',
			uitleg:
				'Wil je zien hoe een pagina eruitziet, kies dan "Voorbeeld" in de editor. Dat lijkt op de site, maar is niet precies hetzelfde.'
		}
	} as const;

	const voorbeeld = $derived(VOORBEELD[data.voorbeeld]);
</script>

<svelte:head><title>Over deze site · {data.site.naam} · Schrijver</title></svelte:head>

<Pagina
	titel={data.site.naam}
	ondertitel={data.site.omschrijving ?? undefined}
	terug={{ href: '/', tekst: 'Sites' }}
>
	<SiteKop site={data.site} huidig="over" wachtend={data.wachtend} />

	{#snippet vervolg()}
		<nldd-simple-section padding-top="0">
			<nldd-container gap="40">
				<nldd-container gap="12">
					<nldd-title size="3" heading-level="2" text="Zo komt een wijziging op de site"
					></nldd-title>
					<nldd-rich-text>
						<ol>
							<li>
								<strong>Concept.</strong> Je opent een pagina, past de tekst aan en kiest "Concept bewaren".
								Schrijver maakt er een voorstel van. De site verandert nog niet.
							</li>
							<li>
								<strong>Ingestuurd.</strong> Is het voorstel klaar, dan kies je "Insturen". De redactie
								krijgt het om te beoordelen.
							</li>
							<li>
								<strong>Goedgekeurd.</strong> De redactie keurt het voorstel goed, of vraagt je eerst
								iets aan te passen.
							</li>
							<li>
								<strong>Samengevoegd.</strong> De redactie voegt het voorstel samen. Na de volgende
								publicatie staat de wijziging op
								{#if data.site.adres}<a href={data.site.adres}>{data.site.naam}</a>{:else}de site{/if}.
							</li>
						</ol>
						<p>
							Bij <a href="/sites/{data.site.id}/voorstellen">Voorstellen</a> zie je per voorstel waar
							het staat en wat de volgende stap is.
						</p>
					</nldd-rich-text>
				</nldd-container>

				<nldd-container gap="12">
					<nldd-title
						size="3"
						heading-level="2"
						text="Iedereen mag voorstellen, de redactie beslist"
					></nldd-title>
					<nldd-rich-text>
						<ul>
							<li>Iedereen die inlogt met SSO Rijk mag wijzigingen voorstellen.</li>
							<li>
								De redactie beoordeelt de voorstellen en voegt ze samen. Bij deze site zijn dat:
								<ul>
									{#each data.redactie as adres (adres)}
										<li><a href="mailto:{adres}">{adres}</a></li>
									{/each}
									<li>iedereen met schrijfrechten op de repository op GitHub.</li>
								</ul>
							</li>
							<li>
								Goedkeuren doet de redactie op GitHub.
								{data.mergenVanuitSchrijver
									? 'Samenvoegen kan in Schrijver en op GitHub.'
									: 'Samenvoegen gebeurt ook op GitHub, niet in Schrijver.'}
							</li>
							<li>
								Collega's die GitHub kennen, kunnen ook direct op GitHub werken. Hun voorstellen
								staan ook bij Voorstellen, met "Via GitHub".
							</li>
						</ul>
					</nldd-rich-text>
				</nldd-container>

				<nldd-container gap="12">
					<nldd-title size="3" heading-level="2" text="Je kiest zelf hoe je ondertekent"
					></nldd-title>
					<nldd-rich-text>
						<p>Bij deze site kun je ondertekenen als:</p>
						<ul>
							{#each data.ondertekenen as soort (soort)}
								<li><strong>{ONDERTEKENEN[soort].naam}</strong>: {ONDERTEKENEN[soort].uitleg}</li>
							{/each}
						</ul>
						<p>
							Je keuze stel je in bij <a href="/instellingen">Instellingen</a>. Staat deze site jouw
							keuze niet toe, dan ondertekent Schrijver hier met een keuze die niet meer van je laat
							zien.
						</p>
					</nldd-rich-text>
				</nldd-container>

				<nldd-container gap="12">
					<nldd-title
						size="3"
						heading-level="2"
						text={data.conceptenOpenbaar
							? 'Concepten zijn openbaar'
							: 'Concepten zijn niet openbaar'}
					></nldd-title>
					<nldd-rich-text>
						{#if data.conceptenOpenbaar}
							<p>
								De repository van deze site is openbaar. Iedereen kan een concept op GitHub lezen
								vanaf de eerste keer dat je het bewaart, ook voordat je het instuurt. Zet er dus
								niets in wat nog niet openbaar mag.
							</p>
						{:else}
							<p>
								De repository van deze site is niet openbaar. Een concept is alleen te lezen voor
								wie toegang heeft tot de repository op GitHub.
							</p>
						{/if}
					</nldd-rich-text>
				</nldd-container>

				<nldd-container gap="12">
					<nldd-title size="3" heading-level="2" text={voorbeeld.kop}></nldd-title>
					<nldd-rich-text><p>{voorbeeld.uitleg}</p></nldd-rich-text>
				</nldd-container>

				<nldd-container gap="12">
					<nldd-title size="3" heading-level="2" text="Voor wie met GitHub werkt"></nldd-title>
					<nldd-rich-text>
						<p>
							De pagina's staan op GitHub in <a href={data.repoUrl}
								>{data.repo}, branch {data.branch}</a
							>. Een voorstel is daar een pull request.
						</p>
						<p>
							Deze gegevens kun je hier alleen lezen. De instellingen van deze site staan in de
							configuratierepository{data.configuratie
								? ` ${data.configuratie}`
								: ' van Schrijver'}, die niet openbaar is. Wijzigingen daarin gaan via de beheerders
							van Schrijver.
						</p>
					</nldd-rich-text>
				</nldd-container>
			</nldd-container>
		</nldd-simple-section>
	{/snippet}
</Pagina>
