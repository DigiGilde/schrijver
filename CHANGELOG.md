# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Sign in with SSO Rijk through Keycloak (OIDC with PKCE), sealed 8-hour sliding session.
- Onboarding and settings with the commit identity choice: `anoniem`, `gekoppeld` (verified GitHub link) or `op-naam`.
- Site registry (`sites.yaml`) and per-site page schemas read from a private configuration repository, reloaded on a push webhook.
- Application shell after the NLDD application pattern: an app bar in the sticky page header with a wordmark that links home and a plain menu (Sites, Help, Instellingen, Uitloggen), one column that lines up with it, and a sticky title bar with the way back on every page below the start page. The local preview says in a bar above it that nothing reaches GitHub.
- Start page with a card per site: its description and public address, how many proposals are open for you and, for editorial members, how many wait for review.
- Page editor on `nldd-text-editor` with an `nldd-toolbar` that overflows into a menu, "Voorbeeld" on demand instead of a second pane, page properties (the schema-driven frontmatter form) in a sheet, the save action in the sticky title bar, Schrijfhulp beside the text, image upload with required alt text and Mermaid blocks with required `accDescr`.
- The editing screen: "Titel wijzigen" at the end of the title line where the title is a property, a one-time note on the save button (on a wide screen) that a draft becomes public, a toolbar that sticks above the text, Dutch names for properties in forms and errors, and the number of empty required properties on "Eigenschappen".
- Formatting buttons for a numbered list, indent and outdent, a code block, a table and a horizontal rule.
- Mermaid diagrams in "Voorbeeld" look as on the MOZa site, with the `nldd:` icons and per-site colours (`mermaid.tokens`).
- Byte-identical Markdown round-trip, tested on a corpus of both pilot sites.
- Proposals as GitHub branches and pull requests through a GitHub App, listed live from GitHub, including pull requests made outside Schrijver.
- Proposal changes in colour: a block diff of the rendered page with word marks, in the views "Wijzigingen", "Hele pagina" and "Brontekst"; a change too large to compare points to GitHub instead of tying up the server.
- Sites, pages and proposals as NLDD lists; the folders of a site in a sidebar that becomes a sheet on narrow screens.
- VLAM writing assistant with fixed actions and a free prompt; suggestions only, never direct edits.
- Schrijfhulp in a panel built from NLDD parts; in the local preview without VLAM it gives answers marked as test answers.
- "Nieuwe pagina" at reading width with the file name as you type, and "Maak een opzet", which turns a description into a title and an outline; the editor opens with the outline as an unsaved draft and says it comes from Schrijfhulp.
- Pseudonymous authorship through an HMAC of the SSO subject.
- "Verder bewerken" on a proposal and in the proposal lists reopens the editor on the proposal's branch, so a later session saves into the same pull request.
- A site in three tabs: "Pagina's", "Voorstellen" with "Te beoordelen" and a count of what waits for editorial members, and "Over deze site", which explains the flow, the editors, signing, public drafts and the preview to colleagues who do not know GitHub. Old `?tab=` links lead to "Voorstellen".
- Every proposal says where it stands and what comes next: a line in its row, and on the proposal page a step bar (Concept, Ingestuurd, Goedgekeurd, Samengevoegd), the next step and who approves.
- Images show in the editor's "Voorbeeld", served from the site repository through an authenticated route.
- "Verklein voor het web": an opt-in offer in the image dialog that scales a large photo to 2000 pixels and re-encodes it, with the real sizes shown first.
- A save that drops the last reference to an image asks, unticked, whether the file may go too, and deletes it in the same commit as the text. The server checks again: the page showed the image before this save, the image is not in an excluded part of the site, and no text file under the content folder uses it by path or by file name, on the proposal branch or on the default branch. An image other pages still show stays, and the save says on which pages ("mogelijk gebruikt" when only its file name appears there). Merging in Schrijver refuses a proposal that removes an image a page still shows, or that adds a reference to an image that will not exist after the merge.
- Photo metadata (location, time, camera, names) always goes out of an image, on upload and again on save, without re-encoding; a turned photo keeps only its orientation. An SVG keeps only what it draws: metadata, hidden text and `data-*` attributes go, so an Illustrator "Save As" file is accepted.
- Fake forge for local development and end-to-end tests.
- Project documentation, in-app help page ("Zo werkt Schrijver"), `publiccode.yml` and the EUPL-1.2 licence.

### Documentation

- Decision 0006 on the application shell, the preview on demand and the coloured diff.
- Design document tracked as `docs/ontwerp.md`; accessibility, AI and VLAM, privacy and security documentation from the compliance reviews of 2026-10-08, with an index in `docs/review/`.
- Code of Conduct (Contributor Covenant 2.1), NOTICE, review rule and branch naming in CONTRIBUTING, Status section in the README.
- Review outcomes: WCAG 2.2 AA (15 issues, fixed in code), NeRDS (8 gaps), BIO (20 gaps of 25 controls) and security (2 high, 9 medium findings) are tracked in `docs/review/README.md`.
- Help page: AI notice for the writing assistant and a link to the accessibility page.

### Not in version one

- `concepten: privé` (drafts in a private repository) is refused.
- `review.model: direct` (merge at once on "Insturen") is refused.
- Menus and navigation, moving, renaming and deleting pages, a Forgejo adapter.
