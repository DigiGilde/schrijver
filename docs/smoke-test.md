# Smoke test against real GitHub

All automated tests run on the fake forge. Before the pilot, and after any change to `src/lib/forge/github.ts`, run this checklist once by hand against a throw-away repository with the real GitHub App. It covers what the fake cannot: App permissions, `markReady`, the squash merge with trailers, the webhook and the installation lookup for a private configuration repository.

Budget: about 30 minutes.

## 1. Prepare

- [ ] Create a throw-away **public** repository, for example `<org>/schrijver-smoke`, with a `main` branch and a few pages: `docs/index.md` (with frontmatter `description: Test`) and `docs/kennis/pagina.md`.
- [ ] Protect `main` the way a pilot site does (require a pull request; optionally one approving review) so the merge refusal path can be seen too.
- [ ] Create a throw-away **private** configuration repository, for example `<org>/schrijver-smoke-config`, with `sites.yaml`, `schemas/smoke.yaml` and `schrijfwijzer/smoke.md`. Start from the Digi Handboek example in [configuratie.md](configuratie.md) and change:
  - `id: smoke`, `repo: <org>/schrijver-smoke` (type it in different casing than GitHub shows, to exercise the case-insensitive compare), `content.pad: docs`;
  - `review.model: goedkeuring`, `mergen-vanuit-schrijver: true`, your own verified e-mail address under `redactie`;
  - `preview.soort: geen`.
- [ ] Use the production GitHub App or, better, a separate test App with the same permissions ([een-site-aansluiten.md](een-site-aansluiten.md), step 1). Install it on both repositories only.
- [ ] Point the App's webhook at a URL that reaches your Schrijver (for a local run a tunnel, or skip the webhook checks).

## 2. Configure and start Schrijver

- [ ] Fill `.env` from `.env.example`: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_CONFIG_REPO=<org>/schrijver-smoke-config`, `ORIGIN`, `SESSION_SECRET`, `PSEUDONYM_SECRET` (both at least 32 bytes), `DATABASE_SERVER_FULL`, the `OIDC_*` values of a realm you can sign in to, and the `VLAM_*` values if you test the assistant.
- [ ] Do not set `SCHRIJVER_FAKE_FORGE` or `SCHRIJVER_TEST_SESSION`.
- [ ] Start it: the container (`podman compose up --build`, see [dev/README.md](../dev/README.md)) or `set -a; . ./.env; set +a; npm run dev`.
- [ ] The log shows `config.loaded`, not `config.load_failed`. The home page lists the site and shows no "Configuratie niet geladen" banner.

## 3. Run the flow

- [ ] Sign in, finish onboarding with "Anoniem", open the site and `index.md`.
- [ ] Edit the text, add an image with alt text, click "Concept bewaren". Expect "Concept bewaard als voorstel #N"; "Voorbeeld" in the editor toolbar shows the image.
- [ ] Close the tab. Open the site again: under "Pagina's" the page row shows "Verder met je voorstel", under "Voorstellen" the proposal row shows "Verder bewerken". Follow it, edit again and click "Opslaan". Expect the same number #N.
- [ ] Open the proposal (its row under "Voorstellen"). Status "Concept", the step bar on "Concept"; under "Wijzigingen" both saves show in colour.
- [ ] Click "Insturen". Expect status "Ingestuurd" and the step bar on "Ingestuurd". As a member of the site's `redactie`, expect "Voorstellen (1)" on the site and the proposal under "Te beoordelen".
- [ ] Optionally approve on GitHub with another account, then click "Samenvoegen" in Schrijver. Expect status "Samengevoegd".

## 4. Verify on GitHub

- [ ] One branch `schrijver/smoke/docs-xxxx` (an `index.md` takes its folder name) and one pull request #N, not two.
- [ ] Two commits, each authored by the App (no custom author), each marked **Verified**, each ending in `Schrijver-Auteur: <12 hex>`. The image is in the first commit together with the text.
- [ ] After "Insturen" the pull request is **no longer a draft**. If it still is a draft with the line `Schrijver-Status: ingestuurd` in its body, `markReady` was refused: note the App's permissions, because GitHub will not merge a draft (open point in [ontwerp.md](ontwerp.md), section 15).
- [ ] The squash commit on `main` carries the title `<title> (#N)` and the `Schrijver-Auteur` trailer once.
- [ ] With "Gekoppeld" (link your GitHub account in `/instellingen` first) a second proposal's commits carry `Co-authored-by: ... <id+login@users.noreply.github.com>`; check that GitHub shows your avatar on the commit.
- [ ] Webhook: push a change to `docs/index.md` on GitHub; within seconds Schrijver shows the new text (no 60-second wait). Push a change to `sites.yaml`; the log shows `config.loaded`.
- [ ] The logs contain no e-mail addresses and no page text.

## 5. Clean up

- [ ] Close or merge every pull request the run made and delete the `schrijver/smoke/...` branches.
- [ ] Uninstall the App from both repositories, or delete the test App.
- [ ] Archive or delete the two throw-away repositories.
- [ ] Remove the smoke user's row from the preferences table if the database is shared.
- [ ] Note the outcome (date, App, what failed) in the pull request that triggered the run.
