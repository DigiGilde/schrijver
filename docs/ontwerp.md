> This is the v1 design of Schrijver as decided on 2026-10-07/08. Later decisions are recorded in [decisions](decisions/README.md).

# Schrijver: design

Date: 2026-10-07. Status: draft for review.

Schrijver is a web application through which colleagues edit and propose Markdown content for the team's static sites without using Git, GitHub or a personal token. It runs on ZAD behind SSO Rijk, commits through a GitHub App, uses VLAM as a writing assistant and is built with the NLDD Designsysteem.

## 1. Problem and intent

- Useful knowledge stays in Mattermost because opening a pull request is a barrier for most colleagues.
- Site-as-code in GitHub (later Forgejo) stays. Schrijver is a layer on top, not a replacement.
- Earlier attempt: Sveltica on the MOZa site. Right idea, too buggy, and every user needed a GitHub token.

Success looks like: a colleague with only SSO Rijk opens Schrijver, edits or adds a page, sends it in, and the editorial team merges it, all without anyone touching GitHub. A colleague who prefers GitHub keeps working there and both views agree.

## 2. Principles

1. **The forge is the only state.** A proposal is a branch plus a pull request. Schrijver keeps no list of proposals; it reads them from GitHub. A PR opened or merged on GitHub appears in or disappears from Schrijver without any sync.
2. **Markdown in, Markdown out.** Everything Schrijver does not understand (frontmatter fields outside the schema, Hugo shortcodes, raw HTML, `accTitle`/`accDescr` lines in Mermaid) is written back unchanged.
3. **GitHub remains the last judge.** Branch protection, required reviews and checks apply as they are. Schrijver shows a refusal verbatim instead of working around it.
4. **No personal tokens.** A GitHub App installed on each site repository does all writes.
5. **Privacy by default.** Commits are anonymous unless the colleague chooses otherwise. Page text goes to VLAM, the author's identity never does.

## 3. Scope of version one

In scope:

- Sign in with SSO Rijk via the project's Keycloak on ZAD.
- Onboarding with the commit-identity choice (section 7).
- Two sites: Digi Handboek (Astro) and MOZa site (Hugo), configured, not hard-coded.
- Edit an existing page or create a new one within the site's content folders.
- Frontmatter as a form driven by a per-site schema; body in the editor.
- Images: insert via button, drag or paste; stored in the branch; alt text required.
- Mermaid: fenced block, rendered in the "Voorbeeld" view, text description required.
- Save creates or updates a branch and draft PR. Send in marks it ready for review and requests reviewers.
- Proposal list per site, read live from GitHub, including PRs made outside Schrijver.
- Review in Schrijver: readable diff, preview link, the conversation of the pull request, reactions of the writer and the redactie, a request for an adjustment, and merge (squash) when the site allows it, the user is editorial and did not write the proposal (decision 0007).
- VLAM assistant in a side panel with fixed actions and a free prompt; suggestions as annotations, never direct edits.
- Project documentation (section 12).

Out of scope for version one, named so nobody assumes them:

- Menus and navigation (`hugo.yaml` menus, `navigation.ts`). A new page lands in the right folder; the PR description tells the editorial team to update the menu.
- Moving, renaming or deleting pages.
- Forgejo adapter (the interface is designed for it, section 6).
- Live previewer that runs the site's own build. The PR preview of the site is the real preview.
- Deriving the schema from Astro's `content.config.ts`.
- `.html` content pages and page bundles of MOZa (`documenten/`). Shown read-only.
- Block drag-and-drop editing (Notion style). Revisit after testing with colleagues.

## 4. Site registry and schema

The list of sites is a table in Schrijver's database, filled by platform admins with "Site toevoegen" under Instellingen. Each site is bound to its repository by GitHub's numeric id, because names change; Schrijver follows a renamed or moved repository and a new default branch. The structure of a site lives in the site's own repository, in `.schrijver/`, because it changes with the site's code and is changed by its developers through a pull request. Who works on a site and how (its name, its team, merging, four eyes, ways to sign) is set in Schrijver (decision 0008).

Schrijver reads `.schrijver/` from the default branch of every site at start-up, and again on a push to that branch. A site whose files are missing or not valid cannot be edited and is shown to its admins with the problem; a later change that is not valid keeps the last valid structure and shows the problem to the admins. The fields are described in `docs/configuratie.md`.

### 4.1 `.schrijver/site.yaml`

```yaml
# Digi Handboek (DigiGilde/handboek)
content:
  pad: docs
  patroon: "**/*.md"
  afbeeldingen:
    pad: docs/afbeeldingen/{paginaslug}
    verwijzing: relatief
preview:
  soort: bij-push               # Plak preview runs on every push to the PR
  url: "https://plak.rijks.app/digigilde/handboek/_preview/pr-{nummer}/"

# MOZa site (MinBZK/moza-site)
content:
  pad: content
  patroon: "**/*.md"
  uitsluiten: ["documenten/**"]
  afbeeldingen:
    pad: "{paginamap}/images"   # page bundle convention
    verwijzing: relatief
preview:
  soort: bij-label
  label: preview
  url: "https://web-pr-{nummer}-mzs-3ik.rig.prd1.gn2.quattro.rijksapps.nl"
```

The review model is `goedkeuring`: "Insturen" asks for review, and merging happens in Schrijver or on GitHub, as the site's setting "Samenvoegen in Schrijver" says. Merging at once on "Insturen" (`direct`) is not offered in version one.

**Who may do what.** Anyone signed in may propose on any site in Schrijver. Editorial (`redactie`) is a member of the site's team in Schrijver, as beheerder or redactie, or someone who linked a GitHub account in onboarding and has write permission on the repository (checked with `GET /repos/{owner}/{repo}/collaborators/{username}/permission`, which needs only Metadata: read). Editorial may react, ask for an adjustment and merge from Schrijver; the writer of a proposal may react and send it in again. With "Vier ogen" (on by default) nobody merges a proposal they wrote, and where Schrijver cannot tell who wrote it, it assumes the reader did; a site admin may still merge. Approving stays on GitHub (decisions 0005 and 0007).

### 4.2 Schema per site (`.schrijver/schema.yaml`)

```yaml
# Digi Handboek
titel: uit-h1                      # no title field; H1 is the title
velden:
  description: { type: tekst, label: Samenvatting, hulp: "Een of twee zinnen." }
  hero: { type: ja-nee, verborgen: true }
  related: { type: paginaverwijzing, meervoud: true, max: 5, label: Lees ook }
nieuwe-pagina:
  mappen: [kennis, werkwijze, onboarding, over]
  bestandsnaam: uit-titel
  sjabloon: |
    # {titel}

# MOZa site
titel: veld:title
velden:
  title: { type: tekst, verplicht: true }
  description: { type: tekst, verplicht: true }
  weight: { type: getal, verborgen: true }
  date: { type: datum, alleen-in: ["weekly/**"] }
nieuwe-pagina:
  soorten:
    - naam: Weekly
      map: "weekly/{jaar}"
      bestandsnaam: "{datum}"
      velden: [title, date]
    - naam: Handboekpagina
      mappen: ["handboek/*"]
    - naam: Onderwerp
      mappen: [onderwerpen]
```

Field types in version one: `tekst`, `getal`, `ja-nee`, `datum`, `paginaverwijzing`. `verborgen` fields are preserved but not shown. Fields present in a file but absent from the schema are preserved untouched, in their original order and quoting where the YAML library allows it.

Schemas are hand-written in version one. Validation runs in the form before Save; a file that fails schema validation when opened (for example an existing page with a missing required field) still opens, with the missing field highlighted.

### 4.3 Writing guide (`.schrijver/schrijfwijzer.md`)

Per-site style rules used as the assistant's system prompt and shown in the editor's help, optional. MOZa's rules exist already (Dutch, B1, active voice, sentences under 20 words, "je", service names as one word) and are copied in, not referenced, so the guide is complete on its own.

## 5. Content model and round-trip

A page is three parts: **frontmatter** (form), **body** (editor), **place** (folder and file name). The parser:

1. Splits frontmatter (`---` YAML; TOML `+++` not supported in version one, opened read-only).
2. Keeps the body as the exact string the editor receives. The editor is text-based (section 8), so there is no tree conversion. The body written back is the editor's text.
3. Re-serializes frontmatter with the same key order, adding schema fields the form filled.

Round-trip guarantee tested in CI: for every `.md` file in both sites, open and save without edits produces a byte-identical file, except for frontmatter normalisation that the test enumerates explicitly (for instance a trailing newline). Any new normalisation needs a test change, so it is a conscious decision.

Known content that must survive untouched, from the inventory of 2026-10-07:

- MOZa: `{{< card-grid >}}`, `{{< toegankelijkheidslabel >}}`, `{{< diagram-notificatiedienst >}}`, paired `{{< quote >}}`; 12 Mermaid blocks with `accTitle:` and `accDescr:` lines; `cascade` and `layout: hero` frontmatter; `image:` paths relative to `assets/`.
- Digi Handboek: blockquote callouts, `mailto:` links, fenced `shell`, `ini`, `url` and `xml` blocks.

## 6. Forge layer

One interface, `Forge`, with a GitHub implementation in version one and a Forgejo implementation later. Eight operations:

| Operation | GitHub (REST unless noted) | Permission |
| --- | --- | --- |
| `readTree(ref, path, pattern)` and `readFile(ref, path)` | Git trees, contents | Contents: read |
| `createBranch(from, name)` | `POST /git/refs` | Contents: write |
| `commit(branch, files[], message)` | Git data: blobs, tree, commit, update ref (one commit for text plus images) | Contents: write |
| `openDraftPr(branch, title, body)` | `POST /pulls` with `draft: true` | Pull requests: write |
| `markReady(pr)` | GraphQL `markPullRequestReadyForReview` | Pull requests: write (to verify) |
| `setLabel(pr, label)` and `requestReviewers(pr, logins[])` | issues labels, requested reviewers | Issues: write, Pull requests: write |
| `listPrs(filter)` with checks and review state | `GET /pulls`, check runs, reviews | Pull requests: read, Checks: read |
| `merge(pr, squash)` | `PUT /pulls/{n}/merge` | Contents: write |

Plus `collaboratorPermission(login)` for the editorial check (Metadata: read) and a webhook for `pull_request` and `push` events so open editors learn about outside changes.

App permissions to request: Contents (write), Pull requests (write), Issues (write, for labels only), Checks (read), Metadata (read). The permission for `markPullRequestReadyForReview` is not stated in the GraphQL docs; verify during implementation, fall back to creating a non-draft PR at Send-in time if needed.

Branch naming: `schrijver/<site-id>/<page-slug>-<4 chars>`. Schrijver lists proposals by PR, not by branch prefix, so PRs opened by hand (any branch name) show up too. The prefix exists only to avoid collisions and to make Schrijver's branches recognisable on GitHub.

Rate limits: installation tokens have 5000 requests per hour per installation (to verify against the docs during implementation). Schrijver caches tree listings per ref for a minute and invalidates on webhook.

## 7. Flow and identity

### 7.1 From edit to merge

1. **Open** a page from the default branch, or choose "Nieuwe pagina" and a page type from the schema. Nothing is written yet.
2. **First save** ("Concept bewaren") creates the branch and a draft PR titled with the page title. Each later save is a commit. See 7.4 for what this means on a public repository.
3. **Return later**: Schrijver lists the user's open proposals by matching the identity trailer (section 7.2) in the PR body, plus all open proposals of the site for editorial.
4. **Send in** marks the PR ready, sets the `preview` label where the site uses one, fills the description (what changed, which page, "menu bijwerken" when it is a new page), requests reviewers among the linked GitHub accounts with write permission on the repository (never the writer), and notifies the editorial list by e-mail if ZAD offers mail (otherwise this step is a visible to-do in the proposal list).
5. **Review** in Schrijver or on GitHub. One block at the top of the proposal page says what is expected of the reader and offers the actions for it: three steps (Concept, Ingestuurd, Samengevoegd), and for the redactie one decision, "Samenvoegen" or "Vraag om aanpassing". Schrijver shows the changes in colour on the rendered page: a block diff with word marks and a word on every change (Nieuw, Verwijderd, Was, Wordt), in the views "Wijzigingen" (the changes with one block of dimmed context), "Hele pagina" and "Markdown" (decision 0006). Below it the conversation: every comment and review of the pull request, from Schrijver and from GitHub. A request for an adjustment is a comment plus the label `aanpassing gevraagd`; the writer adjusts and chooses "Opnieuw insturen" (decision 0007).
6. **Merge** from Schrijver as squash, only for editorial, only when the site setting "Samenvoegen in Schrijver" is on, and with "Vier ogen" on not by a writer of the proposal unless a site admin. Where GitHub still waits for a required approval, Schrijver says so and links to GitHub instead. The squash message carries the identity trailers of every contributing commit.

Required review on MOZa (one approval, last-push approval) applies unchanged; Schrijver reads it as the pull request's review decision. Because the App is the PR author, any member of the redactie can be that reviewer on GitHub, including the person who wrote the text in Schrijver. Schrijver's four eyes keep that writer from merging in Schrijver; branch protection on GitHub remains the hard guarantee.

### 7.2 Commit identity

GitHub shows an App commit as Verified only when it carries no custom author or committer. Therefore every commit is authored by the App, and the person is expressed in commit-message trailers:

| Choice | Trailer | Visible on GitHub |
| --- | --- | --- |
| Anoniem (default) | `Schrijver-Auteur: <pseudoniem>` | Nothing personal. Traceable by the Schrijver maintainers (below). |
| Gekoppeld aan GitHub | `Co-authored-by: <GitHub name> <ID+login@users.noreply.github.com>` | Commit linked to the GitHub profile, work e-mail not exposed. |
| Op naam | `Co-authored-by: <SSO name> <SSO e-mail>` | Full name and address. |

The pseudonym is `HMAC-SHA256(secret, sub)` truncated to 12 hex characters. Outside Schrijver, tracing a pseudonym to a person means computing it for a candidate. Inside, Schrijver's database links each open proposal, also an anonymous one, to the SSO account of each writer: the writer record of four eyes (decision 0007). That link goes when the proposal is merged or closed, and at the latest 183 days after the writer's first commit in it. The secret is a ZAD user-env secret; rotating it changes all pseudonyms, which is acceptable and documented.

The choice is made in onboarding on first sign-in, changeable in settings, limited by the site setting "Ondertekenen". "Gekoppeld" asks for the GitHub login and resolves the user id via the API; it does not ask for a token.

The PR body carries the same trailer for the proposal as a whole, so Schrijver lists "my proposals" from GitHub, not from the writer record.

### 7.3 Conflicts

Before each save Schrijver compares the file's blob SHA on the branch with the one it loaded. If the default branch changed the same file since the branch was created, Schrijver shows both versions and lets the colleague choose which to continue from. No automatic text merge. If GitHub reports the PR as not mergeable at Send-in, Schrijver says so and offers "neem de nieuwste versie over en pas je wijziging opnieuw toe" as a manual step with both texts visible.

Version one limitation: after the first save, a change to the same file on the default branch is not detected on later saves; it surfaces at Send-in as "not mergeable" (above) and at merge time on GitHub.

### 7.4 Visibility of drafts

Both pilot repositories are public, so a draft PR is readable by anyone on the internet from the first save, and a per-push preview puts the half-finished text online as a web page. Anonymity hides who wrote it, not what it says. Knowledge coming out of Mattermost is often not yet weighed for publication.

Version one:

- The first save button is "Concept bewaren", and on a site with a public repository it carries the sentence "Dit concept komt als voorstel op GitHub en is openbaar leesbaar, ook voordat je het instuurt." The editor shows a persistent dimmed "Openbaar concept" line on such sites.
- Site preview builds only after Send-in: on MOZa the `preview` label is set at Send-in instead of first save; for Digi Handboek, propose a change to `preview.yml` so it skips draft PRs (`if: github.event.pull_request.draft == false`). Schrijver's own "Voorbeeld" covers the draft phase.
- `.schrijver/site.yaml` has `concepten: openbaar | privé`. Version one supports `openbaar` only and refuses a site configured as `privé`, so the option is visible but honest.

Planned next step (`concepten: privé`):

- Drafts are committed to a private repository `schrijver-concepten` (one per forge, a folder per site, a branch per draft). On Send-in, Schrijver pushes the branch to the site repository and opens the PR there. The forge stays the only state; the draft merely lives in another repository until it is ready. The `Forge` interface is unchanged because it already works per repository.
- Trade-offs accepted: colleagues on GitHub see a draft only once it is sent in, which is the point; the real site preview exists only after Send-in; the draft repository needs the same App installation and a retention rule (drafts untouched for 90 days are listed for cleanup, never deleted automatically).

## 8. Editor and assistant

### 8.1 Editor

The writing surface is `nldd-text-editor` from `@nldd/design-system`: a hybrid Markdown editor on CodeMirror 6 where the document stays Markdown text and formatting is shown inline with dimmed syntax markers. Chosen over a WYSIWYG block editor because it is the house component, keeps the data portable, and brings the annotation overlay the assistant needs. The decision and its fallback are recorded in `docs/decisions/0001-editor.md`.

Composition:

- **Page layout** after the NLDD application composition (decision 0006): the page title in the content, a sticky title bar with the way back to the site and the save action, one writing surface in the full column.
- **Toolbar** built by Schrijver from the editor's command API (bold, italic, headings, lists, link, quote, code, image, Mermaid, table snippet) on `nldd-toolbar`, which moves what does not fit into its overflow menu. The editor is headless; the toolbar reads `nldd-text-editor-state` for toggle state. At the end of the toolbar: the switch between "Schrijven" and "Voorbeeld", "Eigenschappen" and "Schrijfhulp".
- **Voorbeeld** on demand, in place of the editor: the hybrid editor already shows the formatting, so a second rendering beside it was double. The view renders client-side from the Markdown with the same stack the sites use where possible: `nldd-rich-text` for typography, `nldd-code-viewer` for fences, images, Mermaid rendered in the browser. The preview is "close to the site", not pixel-identical, and says so once.
- **Eigenschappen**: the frontmatter form from the schema, using `nldd-form-field` and friends, in a right-hand sheet that keeps the text in view. A save that fails on a property offers to open the sheet.
- **Images**: the toolbar button, drag onto the editor or paste. Schrijver asks for alt text in a dialog (required, empty not accepted), stores the file under the site's `afbeeldingen.pad`, and inserts `![alt](relative-path)` with `insertAtCursor`. Images are committed in the same commit as the text. Allowed types: png, jpg, webp, svg; max 5 MB; svg is sanitised: scripts, outside references, metadata and text that is not drawn go. Photo metadata always goes, without asking and without re-encoding: on upload and again on save the server takes EXIF (location, time, camera, names), XMP, IPTC, comments and text chunks out of the file, keeping only an EXIF orientation other than 1 so a turned photo stays upright, and drops the `metadata` element of an svg; a file it cannot take apart safely is refused. A png, jpg or webp above 500 kB or 2000 pixels gets an unticked offer "Verklein voor het web" with the real before and after sizes; only when the writer ticks it does the browser scale it to 2000 pixels and re-encode it.
- **Mermaid**: the toolbar inserts a fenced `mermaid` block with an `accTitle:` and `accDescr:` scaffold. Save is blocked while a Mermaid block lacks `accDescr`. "Voorbeeld" renders it.
- **Unknown constructs** (shortcodes, HTML) are plain text in the editor and shown as a neutral "niet in voorbeeld" block in "Voorbeeld".
- **Local safety net**: the draft is kept in `localStorage` per branch until a save succeeds, and restored with a notice when the page is reopened.

Gaps found in `nldd-text-editor` (no image or Mermaid rendering, no block drag) are reported to the design system via the contribute route, with Schrijver as the concrete use case.

### 8.2 VLAM assistant

Side panel, works on the selection or the whole page. Fixed actions: "Korter", "Naar B1", "Actiever", "Kopjes voorstellen", "Samenvatting voor description", and a free prompt. Each result is a **suggestion**. For a selection it is shown in the panel with a text diff, and marked in the editor with the annotation overlay on the affected range. For the whole text, a selection that takes in all of it included, it is a comparison of the page in the text column in place of the text, headed by the page title with the path and the number of changes under it, and the panel says how many changes it shows. "Overnemen" applies it with `replaceRange`; "Verwerpen" removes the annotation or the comparison; both are in the panel and, for a comparison, again under it. A summary is always shown in the panel. The assistant never writes into the document by itself.

Implementation: `openai` client against `VLAM_API_URL`, model from configuration (default `vlam-llm-large-prepaid`), `VLAM_KEY_PREPAID` from a ZAD secret, streaming on. System prompt is the site's `schrijfwijzer` plus a fixed instruction to answer in Markdown and to change only what was asked. Request payload contains the page text and the instruction, never the user's name, e-mail or pseudonym. Requests are logged with site, action and token counts, not with content.

If VLAM is unreachable the panel shows a notice; editing and saving are unaffected.

## 9. Authentication and authorisation

- OIDC against the project's Keycloak on ZAD (service `keycloak`, env `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`), authorisation-code flow with PKCE. SSO Rijk is upstream of that realm.
- Claims used: `sub` (pseudonym), `name` and `email` (identity choice "op naam" and the editorial e-mail check), `organization.name` (shown in the UI only). `email` is trusted only when `email_verified` is true; otherwise the user has no e-mail for editorial matching and cannot choose "op naam" (see decision 0003).
- Session in an encrypted, HTTP-only cookie; no session table. Lifetime 8 hours, sliding.
- Roles: everyone signed in proposes; per site a team of beheerders and redactie, managed under Instellingen; platform admins (`SCHRIJVER_BEHEERDERS`) add and remove sites and manage every site (section 4.1, decision 0008).
- Not using `authorization-wall`, because the app needs the claims itself.

## 10. Deployment and operations

- One container, SvelteKit with the Node adapter, port 8080, non-root, `/healthz`.
- ZAD component with services `keycloak`, `vlam`, `postgresql-database` (`db/schema.sql`: the sites, their settings and teams, invitations, recorded writers per proposal, the audit log, and the user preferences and profile keyed by `sub`) and `publish-on-web`.
- Secrets via `user-env-vars`: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `VLAM_KEY_PREPAID`, `PSEUDONYM_SECRET`, `SESSION_SECRET`.
- Security headers set by the app (ZAD production ingress only sets HSTS): CSP without inline scripts except the design-system bundle hash, frame-ancestors none.
- Workflow following the zad-actions pattern: build image to ghcr on push and PR, deploy to production on main, preview deployment per PR with label `preview`, cleanup on close.
- Logging: structured JSON to stdout; each forge call logged with site, operation, PR number and outcome; no page content, no e-mail addresses (pseudonym only).

## 11. Error handling

- Every forge refusal is shown in plain Dutch with the verbatim GitHub message in a disclosure. Examples: branch protection blocks a merge, installation token expired (retried once transparently), rate limit (shows when it resets).
- Save failure never loses text (local safety net, section 8.1).
- A page that fails to parse opens read-only with the reason and a link to the file on GitHub.
- Preview build failed: shown as status with a link to the check run; Send-in stays possible, the editorial team sees the failed check.
- VLAM down: side panel notice only.
- List of sites unreadable at start-up (the database): the app starts, shows "Configuratie niet geladen" to everyone and retries every minute; the sites from the previous load stay if present. A site whose `.schrijver/` cannot be read from GitHub is retried every minute and keeps its last valid structure.

## 12. Documentation

Documentation is part of version one, not an afterthought, and lives in the Schrijver repository (English, per the team convention; UI strings Dutch):

- `README.md`: what Schrijver is, the one-paragraph architecture, how to run it locally against a test repository, how to deploy.
- `docs/configuratie.md`: the files in `.schrijver/` with every field explained, and the site settings and team in Schrijver.
- `docs/een-site-aansluiten.md`: step by step for adding a site: install the App, add `.schrijver/` with a worked example per site type (Astro collection, Hugo section), set up the preview URL, add the site with "Site toevoegen", set its team, test the round-trip.
- `docs/identiteit-en-privacy.md`: the three identity choices, what ends up where, the pseudonym mechanism and secret rotation, what goes to VLAM.
- `docs/decisions/`: short decision records, starting with `0001-editor.md` (NLDD text editor over a block editor, with the Milkdown fallback) and `0002-forge-as-state.md`.
- `CONTRIBUTING.md` and a `CHANGELOG.md`.
- In-app: a help page in Dutch for colleagues ("Zo werkt Schrijver") and the per-site writing guide.

## 13. Testing

1. **Unit**: schema validation; frontmatter parse and serialise; pseudonym derivation; trailer formatting; identity choice to trailer mapping.
2. **Round-trip corpus**: all `.md` files of both sites (vendored copies, refreshed by a script) open and save byte-identical, except the enumerated normalisations.
3. **Flow with a fake Forge**: first save creates branch and draft PR; later save commits; Send-in marks ready and requests reviewers; merge respects "Samenvoegen in Schrijver" and editorial membership; outside PRs appear in the list; conflict detection on changed blob SHA.
4. **End-to-end in CI** against a throw-away GitHub repository with the App installed: the whole flow once per PR of Schrijver itself, Playwright for the UI.
5. **Accessibility**: pa11y-ci on the main screens, keyboard-only walkthrough of edit, save and send-in, as the sites already do.
6. **VLAM**: the client is tested against a recorded OpenAI-compatible response; the live call is a manual smoke test on the production cluster, since the sandbox has only a stub.

## 14. Stack

TypeScript, SvelteKit (Node adapter), `@nldd/design-system` 0.8.x pinned, Octokit (`@octokit/app`, `@octokit/rest`, `@octokit/graphql`), `openai`, `yaml`, `mermaid` (client), Vitest, Playwright, pa11y-ci. Podman `Containerfile`, `compose.yml` for local development with a Keycloak dev realm.

## 15. Open points to settle during implementation

- Exact permission for `markPullRequestReadyForReview` (verify in GraphQL docs).
- Whether `Co-authored-by` on an App commit links to the profile as expected (verify on the test repository).
- Whether Plak's preview workflow in Digi Handboek runs on draft PRs (read `preview.yml`); if not, set it to run on drafts or send in without draft.
- Mail notifications: does ZAD offer SMTP? Otherwise the proposal list is the notification.
- The MOZa Mermaid render hook also emits pre-rendered SVGs under `static/images/render/`; check whether a new diagram needs that step and, if so, document it as an editorial to-do.
