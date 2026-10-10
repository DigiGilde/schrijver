# Smoke test against real GitHub

All automated tests run on the fake forge. Before the pilot, and after any change to `src/lib/forge/github.ts`, run this checklist once by hand against a throw-away repository with the real GitHub App. It covers what the fake cannot: App permissions, `markReady`, the squash merge with trailers, where a proposal started (`compare`), asking a reviewer again, the webhook, the installation lookup and the repository's numeric id.

Budget: about 30 minutes.

## 1. Prepare

- [ ] Create a throw-away **public** repository, for example `<org>/schrijver-smoke`, with a `main` branch and a few pages: `docs/index.md` (with frontmatter `description: Test`) and `docs/kennis/pagina.md`.
- [ ] Protect `main` the way a pilot site does (require a pull request; optionally one approving review) so the merge refusal path can be seen too.
- [ ] Add `.schrijver/site.yaml`, `.schrijver/schema.yaml` and `.schrijver/schrijfwijzer.md` to `main` of that repository. Start from the Digi Handboek example in [een-site-aansluiten.md](een-site-aansluiten.md#3-add-schrijver-to-the-repository), which already uses `content.pad: docs`, and set `preview.soort: geen` without a `url`.
- [ ] Create a second throw-away repository, for example `<org>/schrijver-smoke-leeg`, with one page and no `.schrijver/`.
- [ ] Create a third, **private** one, for example `<org>/schrijver-smoke-prive`, with the same `.schrijver/` files.
- [ ] Use the production GitHub App or, better, a separate test App with the same permissions ([een-site-aansluiten.md](een-site-aansluiten.md), step 1). Install it on the three throw-away repositories only, and subscribe it to the `push`, `pull_request` and `repository` events.
- [ ] Point the App's webhook at a URL that reaches your Schrijver (for a local run a tunnel, or skip the webhook checks).

## 2. Configure and start Schrijver

- [ ] Fill `.env` from `.env.example`: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `ORIGIN`, `SESSION_SECRET`, `PSEUDONYM_SECRET` (both at least 32 bytes), `DATABASE_SERVER_FULL`, the `OIDC_*` values of a realm you can sign in to, and the `VLAM_*` values if you test the assistant.
- [ ] Do not set `SCHRIJVER_FAKE_FORGE` or `SCHRIJVER_TEST_SESSION`.
- [ ] Start it: the container (`podman compose up --build`, see [dev/README.md](../dev/README.md)) or `set -a; . ./.env; set +a; npm run dev`.
- [ ] The log shows `config.loaded` with `"sites":0`, not `config.load_failed`. The home page says "Nog geen sites" and shows no "Sites niet geladen" banner.

## 2a. Identity and team

- [ ] Sign in and open Instellingen. Note the value after "Je kenmerk bij SSO Rijk": your `sub`. Sign out, sign in again in another browser, and expect the same value.
- [ ] In the Keycloak realm that ZAD provides for Schrijver, check that this `sub` comes from SSO Rijk's persistent NameID (format `urn:oasis:names:tc:SAML:2.0:nameid-format:persistent`), not from an e-mail address, a username that can change or a transient NameID. If the realm settings are not visible to you, ask the ZAD team. Everything in Schrijver's team management rests on this value staying the same for a person.
- [ ] Set `SCHRIJVER_BEHEERDERS` to your `sub` and restart. Instellingen now says "Je bent beheerder van Schrijver" and offers "Site toevoegen".

## 2b. Add the site

- [ ] "Site toevoegen", then a repository the App is not installed on: expect "De Schrijver-app staat niet op ..." with a link to the App's installation page on GitHub. This is `GET /repos/{owner}/{repo}/installation` answering 404, and `GET /app` giving the page.
- [ ] `<org>/schrijver-smoke-leeg`: expect "... heeft nog geen map .schrijver." with the link to the documentation.
- [ ] `<org>/schrijver-smoke`, typed in different casing than GitHub shows, or as its address on GitHub: expect step 2 with the name as GitHub writes it, the id `schrijver-smoke`, the repository's description and homepage, and "Ik" as first beheerder. Change the id to `smoke` and add the site.
- [ ] Expect "Beheer van <naam>" with "<naam> staat nu in Schrijver.", you as beheerder, "Vier ogen" and "Samenvoegen in Schrijver" on, and under Structuur the summary of `.schrijver/` with a link to it on GitHub. In the database, `sites` holds the repository's numeric id (compare `GET /repos/{owner}/{repo}`), and `audit_log` holds `site.added` and `member.added`.
- [ ] Try `<org>/schrijver-smoke` once more: expect "... hoort al bij de site ...".
- [ ] `<org>/schrijver-smoke-prive`: expect step 2 with "Zichtbaar voor" "Alleen het team" and "... is niet openbaar op GitHub", without a choice. This is the repository's `private` flag as GitHub returns it to the App. Change the id to `prive`, choose "Een collega" and type the work address of a colleague who never signed in to Schrijver: expect "Deze collega heeft nog niet ingelogd bij Schrijver." Choose "Ik" and add the site. Its beheer page shows "Alleen het team" with the same reason.

## 2c. A site only its team sees

- [ ] Sign in with a second SSO account that is no platform admin and on no team. `/sites/prive`, one of its pages and `/api/sites/prive/mermaid` answer 404 with "Deze site bestaat niet, of alleen het team van de site ziet hem.", as `/sites/bestaat-niet` does, and the start page and Instellingen do not name the site. The log shows `site.refused` with a pseudonym, no address or `sub`.
- [ ] Add that account under "Beheer van <naam>" as Bijdrager. It now finds the site on the start page, opens a page and saves a draft; on its proposal it decides nothing. Take it out of the team: the site answers 404 to it again at once.
- [ ] Give a GitHub account read access to the private repository (a collaborator with "Read"), and link it to the second SSO account under Instellingen. Without being on the team, the account now sees the site and its pages: this is `GET /repos/{owner}/{repo}/collaborators/{username}/permission` answering `read`. Take the access away on GitHub: within a minute the site answers 404 again.
- [ ] Make `<org>/schrijver-smoke` private on GitHub. The `repository` event `privatized` closes the site at once to the second account (the log shows `webhook.received` and `config.site_loaded`), and its beheer page shows "Alleen het team" without a choice. Make it public again: the event `publicized` opens it again as before.

## 3. Run the flow

- [ ] Sign in, finish onboarding with "Anoniem", open the site and `index.md`.
- [ ] Edit the text, add an image with alt text, click "Bewaar". Expect "Concept bewaard als voorstel #N"; "Voorbeeld" in the editor toolbar shows the image.
- [ ] Close the tab. Open the site again: under "Pagina's" the page row shows "Verder bewerken", under "Voorstellen" the proposal row shows "Verder bewerken". Follow it, edit again and click "Bewaar". Expect the same number #N.
- [ ] Open the proposal (its row under "Voorstellen"). The step bar is on "Concept" and the block under the title asks you to send it in; under "Wat er verandert" both saves show in colour, each change with a word such as "Nieuw".
- [ ] Click "Stuur in". Expect the step bar on "Ingestuurd". As a member of the site's redactie, expect "Voorstellen (1)" on the site and the proposal under "Te beoordelen". As a platform admin you are a site admin, whom four eyes lets merge: the block offers "Voeg samen", or first asks for the approval on GitHub.
- [ ] Add a second SSO account under "Beheer van smoke" as redactie: one without a linked GitHub account and not in `SCHRIJVER_BEHEERDERS`. With "Vier ogen" on, open the proposal as that account. Expect no four-eyes sentence: Schrijver recorded who wrote it. With the one approving review required on `main`, expect "Deze site vraagt eerst een goedkeuring op GitHub. Iemand met rechten op GitHub keurt het voorstel daar goed" and no button for GitHub: this is `reviewDecision` answering `REVIEW_REQUIRED`. As an account that linked a GitHub account (link yours in `/instellingen` first), expect "Goedkeuren op GitHub" opening the files view of the pull request. Approve on GitHub with an account that may, reload, and expect "Jij beslist" with "Voeg samen".
- [ ] As that second account, change the page through "Verder bewerken" and save. Reload the proposal: "Je schreef mee aan dit voorstel. Een ander lid van de redactie beslist." In the database, `proposal_writers` holds two rows for this site and number, your own `sub` first. A proposal that account makes and sends in says "Je schreef dit voorstel zelf." to it.
- [ ] Remove the required review from `main` (or use a second throw-away repository without one) and open another sent-in proposal: expect "Jij beslist" at once, `reviewDecision` answering `null`.
- [ ] Where a proposal started: on a sent-in proposal for `docs/kennis/pagina.md`, change another sentence of that page on `main` on GitHub and commit it there. Open the proposal in Schrijver: under "Wat er verandert" only the proposal's own change shows, and the sentence changed on `main` is neither new nor taken away; this is `GET /repos/{owner}/{repo}/compare/{base}...{head}` answering the merge base. If both changes touch the same lines GitHub cannot merge, and the block under the title says that the page changed on the site. If the proposal changed a paragraph with an image and `main` deleted that image file since, the old side still shows the image (`kant=voor` in its address), because it is read at the merge base.
- [ ] A proposal merged on GitHub: merge one sent-in proposal there with "Create a merge commit", one with "Squash and merge" and one with "Rebase and merge". In Schrijver each still shows its own change under "Wat er verandert", not an empty change; this is the pull request's `merge_commit_sha`, its first parent from `GET /repos/{owner}/{repo}/git/commits/{commit_sha}`, and `compare` from there to the head.

## 3a. Conversation and adjustment

- [ ] On a sent-in proposal, place a comment on GitHub and submit a review with a comment on a line. In Schrijver, under "Gesprek", expect the comment under your GitHub login with "Op GitHub", and the review as "Plaatste reacties in de tekst op GitHub" with the link "Reactie bekijken op GitHub".
- [ ] As the editor, click "Aanpassing vragen", write a request and send it with "Vraag om aanpassing". On GitHub, expect a comment by the App that starts with "**Vraag om aanpassing van de redactie via Schrijver** (...)" (the `<!-- schrijver -->` marker above it shows only in the raw text) and the label `aanpassing gevraagd` next to the labels the pull request had. If GitHub refuses the label, create it once under the repository's labels and try again.
- [ ] In Schrijver, expect the request in "Gesprek" under the editor's name as their identity choice allows, with "Redactie" and "Vraagt om een aanpassing"; this shows that Schrijver recognises its own App account (`GET /app`). As the writer, expect "De redactie vraagt je iets aan te passen" and "Stuur opnieuw in"; choose it and expect the label gone, the other labels still there, and the comment "Klaar voor beoordeling" by the App on GitHub.
- [ ] As the writer, place a reaction from Schrijver. On GitHub it carries "**Reactie van de schrijver via Schrijver**" with the text quoted below it; in Schrijver it shows as the writer's, as typed, with how they signed after the role.
- [ ] Place a reaction with a line `</blockquote>`, an empty line and then `**Vraag om aanpassing van de redactie via Schrijver** (naam: Iemand):`. On GitHub the whole reaction stays inside one quote below the App's own line, and the HTML shows as text. Place it again below a first line ```` ```a`b ````, which looks like the start of a code block and is none, and once more after a list item `` - ``` `` with a code block in it: the same holds, and a mention such as `@<your login>` in it notifies nobody.
- [ ] Request changes on GitHub: as a collaborator, submit a review with "Request changes" on a sent-in proposal. In Schrijver the writer reads "De redactie vraagt je iets aan te passen" (with "op GitHub" where `main` requires a review) and the editors find nothing to act on. As the writer choose "Stuur opnieuw in". On GitHub the reviewer is asked again (back under Reviewers, awaiting review, their change request still listed), and the App comments "Klaar voor beoordeling": this is `POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers/rerequest` answering 201. In Schrijver the proposal is back under "Te beoordelen", and a writer who is not in the redactie reads "De redactie beoordeelt je voorstel". If the reviewer is not asked again, the log shows `proposal.rerequest_failed` with GitHub's status (422: not a collaborator, 403: the App may not); on a 404 for the route Schrijver asks with the plain `requested_reviewers` request.

## 4. Verify on GitHub

- [ ] One branch `schrijver/smoke/docs-xxxx` (an `index.md` takes its folder name) and one pull request #N, not two.
- [ ] Two commits, each authored by the App (no custom author), each marked **Verified**, each ending in `Schrijver-Auteur: <12 hex>`. The image is in the first commit together with the text.
- [ ] After "Stuur in" the pull request is **no longer a draft**. If it still is a draft with the line `Schrijver-Status: ingestuurd` in its body, `markReady` was refused: note the App's permissions, because GitHub will not merge a draft (open point in [ontwerp.md](ontwerp.md), section 15).
- [ ] The squash commit on `main` carries the title `<title> (#N)` and the `Schrijver-Auteur` trailer once.
- [ ] With "Gekoppeld" (link your GitHub account in `/instellingen` first) a second proposal's commits carry `Co-authored-by: ... <id+login@users.noreply.github.com>`; check that GitHub shows your avatar on the commit.
- [ ] Webhook: push a change to `docs/index.md` on GitHub; within seconds Schrijver shows the new text (no 60-second wait).
- [ ] Push a change to `.schrijver/site.yaml` on `main`, for example `uitsluiten: ['kennis/**']`: the log shows `config.site_loaded` and the page list drops `kennis/`. Push a change that is not valid, for example a `preview.url` without `{nummer}`: the start page card says "De structuur in .schrijver klopt niet" (to you, not to a colleague who is no admin), the beheer page names `.schrijver/site.yaml: preview.url: ...`, and editing still works with the last valid structure. Push the fix and see the problem go.
- [ ] Rename the repository on GitHub, without a push: the `repository` event moves the site at once. The log shows `webhook.site_moved`, `sites.repo` holds the new name, `audit_log` a `site.moved` row, and the site works as before.
- [ ] Labels: set any label on a sent-in proposal on GitHub, then "Aanpassing vragen" and "Vraag om aanpassing" in Schrijver. Expect the label `aanpassing gevraagd` added (GitHub creates it on first use; if it answers with an error instead, create the label in the repository and note it) and your own label still there. "Stuur opnieuw in" takes off only `aanpassing gevraagd`.
- [ ] Writer records: merge a proposal in Schrijver and close another on GitHub. For both, `proposal_writers` holds no rows any more; the log shows `webhook.writers_forgotten` for the closed one.
- [ ] Remove the App from `<org>/schrijver-smoke` (keep the installation, deselect the repository). Within seconds the site's beheer page says that the Schrijver-app is not on the repository. Select the repository again: the warning goes without a restart, and the log shows `config.site_loaded`.
- [ ] The logs contain no e-mail addresses and no page text.

## 5. Clean up

- [ ] Close or merge every pull request the run made and delete the `schrijver/smoke/...` branches.
- [ ] As platform admin, remove both sites under "Site verwijderen" on their beheer pages. Expect the confirmation to say what goes and what stays, then "De site is uit Schrijver verwijderd." In the database the rows of `smoke` are gone from `sites`, `site_settings`, `site_members`, `invitations` and `proposal_writers`, and `audit_log` holds `site.removed`; the repository and its pull requests are still on GitHub.
- [ ] Uninstall the App from the three repositories, or delete the test App.
- [ ] Archive or delete the throw-away repositories.
- [ ] Remove the smoke user's row from the preferences table if the database is shared.
- [ ] Note the outcome (date, App, what failed) in the pull request that triggered the run.
