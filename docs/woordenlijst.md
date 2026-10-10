# Woordenlijst

The words of Schrijver's interface. One concept has one name, the same in buttons, headings, status sentences, Help, Over, the beheer screens, error messages, the docs and the tests. The interface is Dutch and plain (B1), so this page is English and quotes the Dutch words; the "Not" column lists words the interface must not use for that concept.

Add the row here before a new word enters the interface. A unit test ([tests/unit/ui-jargon.test.ts](../tests/unit/ui-jargon.test.ts)) keeps "pull request", "branch", "merge", "frontmatter", "opslaan" and a few retired words out of everything a colleague can read in a `.svelte` file; the end-to-end specs pin the labels.

## How a label is written

The rule is the NLDD one: a direct action is an imperative, an indirect action a full verb.

| The control | Form | Examples |
| --- | --- | --- |
| Acts at once: calls the server, changes state, submits a complete form | Imperative with its object | "Bewaar", "Stuur in", "Stuur opnieuw in", "Voeg samen", "Plaats reactie", "Vraag om aanpassing", "Neem suggestie over", "Voeg toe aan het team", "Log uit" |
| Leads on to a place where the action still has to happen: another page, a sheet, a form further down, another site | Full verb, with its object when the verb alone is poor | "Verder bewerken", "Aanpassing vragen", "Titel wijzigen", "Site toevoegen", "Uitloggen", "GitHub-account koppelen", "Voorstel bekijken op GitHub" |
| Opens a dialog that asks for a choice | The opener and the dialog's own button name the same action in the same words, as the NLDD pattern for an irreversible action says; the safe way out comes first and is primary | "Haal uit het team" and "Houd in het team"; "Verwijder site" and "Houd de site" |
| Ends something without doing more | One imperative | "Annuleer", "Sluit", "Verberg" |
| Names a place, a view, a tab or a toggle | A noun, as the destination is titled | "Pagina's", "Voorstellen", "Mijn voorstellen", "Te beoordelen", "Eigenschappen", "Nieuwe pagina", "Vet" |

A label starts with a word that means something ("Voeg toe aan het team", not "Voeg toe"), names its object where the bare verb is poor without the text around it ("Controleer repository", "Vraag Schrijfhulp"), is in sentence case and has no full stop.

A sentence that points at a control quotes its label with straight double quotes and the capital of the label: `Kies "Stuur in"`, `met "Voeg samen"`, `bij "Gesprek"`. Never unquoted (`Kies Opnieuw insturen`), never with single quotes (`'Op naam'`). A prose imperative that is not a pointer may stay ("Klopt alles, voeg het dan samen") while it uses the same verb as the label. Do not repeat a label in a longer form in one paragraph; say what happens instead.

## One name per concept

### Writing and saving

| Concept | Noun | Verb and labels | Not |
| --- | --- | --- | --- |
| Saving | "bewaard" | "bewaren"; "Bewaar" on every save: the editor, the first one included, the question about images no page uses, the role sheet, the settings of a site and the signing choice. Messages: "Bewaren is mislukt", "Instellingen bewaard", "Niet bewaard: ..." | "opslaan", "opgeslagen", "Concept bewaren" |
| Concept | "concept": a proposal that is saved on GitHub and not sent in yet. The step and the status "Concept", "Concept bewaard als voorstel #N", "Openbaar concept" | none | "concept" for the text a browser keeps |
| Unsaved text | "niet-bewaarde tekst": what this browser remembers and the page does not hold ("Niet-bewaarde tekst gevonden") | "Herstel" and "Gooi weg" | "concept", "Herstellen", "Weggooien" |
| A new page | "Nieuwe pagina" | "Maak pagina" opens the editor on the new page, nothing is saved yet; "Maak een opzet" asks Schrijfhulp for a title and an "opzet" (outline) | "Pagina maken" |
| Page properties | "Eigenschappen" for the set (the sheet and the toolbar button), "eigenschap" or "veld" for one | "Eigenschappen wijzigen", "Titel wijzigen" | "frontmatter", "gegevensblok", "gegevens bovenaan de pagina", "Eigenschappen aanpassen" |
| The alternative text of an image | "alt-tekst" | none | "alternatieve tekst" |
| An image | "afbeelding" | "Afbeelding invoegen" opens the dialog (toolbar, named exception below); "Voeg afbeelding in" confirms; "Annuleer" ends | "Invoegen", "Annuleren" |
| Two versions of a page | "Mijn versie", "Hun versie" | "Houd mijn versie", "Neem hun versie over" | "Mijn versie behouden", "Hun versie overnemen" |

### The proposal

| Concept | Noun | Verb and labels | Not |
| --- | --- | --- | --- |
| Proposal and change | "voorstel" is what the redactie decides on; "wijziging" is what it changes on the site | none | "pull request", "PR", "branch", "merge" |
| Step and status | "stap" for the three on the step bar (Concept, Ingestuurd, Samengevoegd); "status" for the six in the lists (those and Goedgekeurd, Aanpassing gevraagd, Gesloten) | none | "Goedgekeurd" as a step |
| Sending in | "ingestuurd" | "insturen"; "Stuur in", "Stuur opnieuw in" | "Insturen" and "Opnieuw insturen" as buttons |
| Merging | "samengevoegd" | "samenvoegen"; "Voeg samen"; the site setting "Samenvoegen in Schrijver" | "mergen", "merge" |
| An adjustment | "aanpassing"; the request is "een vraag om aanpassing" | "Aanpassing vragen" opens the reply form, "Vraag om aanpassing" posts it; the status is "Aanpassing gevraagd" | "opmerking" |
| Reviewing, deciding, approving | "beoordeling" is what the redactie does with a sent-in proposal ("Te beoordelen"); "beslissing" is the choice between "Voeg samen" and "Aanpassing vragen"; "goedkeuring" is only the approval on GitHub | "beoordelen", "beslissen", "goedkeuren"; "Goedkeuren op GitHub" and "Beoordelen op GitHub" lead to the work done there | "review", "reviewer", "kijken" |
| A reaction | "reactie"; the thread is "het gesprek" | "plaatsen": "Plaats reactie"; "Maak er een gewone reactie van" turns a request for an adjustment back into a reaction | "opmerking" |
| Continuing to edit | none | "Verder bewerken" on every screen; its accessible name is "Verder bewerken: {titel}" | "Verder met je voorstel" |
| Preview | "voorbeeld" is the view in the editor; "voorbeeldsite" is the site that the repository builds for a proposal | "Voorbeeldsite bekijken"; "Schrijven" and "Voorbeeld" switch the view; "Voorbeeldsite van een voorstel", "Geen voorbeeldsite" | "voorbeeld" for the built site |

### Schrijfhulp

| Concept | Noun | Verb and labels | Not |
| --- | --- | --- | --- |
| The assistant | "Schrijfhulp" is the panel and a name, "de schrijfhulp" in running text; "VLAM" is the model | "Vraag Schrijfhulp" sends the own instruction (field "Eigen opdracht") | "de hulp", "assistent" |
| What it gives back | "suggestie": "Suggestie van Schrijfhulp: Korter", "Suggestie staat in de tekstkolom", "Suggestie voor de selectie" | "Neem suggestie over", "Verwerp suggestie", "Gebruik als samenvatting" | "voorstel" for a suggestion, "Overnemen", "Verwerpen" |

### People, roles and signing

| Concept | Noun | Verb and labels | Not |
| --- | --- | --- | --- |
| The writer of a proposal | "de schrijver", always with an article; "je" when addressed; a name or "een anonieme collega" in the subtitle | none | "Schrijver" without an article for a person: that is the application |
| Redactie and team | "de redactie" is who decides (the roles Redactie and Beheerder); "het team" is everyone with a role on the site (Beheerder, Redactie, Bijdrager) | "Voeg toe aan het team", "Haal uit het team", "Houd in het team", "Trek uitnodiging in" | "het team beslist" |
| The three roles | "Beheerder", "Redactie", "Bijdrager": a bijdrager makes proposals and never decides | none | "Schrijver" as a role |
| Beheerder | "beheerder" is the role on one site; "beheerder van Schrijver" is who runs the application (the platform admin of the docs) | none | "Schrijver-beheerder", "de beheerders" for the operators, "het team dat Schrijver beheert" |
| Who sees a site | "Zichtbaar voor": "Iedereen die inlogt" or "Alleen het team" | none | none |
| Signing | "ondertekenen"; the options "Anoniem", "Gekoppeld aan GitHub" and "Op naam"; "je keuze bij Ondertekenen" | none | "identiteitskeuze", "naamsvermelding" |
| The GitHub account | "GitHub-account" | "GitHub-account koppelen" leads to GitHub, "Ontkoppel GitHub-account" acts at once | "Koppel je GitHub-account", "Koppeling verwijderen" |
| Signing out | "uitgelogd" | "Uitloggen" in the menu, "Log uit" as the button, "Uitloggen bij SSO Rijk" | "afmelden", "afgemeld" |
| A reference | "kenmerk" is the SSO identifier ("Je kenmerk bij SSO Rijk"); "foutkenmerk" is the reference of an error | none | "kenmerk" for the reference of an error |

### Places and settings

| Concept | Noun | Verb and labels | Not |
| --- | --- | --- | --- |
| Instellingen, Beheer, Structuur | "Instellingen" is the personal page; "Beheer van {site}" is where the admins of a site work; "Instellingen van de site" and "Structuur" are sections of it | none | one name for the three of them |
| The structure of a site | "structuur" is what `.schrijver` holds; "instellingen van de site" is what Schrijver holds | none | "configuratie" in the interface ("Sites niet geladen") |
| Adding and removing a site | "site" | "Site toevoegen", "Voeg site toe", "Controleer repository"; "Verwijder site" | "aansluiten", "aangesloten" |
| The first page | "startpagina" | "Naar de startpagina"; the menu item is "Sites" and the page is titled "Kies een site" | "beginpagina" |

### Links and ways out

| Concept | Noun | Verb and labels | Not |
| --- | --- | --- | --- |
| A link that only opens something | none | "bekijken" with its object, and "op GitHub" where it leaves Schrijver: "Voorstel bekijken", "Voorstel bekijken op GitHub", "Gesprek bekijken op GitHub", "Reactie bekijken op GitHub", "Rest van de reactie bekijken op GitHub", "Wijzigingen bekijken op GitHub", "Pagina's bekijken op GitHub", "Wijziging bekijken op GitHub", "Bestand bekijken op GitHub", ".schrijver bekijken op GitHub", "Site bekijken", "Voorbeeldsite bekijken"; also "Schrijver-app installeren op GitHub", "Verder naar GitHub", "Uitleg over voorstellen" | "Open", "Lees", "Bekijk ze", "Bekijk haar", "Lees het" |
| Ending, keeping, taking over | none | "Annuleer" abandons, "Sluit" closes, "Verberg" hides, "Gooi weg" discards unsaved text, "Verwerp suggestie", "Houd ..." keeps (the safe way out of a dialog), "Neem ... over" takes over | "Annuleren", "Weggooien", "Overnemen" |
| Removing and withdrawing | none | the verb follows the object: "Verwijder site", "Haal uit het team", "Trek uitnodiging in", "Ontkoppel GitHub-account", "Gooi weg" | none |

### GitHub's words

"GitHub" and "repository" are fine. "pull request", "branch", "merge", "review" and "frontmatter" do not appear in anything a colleague reads, in an error message either. "standaardbranch" appears only on the screens for platform admins (Site toevoegen, Structuur). What colleagues read on GitHub itself is not translated.

## Named exceptions

- **The editor toolbar** names commands, like the design system's own editor: "Vet", "Cursief", "Inspringen", "Uitspringen", "Tabel invoegen", "Horizontale lijn invoegen", "Mermaid-diagram invoegen", "Afbeelding invoegen".
- **The Schrijfhulp chips** are quick actions with names of their own: "Korter", "Naar B1", "Actiever", "Kopjes voorstellen", "Samenvatting". What they give back is a "suggestie".
- **The words of the changes view**: "Nieuw", "Verwijderd", "Was" and "Wordt" are visible only; a screen reader hears "Toegevoegd", "Verwijderd", "Oude tekst" and "Nieuwe tekst".

## Not renamed

These look like interface words and are identifiers or text that code reads back. Change them only as a separate, deliberate change.

- Route and action names: `insturen`, `opnieuw-insturen`, `mergen`, `aanpassing`, `opmerking`, `opslaan` (also the form actions `?/opslaan` and `?/ontkoppel`) and the rate-limit rule `gesprek`.
- Status ids (`ingestuurd`, `aanpassing-gevraagd`, `samengevoegd` and the rest), action ids and the filter values `mijn`, `alle` and `beoordelen`.
- What Schrijver writes on GitHub and reads back: the header of a reaction ("Reactie" or "Vraag om aanpassing" "van de schrijver" or "van de redactie" "via Schrijver"), the old prefix "Opmerking van de redactie via Schrijver:", the label `aanpassing gevraagd`, the marker `Schrijver-Status: ingestuurd`, the trailer `Schrijver-Auteur:` and the comment "Klaar voor beoordeling".
- The keys of `.schrijver/site.yaml` and `schema.yaml` (`concepten`, `preview`, `soort`, `bij-push`, `velden`, `nieuwe-pagina` and the rest), database columns, the file names of the decisions and `docs/een-site-aansluiten.md`.
