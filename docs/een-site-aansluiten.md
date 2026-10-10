# Connecting a site

Step by step for adding a site to Schrijver. A site is a GitHub repository with a `.schrijver/` folder that describes how the site is built; who works on it and how is set in Schrijver. For every field of the files see [configuratie.md](configuratie.md#the-schrijver-folder).

## 1. Create or reuse the GitHub App

One GitHub App serves all sites. Create it under the organisation that owns the site repositories, or reuse the existing one.

Repository permissions:

| Permission | Level | Used for |
| --- | --- | --- |
| Contents | Read and write | Reading pages and `.schrijver/`, creating branches, committing, merging. |
| Pull requests | Read and write | Draft pull requests, marking ready, reviewers, reviews, listing. |
| Issues | Read and write | Labels: `preview` at "Insturen" and `aanpassing gevraagd` for a request for an adjustment. The conversation of a proposal: reading its comments and posting reactions. |
| Checks | Read | Showing the build status of a preview. |
| Metadata | Read | The repository's id, name, default branch, description and homepage, and the collaborator permission check for the editorial role. |

Subscribe the App to the `push`, `pull_request` and `repository` events; GitHub sends `installation` and `installation_repositories` to every App without a subscription. For account linking the App also uses user authorization: its client id and secret are `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` (see [decision 0004](decisions/0004-github-link-verified.md)). The App id and private key go into `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`.

## 2. Install the App on the site repository

Install it on the site repository only. Select repositories one by one, not the whole organisation. Schrijver needs no other repository: there is no central configuration repository.

## 3. Add `.schrijver/` to the repository

Add three files to the default branch of the site repository, with a pull request like any other change:

- `.schrijver/site.yaml`: where the pages are, where images go, how a proposal gets a preview, and the Mermaid colours.
- `.schrijver/schema.yaml`: the fields of a page and where new pages go.
- `.schrijver/schrijfwijzer.md` (optional): the writing guide, sent to the assistant and shown in the editor.

Names, the team, review and ways to sign are not in these files: they are set in Schrijver, by the site's admins. A file that still has such a field gets an error that names the field and where it is set now.

### Example: Astro content collection (Digi Handboek)

Pages are `docs/**/*.md`, the title is the first H1, images go in a folder per page, and every push to a pull request builds a preview on Plak.

```yaml
# .schrijver/site.yaml
content:
  pad: docs
  patroon: '**/*.md'
  afbeeldingen:
    pad: docs/afbeeldingen/{paginaslug}
    verwijzing: relatief
preview:
  soort: bij-push
  url: 'https://plak.rijks.app/digigilde/handboek/_preview/pr-{nummer}/'
```

```yaml
# .schrijver/schema.yaml
titel: uit-h1
velden:
  description: { type: tekst, label: Samenvatting, hulp: 'Een of twee zinnen.' }
  hero: { type: ja-nee, verborgen: true }
  related: { type: paginaverwijzing, meervoud: true, max: 5, label: Lees ook }
nieuwe-pagina:
  mappen: [kennis, werkwijze, onboarding, over]
  bestandsnaam: uit-titel
  sjabloon: |
    # {titel}
```

### Example: Hugo section (MOZa, including Weekly)

Pages are `content/**/*.md` except `documenten/**` (read-only), the title is the `title` field, images go in an `images` folder next to the page, a label starts the preview, and Mermaid diagrams use three of the site's colour tokens.

```yaml
# .schrijver/site.yaml
content:
  pad: content
  patroon: '**/*.md'
  uitsluiten: ['documenten/**']
  afbeeldingen:
    pad: '{paginamap}/images'
    verwijzing: relatief
preview:
  soort: bij-label
  label: preview
  url: 'https://web-pr-{nummer}-mzs-3ik.rig.prd1.gn2.quattro.rijksapps.nl'
mermaid:
  tokens:
    --color-bg-light: { licht: '#f0f7ff', donker: '#172538' }
    --color-rijks-oranje: { licht: '#e17000', donker: '#e17000' }
    --color-text: { licht: '#091629', donker: '#ebeef2' }
```

```yaml
# .schrijver/schema.yaml
titel: veld:title
velden:
  title: { type: tekst, verplicht: true }
  description: { type: tekst, verplicht: true }
  weight: { type: getal, verborgen: true }
  date: { type: datum, alleen-in: ['weekly/**'] }
nieuwe-pagina:
  soorten:
    - naam: Weekly
      map: 'weekly/{jaar}'
      bestandsnaam: '{datum}'
      velden: [title, date]
    - naam: Handboekpagina
      mappen: ['handboek/*']
    - naam: Onderwerp
      mappen: [onderwerpen]
```

```markdown
<!-- .schrijver/schrijfwijzer.md -->

# Schrijfwijzer MOZa-site

- Schrijf in het Nederlands op B1-niveau.
- Gebruik de actieve vorm.
- Houd zinnen onder de 20 woorden.
- Spreek de lezer aan met "je".
- Schrijf namen van diensten als een woord.
```

A "Weekly" lands in `content/weekly/<year>/<date>.md` and shows only the `title` and `date` fields. Menus (`hugo.yaml`) are out of scope: the pull request description tells the editorial team to update the menu for a new page.

## 4. Set up the preview

`preview.url` must be an `https://` or `http://` address with `{nummer}` in it, which becomes the pull request number. Pick `soort`:

- `bij-push`: the site builds a preview on every push to the pull request.
- `bij-label`: the preview builds after the label in `preview.label` is set; Schrijver sets it at "Insturen".
- `geen`: no preview link.

Drafts on a public repository are readable by everyone, and a per-push preview would put half-finished text online. Make the preview build start only after "Insturen":

- Digi Handboek (Plak, `bij-push`): change the preview workflow (`preview.yml`) so it skips draft pull requests:

  ```yaml
  jobs:
    preview:
      if: github.event.pull_request.draft == false
  ```

  Place the `if` on the job that builds and publishes the preview.
- MOZa (`bij-label`): nothing to change; the `preview` label is only set at "Insturen".

## 5. Add the site in Schrijver

A platform admin (one of the subs in `SCHRIJVER_BEHEERDERS`, see [configuratie.md](configuratie.md#schrijver_beheerders)) adds the site under Instellingen, with "Site toevoegen":

1. The repository on GitHub, as `owner/name` or its address. Schrijver checks that the App is installed on it (else it links to the installation page), that no other site has it, that it is public, and that the files in `.schrijver/` on the default branch are valid (else it names every problem, with its file and field). A private repository is refused: everyone who signs in can read a site's pages and proposals in Schrijver, more people than GitHub lets read a private repository.
2. The site: its id in Schrijver's addresses (`/sites/<id>`, lower case letters, digits and hyphens, proposed from the repository name), its naam, omschrijving and adres (proposed from the repository's name, description and homepage), and its first beheerder: yourself, or a colleague's work e-mail address. A colleague Schrijver knows by that verified address is added at once; otherwise the address gets an invitation for 30 days, claimed at the first login with it. Schrijver sends no e-mail.

The site starts with merging in Schrijver on, four eyes on and every way to sign allowed. Schrijver binds the site to the repository's numeric id, so a renamed or moved repository stays the same site; a repository by the same name with another id is never used.

## 6. Set the team and the settings

The site's beheerder opens "Beheer van <naam>" under Instellingen: the team (who is beheerder and who is redactie, and invitations), and the settings (naam, omschrijving, adres, merging in Schrijver, four eyes, ways to sign). On a public repository leave out "Op naam" unless real names should be visible. Users with a linked GitHub account and write permission on the repository count as redactie, with admin permission as beheerder. GitHub stays the last judge: branch protection and required reviews apply, and Schrijver shows a refusal verbatim.

The page also shows the site's structure from `.schrijver/`, and what is wrong with it when the files stop being valid. Only a platform admin can remove a site, under "Site verwijderen": its settings, team and invitations go, and so does the record of who wrote in its proposals; the repository, its pages and its proposals stay on GitHub.

## 7. Run the round-trip check

Opening and saving a page without edits must give a byte-identical file.

1. Copy the site's Markdown files into `tests/corpus/<site-id>/` (the pilot sites are refreshed with `scripts/refresh-corpus.sh`).
2. Run the corpus test: `npx vitest run tests/unit/corpus-roundtrip.test.ts`.
3. A file that fails is either a bug in Schrijver or content it cannot parse. Files that are known to be unparseable are listed in `tests/corpus/verwacht-ongeldig.json`; any intended normalisation is recorded in `tests/corpus/NORMALISATIES.md` (currently none).

## 8. Check the site in Schrijver

Open `/sites/<id>`: the page list, a page, and "Nieuwe pagina" for each page type should work. Create a draft and check that the branch, the pull request and the preview link look right.

## 9. Add the webhook

On the App (or on each repository) add a webhook:

- URL: `https://<ORIGIN>/api/webhook/github`
- Content type: `application/json`
- Secret: the value of `GITHUB_WEBHOOK_SECRET`
- Events: `push`, `pull_request` and `repository`; `installation` and `installation_repositories` come without a subscription

Schrijver matches every event to a site by the repository's numeric id:

- `push` to the default branch: reads the site's `.schrijver/` again, and follows a new name or default branch.
- `pull_request`: refreshes the proposal lists; when a pull request is closed, merged or not, Schrijver deletes its record of who wrote in it.
- `installation` and `installation_repositories`: when the App is installed, removed, suspended or allowed back, or gains or loses a repository, Schrijver reads the sites of those repositories again at once (every site when the event names no repository). A site whose App was removed shows the problem on its beheer page; one whose App is back works again.
- `repository` (renamed, transferred, deleted): Schrijver follows the new name at once, also when another repository takes the old one, or shows on the beheer page that the repository is gone.

A webhook reaches one replica only, so run Schrijver with exactly one replica.

When a later change to `.schrijver/` is not valid, Schrijver keeps working with the last valid structure and shows the problem to the site's admins, on the start page ("De instellingen in de repository kloppen niet") and on its beheer page. A site whose files were never valid, or that Schrijver could not read since it started, cannot be edited until they are.
