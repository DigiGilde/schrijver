# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Sign in with SSO Rijk through Keycloak (OIDC with PKCE), sealed 8-hour sliding session.
- Onboarding and settings with the commit identity choice: `anoniem`, `gekoppeld` (verified GitHub link) or `op-naam`.
- Sites in Schrijver's database: a platform admin adds one with "Site toevoegen" (repository, settings, first beheerder) and removes one with "Site verwijderen". A site is bound to its repository by GitHub's numeric id and follows a rename or a new default branch.
- Sites only their team can see: a site setting for who sees the site, everyone who signs in or only the team. A private repository is always the team's only, also when it turns private later, and there a linked GitHub account with read access counts too. One guard on the server answers "niet gevonden" under every site a person may not see. A third team role, bijdrager, makes proposals without deciding on them.
- Each site's structure (content folder, page schema, preview, Mermaid colours, writing guide) in `.schrijver/` in its own repository, read from the default branch and reloaded on a push to it. A site whose files are wrong, or whose repository lost the App, shows only to its admins with what is wrong; it keeps its last valid structure while Schrijver runs, and comes back as soon as GitHub reports the fix.
- Teams in Schrijver, under Instellingen: a site's beheerders add colleagues by e-mail address (an invitation for 30 days, claimed at the first login with that verified address), change roles (beheerder, redactie) and remove them, and a site always keeps a beheerder. People are known by their SSO subject. Platform admins (`SCHRIJVER_BEHEERDERS`) manage every site; Instellingen shows everyone their own subject.
- Site settings in Schrijver: name, description, address, merging in Schrijver, four eyes and the allowed ways to sign.
- Four eyes, on by default: Schrijver records who writes in a proposal, and an editor who wrote in it does not merge it in Schrijver; the site's admins may. When Schrijver cannot tell who wrote, it refuses. The record goes when the proposal is merged or closed, and after six months at the latest.
- An audit log of site, team, invitation and settings changes, without e-mail addresses, kept two years; the profile of someone on no team goes twelve months after their last login. Refused proposal and beheer actions are logged with the actor's pseudonym, and the beheer forms and proposal images have rate limits.
- Application shell after the NLDD application pattern: an app bar in the sticky page header with the `file-text-pencil` icon and the wordmark linking home, and a plain menu (Sites, "Over <site>" on a site, Help, Instellingen, Uitloggen), one column that lines up with it, and a sticky title bar with the way back on every page below the start page. The local preview says in a bar above it that nothing reaches GitHub.
- Start page with a card per site: its description and public address, how many proposals are open for you and, for editorial members, how many wait for review.
- Page editor on `nldd-text-editor` with an `nldd-toolbar` that overflows into a menu, "Voorbeeld" on demand instead of a second pane, page properties (the schema-driven frontmatter form) in a sheet, the save action in the sticky title bar, Schrijfhulp beside the text, image upload with required alt text and Mermaid blocks with required `accDescr`.
- The editing screen: "Titel wijzigen" at the end of the title line where the title is a property, a one-time note on the save button (on a wide screen) that a draft becomes public, a toolbar that sticks above the text, Dutch names for properties in forms and errors, and the number of empty required properties on "Eigenschappen".
- Formatting buttons for a numbered list, indent and outdent, a code block, a table and a horizontal rule.
- Mermaid diagrams in "Voorbeeld" look as on the MOZa site, with the `nldd:` icons and per-site colours (`mermaid.tokens`).
- Byte-identical Markdown round-trip, tested on a corpus of both pilot sites.
- Proposals as GitHub branches and pull requests through a GitHub App, listed live from GitHub, including pull requests made outside Schrijver.
- Proposal changes in colour: a block diff of the rendered page with word marks and the labels "Nieuw", "Verwijderd", "Was" and "Wordt", unchanged context dimmed, in the views "Wijzigingen", "Hele pagina" and "Markdown"; compared with the version the proposal started from, so a later change on the site does not show as undone; images of both versions show; a change too large to compare points to GitHub instead of tying up the server.
- Sites, pages and proposals as NLDD lists; the folders of a site in a sidebar that becomes a sheet on narrow screens.
- VLAM writing assistant with fixed actions and a free prompt; suggestions only, never direct edits.
- Schrijfhulp in a panel built from NLDD parts that sticks beside the text while it fits. A suggestion for a selection shows in the panel; one for the whole text shows as a comparison in the text column, with "Overnemen" and "Verwerpen" under it. In the local preview without VLAM it gives answers marked as test answers.
- "Nieuwe pagina" at reading width with the file name as you type, and "Maak een opzet", which turns a description into a title and an outline; the editor opens with the outline as an unsaved draft and says it comes from Schrijfhulp.
- Pseudonymous authorship through an HMAC of the SSO subject.
- "Verder bewerken" on a proposal and in the proposal lists reopens the editor on the proposal's branch, so a later session saves into the same pull request.
- A site in two tabs, "Pagina's" and "Voorstellen" with "Te beoordelen" and a count of what waits for editorial members, without their own proposals where four eyes keep them from deciding. "Over <site>" in the menu is a short page of facts: the team by name, signing, public drafts, the preview and where the files are. Help explains how a change reaches the site (`/help#voorstellen`). Old `?tab=` links lead to "Voorstellen".
- Every proposal says where it stands and what comes next: a line in its row, and on the proposal page three steps (Concept, Ingestuurd, Samengevoegd) and one block that says what the reader can do now. The redactie merges or asks for an adjustment (the label `aanpassing gevraagd`), the writer sends it in again, and a site that wants an approval on GitHub first says so. A writer who may merge their own proposal gets that choice, a change request made on GitHub is answered the same way and asks the reviewers again, a proposal GitHub cannot merge says so in plain words, and a reader without a GitHub account is not given GitHub as their next step. A proposal with more commits than Schrijver can check is merged on GitHub.
- The conversation of a pull request on the proposal page, comments and reviews from GitHub included; the writer and the redactie react from Schrijver. On GitHub a reaction stands quoted under Schrijver's own line, and both say how the person signed.
- Images show in the editor's "Voorbeeld", served from the site repository through an authenticated route; a proposal's images are read at its head, only from a branch of the site's own repository.
- "Verklein voor het web": an opt-in offer in the image dialog that scales a large photo to 2000 pixels and re-encodes it, with the real sizes shown first.
- A save that drops the last reference to an image asks, unticked, whether the file may go too, and deletes it in the same commit as the text. The server checks again: the page showed the image before this save, the image is not in an excluded part of the site, and no text file under the content folder uses it by path or by file name, on the proposal branch or on the default branch. An image other pages still show stays, and the save says on which pages ("mogelijk gebruikt" when only its file name appears there). Merging in Schrijver refuses a proposal that removes an image a page still shows, or that adds a reference to an image that will not exist after the merge.
- Photo metadata (location, time, camera, names) always goes out of an image, on upload and again on save, without re-encoding; a turned photo keeps only its orientation. An SVG keeps only what it draws: metadata, hidden text and `data-*` attributes go, so an Illustrator "Save As" file is accepted.
- Fake forge for local development and end-to-end tests.
- Project documentation, in-app help page ("Zo werkt Schrijver"), `publiccode.yml` and the EUPL-1.2 licence.

### Documentation

- Decision 0006 on the application shell, the preview on demand and the coloured diff; 0007 on three steps, one decision in Schrijver and four eyes; 0008 on people in Schrijver and the structure in the site's repository.
- `docs/configuratie.md` and `docs/een-site-aansluiten.md` describe `.schrijver/` and adding a site; `docs/identiteit-en-privacy.md` and `docs/privacy.md` say what the team tables hold and for how long.
- Design document tracked as `docs/ontwerp.md`; accessibility, AI and VLAM, privacy and security documentation from the compliance reviews of 2026-10-08, with an index in `docs/review/`.
- Code of Conduct (Contributor Covenant 2.1), NOTICE, review rule and branch naming in CONTRIBUTING, Status section in the README.
- Review outcomes: WCAG 2.2 AA (15 issues, fixed in code), NeRDS (8 gaps), BIO (20 gaps of 25 controls) and security (2 high, 9 medium findings) are tracked in `docs/review/README.md`.
- Help page: AI notice for the writing assistant and a link to the accessibility page.

### Not in version one

- `concepten: privé` (drafts in a private repository) is refused.
- Merging at once on "Insturen".
- Menus and navigation, moving, renaming and deleting pages, a Forgejo adapter.
