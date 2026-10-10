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
					werkbalk. De bestandsnaam is het adres van de pagina op de site. Die verandert niet als je
					de titel wijzigt.
				</li>
				<li>
					Kies "Voorbeeld" in de werkbalk om de pagina te zien met afbeeldingen en diagrammen. Het
					voorbeeld lijkt op de site, maar is niet precies hetzelfde. Met "Schrijven" ga je verder
					met de tekst.
				</li>
				<li>
					Bewaar je werk en stuur het in. Hoe dat gaat, lees je bij
					<a href="#voorstellen">Zo komt een wijziging op de site</a>.
				</li>
			</ol>

			<h2 id="voorstellen">Zo komt een wijziging op de site</h2>
			<p>Elke wijziging gaat als voorstel door drie stappen:</p>
			<ol>
				<li>
					<strong>Concept.</strong> Kies "Bewaar". Dat maakt een voorstel op GitHub, maar de site verandert
					nog niet. Bij sites met een openbare repository is het concept voor iedereen leesbaar, ook voordat
					je het instuurt. Zet dus niets in een concept dat nog niet openbaar mag.
				</li>
				<li>
					<strong>Ingestuurd.</strong> Kies "Stuur in" als je klaar bent. Dan vraagt Schrijver de redactie
					van de site om te beslissen. Je kunt later terugkomen bij je voorstellen op de pagina van de
					site.
				</li>
				<li>
					<strong>Samengevoegd.</strong> Na de volgende publicatie staat de wijziging op de site.
				</li>
			</ol>
			<p>
				In de lijsten van voorstellen staat soms "Goedgekeurd": het voorstel is ingestuurd en op
				GitHub goedgekeurd, en de redactie kan het samenvoegen.
			</p>
			<p>
				De redactie beslist over een ingestuurd voorstel. Ze kiest "Voeg samen", of kiest
				"Aanpassing vragen" en schrijft wat er anders moet.
			</p>
			<p>
				Vraagt de redactie om een aanpassing, dan heeft het voorstel de status "Aanpassing
				gevraagd". Je leest wat de redactie vraagt bij "Gesprek" op de pagina van het voorstel. Pas
				het voorstel aan met "Verder bewerken" en kies daarna "Stuur opnieuw in".
			</p>
			<p>
				Niemand voegt een eigen voorstel samen: een ander lid van de redactie beslist, zodat er
				altijd vier ogen meekijken. Beheerders van de site mogen hun eigen voorstel wel samenvoegen.
				Een site kan deze regel ook uitzetten.
			</p>
			<p>
				Bij sommige sites is eerst een goedkeuring op GitHub nodig. Dat staat dan op de pagina van
				het voorstel.
			</p>
			<p>
				Wie de redactie van een site is, lees je bij "Over" en de naam van de site. Dat staat in het
				menu zodra je op een pagina van die site bent.
			</p>

			<h2>Afbeeldingen en diagrammen</h2>
			<p>
				Bij elke afbeelding vul je een alt-tekst in; zonder die tekst kun je de afbeelding niet
				toevoegen. Bij een diagram (Mermaid) hoort een beschrijving in de regel
				<code>accDescr</code>. Zonder beschrijving kun je niet bewaren.
			</p>

			<h2>De schrijfhulp</h2>
			<p>
				De schrijfhulp (VLAM) geeft suggesties, bijvoorbeeld een kortere zin of een tekst op
				B1-niveau. Zij schrijft nooit zelf in je pagina: jij kiest "Neem suggestie over" of "Verwerp
				suggestie". Heb je een stuk tekst geselecteerd, dan werkt de schrijfhulp alleen op die
				selectie; anders op de hele tekst. De schrijfhulp krijgt alleen de tekst waar je mee werkt
				en de schrijfwijzer van de site, nooit je naam, e-mailadres of keuze voor naamsvermelding.
				Controleer elke suggestie zelf.
			</p>
			<p>
				Bij een nieuwe pagina kan de schrijfhulp uit een korte beschrijving een titel en een opzet
				maken. Je ziet ze eerst in het formulier en past ze aan waar nodig. Met "Maak pagina" komen
				ze in de editor; bewaard wordt er pas iets als je "Bewaar" kiest.
			</p>
			<p>
				De schrijfhulp gebruikt een taalmodel (VLAM van SSC-ICT); het geeft alleen suggesties, jij
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
				Sommige sites ziet alleen hun team: mis je zo'n site, vraag dan een beheerder van die site
				om je toe te voegen.
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
