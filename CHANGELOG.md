# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Sign in with SSO Rijk through Keycloak (OIDC with PKCE), sealed 8-hour sliding session.
- Onboarding and settings with the commit identity choice: `anoniem`, `gekoppeld` (verified GitHub link) or `op-naam`.
- Site registry (`sites.yaml`) and per-site page schemas read from a private configuration repository, reloaded on a push webhook.
- Page editor on `nldd-text-editor` with toolbar, preview pane, schema-driven frontmatter form, image upload with required alt text and Mermaid blocks with required `accDescr`.
- Byte-identical Markdown round-trip, tested on a corpus of both pilot sites.
- Proposals as GitHub branches and pull requests through a GitHub App, listed live from GitHub, including pull requests made outside Schrijver.
- VLAM writing assistant with fixed actions and a free prompt; suggestions only, never direct edits.
- Pseudonymous authorship through an HMAC of the SSO subject.
- Fake forge for local development and end-to-end tests.
- Project documentation, in-app help page ("Zo werkt Schrijver"), `publiccode.yml` and the EUPL-1.2 licence.

### Migration

- A "Gekoppeld" trailer now carries the GitHub login instead of the SSO name. Ownership is matched on the GitHub user id, the pseudonym or the verified e-mail address, so proposals made before the change stay the author's own.
- Sessions now carry their sign-in time and sealed cookies use a key per purpose: everyone signs in again once after the upgrade.

### Documentation

- Design document tracked as `docs/ontwerp.md`; accessibility, AI and VLAM, privacy and security documentation from the compliance reviews of 2026-10-08, with an index in `docs/review/`.
- Code of Conduct (Contributor Covenant 2.1), NOTICE, review rule and branch naming in CONTRIBUTING, Status section in the README.
- Review outcomes: WCAG 2.2 AA (15 issues, 4 being fixed in code), NeRDS (8 gaps), BIO (20 gaps of 25 controls) and security (2 high, 9 medium findings) are tracked in `docs/review/README.md`.
- Help page: AI notice for the writing assistant and a link to the accessibility page.

### Not in version one

- `concepten: privé` (drafts in a private repository) is refused.
- Menus and navigation, moving, renaming and deleting pages, a Forgejo adapter.
