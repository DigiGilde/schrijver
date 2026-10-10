# Decision records

- [0001: NLDD text editor instead of a block editor](0001-editor.md): the writing surface is `nldd-text-editor`, with a named fallback.
- [0002: The forge is the only state](0002-forge-as-state.md): proposals are branches and pull requests, Schrijver keeps no list of its own.
- [0003: What Schrijver takes from the RegelRecht editor](0003-regelrecht-editor.md): the patterns adopted and the ones left out.
- [0004: Linking a GitHub account requires proof of ownership](0004-github-link-verified.md): the link is stored only after GitHub user authorization.
- [0005: No "Goedkeuren" from Schrijver in version one](0005-no-approve-from-schrijver.md): the App cannot approve its own pull request; editors comment and merge, and approve on GitHub.
- [0006: NLDD application shell, preview on demand, coloured diff](0006-application-shell-and-diff.md): the app follows the NLDD application composition, the editor has one writing surface, a proposal shows its changes in colour.
- [0007: Three steps, one decision in Schrijver, four eyes](0007-three-steps-and-four-eyes.md): the redactie merges or asks for an adjustment, the conversation comes into Schrijver, and nobody merges their own proposal.
- [0008: People in Schrijver, structure in the site](0008-people-in-schrijver-structure-in-the-site.md): teams and site settings live in Postgres keyed by the SSO sub and are managed under Instellingen; a site's structure moves into its own repository.
- [0009: Sites only the team can see](0009-sites-only-the-team-can-see.md): a site setting decides who sees a site and a private repository is seen by its team only; a third role, Bijdrager, writes without deciding; one server guard answers 404 under every site the user may not see.
