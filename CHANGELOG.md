# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Sign in with SSO Rijk through Keycloak (OIDC with PKCE), sealed 8-hour sliding session.
- Onboarding and settings with the commit identity choice: `anoniem`, `gekoppeld` (verified GitHub link) or `op-naam`.
- Site registry (`sites.yaml`) and per-site page schemas read from a private configuration repository, reloaded on a push webhook.
- Application shell after the NLDD application pattern: an app bar with the name linking home and an account menu (Instellingen, Help, Uitloggen), one column that lines up with it, and a sticky title bar with the way back on every page below the start page.
- Page editor on `nldd-text-editor` with an `nldd-toolbar` that overflows into a menu, "Voorbeeld" on demand instead of a second pane, page properties (the schema-driven frontmatter form) in a sheet, the save action in the sticky title bar, Schrijfhulp beside the text, image upload with required alt text and Mermaid blocks with required `accDescr`.
- Byte-identical Markdown round-trip, tested on a corpus of both pilot sites.
- Proposals as GitHub branches and pull requests through a GitHub App, listed live from GitHub, including pull requests made outside Schrijver.
- Proposal changes in colour: a block diff of the rendered page with word marks, in the views "Wijzigingen", "Hele pagina" and "Brontekst"; a change too large to compare points to GitHub instead of tying up the server.
- Sites, pages and proposals as NLDD lists; the folders of a site in a sidebar that becomes a sheet on narrow screens.
- VLAM writing assistant with fixed actions and a free prompt; suggestions only, never direct edits.
- Pseudonymous authorship through an HMAC of the SSO subject.
- "Verder bewerken" on a proposal and in the proposal lists reopens the editor on the proposal's branch, so a later session saves into the same pull request.
- A site in three tabs: "Pagina's", "Voorstellen" with "Te beoordelen" and a count of what waits for editorial members, and "Over deze site", which explains the flow, the editors, signing, public drafts and the preview to colleagues who do not know GitHub. Old `?tab=` links lead to "Voorstellen".
- Every proposal says where it stands and what comes next: a line in its row, and on the proposal page a step bar (Concept, Ingestuurd, Goedgekeurd, Samengevoegd), the next step and who approves.
- Images show in the editor's "Voorbeeld", served from the site repository through an authenticated route.
- "Verklein voor het web": an opt-in offer in the image dialog that scales a large photo to 2000 pixels and re-encodes it, with the real sizes shown first.
- A save that drops the last reference to an image asks, unticked, whether the file may go too; the server checks again that no other page uses it and deletes it in the same commit as the text. An image other pages still show stays, and the save says on which pages.
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
