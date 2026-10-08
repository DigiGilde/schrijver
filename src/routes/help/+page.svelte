<script lang="ts">
	import Pagina from '$lib/components/Pagina.svelte';
</script>

<svelte:head><title>Zo werkt Schrijver · Schrijver</title></svelte:head>

<Pagina titel="Zo werkt Schrijver">
	<nldd-container gap="16">
		<nldd-rich-text>
			<p>
				Met Schrijver bewerk je pagina's van onze websites in een gewone tekstverwerker-achtige
				editor en stel je wijzigingen voor aan de redactie. Je hebt geen GitHub-account nodig.
			</p>

			<h2>Stap voor stap</h2>
			<ol>
				<li>Kies een site op de beginpagina.</li>
				<li>Open een bestaande pagina, of kies "Nieuwe pagina" en het soort pagina.</li>
				<li>
					Bewerk de tekst met de werkbalk: vet, cursief, koppen, lijsten met opsommingstekens of
					nummers, citaten, links, code en codeblokken, tabellen, horizontale lijnen, afbeeldingen
					en diagrammen. Met "Inspringen" en "Uitspringen" zet je een punt in een lijst een niveau
					dieper of terug. Velden zoals de samenvatting vul je in bij "Eigenschappen" in de
					werkbalk.
				</li>
				<li>
					Kies "Voorbeeld" in de werkbalk om de pagina te zien met afbeeldingen en diagrammen. Het
					voorbeeld lijkt op de site, maar is niet precies hetzelfde. Met "Schrijven" ga je verder
					met de tekst.
				</li>
				<li>
					Kies "Concept bewaren" om je werk op te slaan. Dat maakt een voorstel op GitHub. Bij sites
					met een openbare repository is dat concept voor iedereen leesbaar, ook voordat je het
					instuurt. Zet dus niets in een concept dat nog niet openbaar mag.
				</li>
				<li>
					Kies "Insturen" als je klaar bent. Dan vraagt Schrijver de redactie om je voorstel te
					beoordelen. Je kunt later terugkomen bij je voorstellen op de pagina van de site.
				</li>
			</ol>

			<h2>Afbeeldingen en diagrammen</h2>
			<p>
				Bij elke afbeelding vul je een alternatieve tekst in; zonder die tekst kun je de afbeelding
				niet toevoegen. Bij een diagram (Mermaid) hoort een beschrijving in de regel
				<code>accDescr</code>. Zonder beschrijving kun je niet bewaren.
			</p>

			<h2>De schrijfhulp</h2>
			<p>
				De schrijfhulp (VLAM) stelt wijzigingen voor, bijvoorbeeld een kortere zin of een tekst op
				B1-niveau. Zij schrijft nooit zelf in je pagina: jij kiest "Overnemen" of "Verwerpen". Heb
				je een stuk tekst geselecteerd, dan werkt de hulp alleen op die selectie; anders op de hele
				tekst. De hulp krijgt alleen de tekst waar je mee werkt en de schrijfwijzer van de site,
				nooit je naam, e-mailadres of keuze voor naamsvermelding. Controleer elk voorstel zelf.
			</p>
			<p>
				Bij een nieuwe pagina kan de schrijfhulp uit een korte beschrijving een titel en een opzet
				maken. Je ziet ze eerst in het formulier en past ze aan waar nodig. Met "Pagina maken" komen
				ze in de editor; bewaard wordt er pas iets als je "Concept bewaren" kiest.
			</p>
			<p>
				De schrijfhulp gebruikt een taalmodel (VLAM van SSC-ICT); het stelt alleen voor, jij
				beslist.
			</p>

			<h2>Wat je identiteitskeuze betekent</h2>
			<ul>
				<li>
					<strong>Anoniem</strong>: op GitHub staat alleen een codenaam, geen naam of e-mailadres.
				</li>
				<li>
					<strong>Gekoppeld aan GitHub</strong>: je wijziging staat onder je GitHub-profiel. Je
					werk-e-mailadres blijft verborgen.
				</li>
				<li>
					<strong>Op naam</strong>: je volledige naam en e-mailadres staan bij je wijziging.
				</li>
			</ul>
			<p>
				Welke keuzes beschikbaar zijn, verschilt per site. Je kunt je keuze wijzigen bij
				"Instellingen". Wat je tekst zegt blijft altijd zichtbaar, ook als je anoniem bent.
			</p>

			<h2>Hulp nodig?</h2>
			<p>
				Loop je vast, werkt iets niet of mis je een site? Vraag het aan de redactie van de site of
				aan het team dat Schrijver beheert.
			</p>
			<p>
				Meer over <a
					href="https://github.com/DigiGilde/schrijver/blob/main/docs/toegankelijkheid.md"
					>toegankelijkheid van Schrijver</a
				>.
			</p>
		</nldd-rich-text>
	</nldd-container>
</Pagina>
