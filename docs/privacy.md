# Privacy

Processing inventory, register draft, DPIA advice and open statements. How identity choices work is described in [identiteit-en-privacy.md](identiteit-en-privacy.md). Based on the BIO and AVG review of 2026-10-08; items marked "to verify" were not checked against official lists.

## Processing inventory

| Data | Purpose | Basis (candidate) | Retention today | Where it ends up |
| --- | --- | --- | --- | --- |
| `sub` | Identify the user; key of `user_prefs`, the profile, team memberships, writer records and audit rows; input of the pseudonym | Art. 6(1)(e) | Session 8 h sliding; `user_prefs`, the profile and the writer records until twelve months after the last login, for someone on no team; audit rows two years | Encrypted cookie, Postgres on ZAD, in-memory rate-limit keys; not in logs |
| `name` | Header; trailer for `gekoppeld` and `op-naam` | 6(1)(e); 6(1)(a) for the trailer | Session; permanent in git history if used in a trailer | Cookie; public GitHub history |
| `email`, `email_verified` | Inviting someone to a team, trailer for `op-naam`, shown to the user in the account menu | 6(1)(e); 6(1)(a) for publication | Session; permanent in git history for `op-naam`; the verified address also in the profile and in open invitations of a team ([team management](identiteit-en-privacy.md#team-management)) | Cookie; the data of every page the user opens (own address only); public commit message, PR body and squash commit for `op-naam` |
| Team of a site (name, role; address for its admins) | Show colleagues who decides; let admins manage the team | 6(1)(e) | While on the team; see [team management](identiteit-en-privacy.md#team-management) | "Over `<site>`": names and roles to everyone who signs in; addresses only on the site's beheer page; see [E-mail addresses shown to colleagues](#e-mail-addresses-shown-to-colleagues) |
| Organisation name | UI display | 6(1)(e) | Session | Cookie |
| Pseudonym (HMAC-SHA256, 12 hex) | Anonymous attribution, "my proposals" | 6(1)(e) | Permanent in git history and PR bodies | Public repositories; personal data (pseudonymised, art. 4(5)) |
| GitHub login and id | Link, `gekoppeld`, editorial check, reviewer pool | 6(1)(a) | `user_prefs` until unlink | Postgres; public in the `gekoppeld` trailer; sent to GitHub in permission checks |
| Identity choice, onboarding flag | Apply the choice | 6(1)(e) | As `user_prefs` | Postgres |
| Page text, frontmatter, images | The product | 6(1)(e); content owner responsible | From the first save | Public GitHub from "Concept bewaren". Photo metadata (location, time, camera, names) does not go along: the server removes it from every image on upload and again on save; only an orientation stays, so a turned photo shows upright |
| PR body, title, review comments | Review, "my proposals" | 6(1)(e) | While the PR exists | Public GitHub |
| Log fields | Operation, security | 6(1)(e), (f) for security | Unknown (ZAD) | ZAD logging: site, PR, branch, event, status, token counts, error text; no `sub` |
| VLAM payload | Writing suggestions | 6(1)(e) | Unknown (SSC-ICT) | Page text, instruction, writing guide; no identity |
| Browser drafts (`localStorage`) | Safety net | 6(1)(e) | Until the page is saved or the user logs out of Schrijver; no expiry otherwise | Unencrypted in the browser profile, including images |
| OAuth state and verifier cookies | Login and link flow | 6(1)(e) | 10 minutes | Cookie |

The pseudonym is HMAC-SHA256 over `sub` with `PSEUDONYM_SECRET`. It is pseudonymisation, not anonymisation: anyone holding the secret and a list of candidate `sub` values can re-identify it, a leaked secret de-anonymises every anonymous commit retroactively, and the pseudonym is constant across sites, so a person's anonymous contributions are linkable. Treat the secret as the most sensitive one in the system.

## Irreversible publication

Commits, pull requests and squash commits in public repositories are copied by forks, caches, archives and search engines and cannot be erased. The right to erasure (art. 17) therefore cannot be honoured for `op-naam` and `gekoppeld` commits. Consent is also weak in an employment relationship. Consequences:

- `anoniem` is the default.
- `op-naam` (full name and work e-mail address) is only allowed where the site's settings permit it ("Ondertekenen", set by its admins in Schrijver), and should be switched off for public repositories. The identity choice must state that publication is permanent.
- `gekoppeld` uses the GitHub noreply address, so the work e-mail address is not exposed.

## E-mail addresses shown to colleagues

Two displays put a work e-mail address in front of people who did not choose to share it. Neither is public: both sit behind sign-in with SSO Rijk.

- **Team addresses.** The beheer page of a site shows the addresses of its team members and open invitations to the site's admins. "Over `<site>`", which everyone who signs in can open, shows only the names and roles of the team, no addresses.
- **The user's own address.** The layout puts the signed-in user's own e-mail address in the data of every page, for the account menu in the app bar. It is part of the HTML source of every page that user opens.

Minimisation: an address is stored only when the identity provider verified it, or when an admin invites it; an invitation that is not claimed goes after 30 days.

## DPIA advice

**A short DPIA is advised** (or a documented screening signed off by the FG). Reasons:

- Data subjects are employees, a dependent position (WP248 "vulnerable data subjects").
- Innovative technology: a language model processes text that can contain personal data, operated by SSC-ICT with retention and training use not yet documented.
- Publication in public repositories is effectively irreversible, and a leaked pseudonym secret is permanently de-anonymising.
- Counter-weights: small user group, no special categories, minimal data, anonymous by default, no automated decisions, no large-scale monitoring. These make the DPIA small, not unnecessary.

Check the AP list of processing operations that require a DPIA (to verify) and use the Rijk DPIA model. If the FG concludes none is needed, record that with reasons.

## Verwerkingsregister (concept)

| Veld | Invulling |
| --- | --- |
| Naam verwerking | Schrijver: voorstellen voor wijzigingen op websites van het team indienen via SSO Rijk |
| Verwerkingsverantwoordelijke | [organisatie invullen]; contact: digigilde@rijksoverheid.nl; FG: [invullen] |
| Verwerkers / ontvangers | ZAD-platform (hosting, Postgres, logging) [verwerkersrelatie bevestigen]; SSC-ICT (VLAM taalmodel) [bevestigen]; GitHub (Microsoft) voor opslag en publicatie van voorstellen; Keycloak/SSO Rijk (inlog) |
| Doel | Medewerkers in staat stellen zonder Git-kennis wijzigingen aan de webpagina's van het team voor te stellen en te beoordelen, met schrijfhulp via een taalmodel |
| Grondslag | Art. 6 lid 1 sub e AVG (uitoefening van de publieke taak). Voor het publiceren van naam of e-mailadres in de commitgeschiedenis (keuze "gekoppeld" of "op naam"): toestemming (sub a), met de kanttekening dat afhankelijkheid van de werkgever toestemming kwetsbaar maakt; daarom is "anoniem" de standaard en moet "op naam" voor openbare repositories worden uitgezet |
| Categorieen betrokkenen | Medewerkers van de Rijksoverheid die Schrijver gebruiken; leden van het team van een site en genodigden, van wie naam en werk-e-mailadres in de database van Schrijver staan; in teksten genoemde personen |
| Categorieen persoonsgegevens | SSO-gegevens (sub, naam, e-mailadres, geverifieerd-vlag, organisatie), pseudoniem, GitHub-gebruikersnaam en -id, identiteitskeuze, door de gebruiker ingevoerde paginatekst en afbeeldingen, opmerkingen bij voorstellen, technische logregels, namen en rollen van het team van een site (zichtbaar voor iedereen die inlogt, op "Over `<site>`"), werk-e-mailadressen van teamleden en genodigden (alleen voor de beheerders van de site), wie in een voorstel schreef (het SSO-kenmerk per voorstel, voor het vier-ogenprincipe). Het eigen e-mailadres van de gebruiker zit in de paginagegevens van elke pagina. Geen bijzondere persoonsgegevens bedoeld |
| Bewaartermijnen | Sessie: 8 uur (verlengend) [maximum invoeren]; voorkeuren, profiel en wie in een voorstel schreef: tot twaalf maanden na de laatste keer inloggen, voor wie in geen team zit; uitnodigingen: 30 dagen; auditregels: twee jaar; logs: [ZAD-termijn invullen]; commitgeschiedenis en pull requests op GitHub: onbepaald (kan niet worden gewist); VLAM: [SSC-ICT-termijn invullen]; conceptopslag in de browser: tot verwijdering door de gebruiker [termijn invoeren] |
| Doorgifte buiten de EER | GitHub is een Amerikaans bedrijf; grondslag en afspraken [bevestigen]. VLAM en ZAD: locatie [bevestigen, verwacht NL] |
| Beveiligingsmaatregelen | SSO met PKCE; versleutelde, httpOnly sessiecookie; pseudonimisering met HMAC-sleutel; geheimen alleen in het platform; CSP en beveiligingsheaders; snelheidsbeperking; GitHub-koppeling alleen na bewijs van eigendom; geen persoonsgegevens naar VLAM behalve wat in de paginatekst staat; openbare-concept-waarschuwing in de editor. Zie [beveiliging.md](beveiliging.md) |
| Risico's / DPIA | Onomkeerbare openbaarheid van concepten en identiteitsgegevens; heridentificatie van pseudoniemen bij lekken van de sleutel; namen van teamleden zichtbaar voor iedereen die inlogt; DPIA (kort) aanbevolen, besluit FG: [invullen] |
| Datum / versie | [invullen] |

## Statements to obtain

From ZAD:

- [ ] Logs collected for our component (stdout, ingress access logs with IP and URL): retention, access list, export.
- [ ] Backups of the Postgres service: frequency, retention, encryption, location, restore test, and whether `user_prefs` is included.
- [ ] Processor status and agreement, sub-processors, hosting location.

From SSC-ICT: see [ai-en-vlam.md](ai-en-vlam.md). From the organisation: the data processing and transfer basis for GitHub, the FG's DPIA decision and the name of the controller. The remaining ZAD platform questions are in [beveiliging.md](beveiliging.md).

## Rights and transparency

- Information duty (art. 13): a Dutch privacy notice listing the recipients (GitHub public, SSC-ICT VLAM, ZAD) is still to be written and linked from onboarding.
- Access, rectification, erasure: a `user_prefs` row can be deleted by an admin, but no function or procedure exists yet; git history cannot be erased.
