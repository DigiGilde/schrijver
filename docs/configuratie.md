# Configuration

Schrijver is configured, not hard-coded. The structure of each site lives in a private repository (`GITHUB_CONFIG_REPO`, for example `schrijver-config`), read at start-up and again on a push webhook. Changes go through a pull request like everything else. The team of a site and its settings (name, description, address, merging, four eyes, ways to sign) live in Schrijver's database and are managed in Schrijver; `sites.yaml` only gives a new site its first settings. See [Site settings and team](#site-settings-and-team).

Layout of the configuration repository:

```
sites.yaml
schemas/<schema-id>.yaml
schrijfwijzer/<site-id>.md
```

Working examples are in [tests/fixtures/config](../tests/fixtures/config). Parsing is strict: an unknown key is an error, so a typo is caught on load. The authoritative definition is [src/lib/config/types.ts](../src/lib/config/types.ts).

## sites.yaml

A list of sites. Keys are in Dutch.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | string | required | Stable identifier, used in URLs (`/sites/<id>`) and branch names. |
| `naam` | string | the `id` | Starting value of the name shown to colleagues. |
| `omschrijving` | string | optional | Starting value of the one sentence on what the site is, for example "Hoe het Digi Gilde werkt en wat het maakt." |
| `adres` | `https:` or `http:` address | optional | Starting value of the public address of the site, shown to colleagues instead of the repository, for example `https://digigilde.nl/handboek`. |
| `forge` | `github` | required | Only `github` in version one. |
| `repo` | string | required | `owner/name` of the site repository. The GitHub App must be installed on it. |
| `standaardbranch` | string | required | Branch that proposals start from and merge into. |
| `concepten` | `openbaar` or `privé` | `openbaar` | Where drafts live. `privé` is refused in version one: the whole configuration fails to load with "concepten: privé wordt nog niet ondersteund". |
| `content.pad` | string | required | Folder with the Markdown pages. |
| `content.patroon` | string | required | Glob of editable pages, relative to `pad`, for example `**/*.md`. |
| `content.schema` | string | required | Name of the schema file in `schemas/` (without `.yaml`). |
| `content.uitsluiten` | list of globs | none | Pages that are not offered for editing, for example `documenten/**`. |
| `content.afbeeldingen.pad` | string | none | Where uploaded images are stored. Placeholders: `{paginaslug}` (file name of the page without extension) and `{paginamap}` (folder of the page). Without this block the site refuses images ("Deze site accepteert geen afbeeldingen"). |
| `content.afbeeldingen.verwijzing` | `relatief` | required in the block | How images are referenced from the page. Only `relatief`. |
| `review.model` | `goedkeuring` or `direct` | required | `goedkeuring`: "Insturen" asks for review. `direct` (merge at once on "Insturen") is refused in version one: the whole configuration fails to load with "review.model: direct wordt nog niet ondersteund". |
| `review.mergen-vanuit-schrijver` | boolean | `true` | Starting value of "Samenvoegen in Schrijver": whether editorial users may merge (squash) from Schrijver. |
| `review.vier-ogen` | boolean | `true` | Starting value of "Vier ogen": the writer of a proposal cannot merge it in Schrijver, another editorial member decides. A site admin still can. See [decision 0007](decisions/0007-three-steps-and-four-eyes.md). |
| `review.redactie` | list of e-mail addresses | `[]` | Invited to the redactie once, when the site gets its first settings. An invitation binds at the first login with that verified address and expires after 30 days. The list does not decide who is editorial. |
| `identiteit.toegestaan` | list of `anoniem`, `gekoppeld`, `op-naam` | all three | Starting value of "Ondertekenen": the identity choices offered on this site. See [identiteit-en-privacy.md](identiteit-en-privacy.md). |
| `preview.soort` | `bij-push`, `bij-label` or `geen` | required | `bij-push`: a preview exists for every push to the pull request. `bij-label`: a preview exists once the label is set, which Schrijver does at "Insturen". `geen`: no preview link. |
| `preview.label` | string | required for `bij-label` | Label that triggers the preview build. |
| `preview.url` | string | required unless `soort` is `geen` | Preview URL pattern. Must contain `{nummer}`, replaced by the pull request number. |
| `schrijfwijzer` | string | none | File in `schrijfwijzer/` with the site's writing guide. |
| `mermaid.tokens` | map of token name to `licht` and `donker` | none | Colours for `var(--token)` in Mermaid diagrams, such as `classDef inzicht fill:var(--color-bg-light)`. The key is the custom property name with its `--`; `licht` and `donker` are hex colours (quote them, a bare `#` starts a YAML comment). "Voorbeeld" puts the colour of the current colour scheme in place before it draws, as the site's build does. A token missing here shows as grey, and "Voorbeeld" names it. |

"Voorbeeld" draws Mermaid diagrams the way the MOZa site's build does (NLDD colours, RijksSans, the `nldd:` icons from the design system, a light and a dark variant), for every site. Only the token colours are per site.

A starting value is read only for a site that has no settings in Schrijver yet: the first time Schrijver loads it. After that, changing it in `sites.yaml` changes nothing; the site's admins change the setting in Schrijver. A configuration error names the field, for example `sites.yaml: 1.adres: must be a web address such as https://example.org (a starting value: once the site has its settings in Schrijver, those apply)`.

Anyone signed in may propose on any site whose repository has the App installed. Editorial may also react, ask for an adjustment and merge, the latter not on a proposal they wrote while "Vier ogen" is on; approving happens on GitHub.

## Site settings and team

Each site's settings live in Schrijver's database, keyed by its `id`: Naam, Omschrijving, Adres, "Samenvoegen in Schrijver", "Vier ogen" and "Ondertekenen". The site's admins change them, and its team, under Instellingen in "Beheer van <naam>" (`/instellingen/sites/<id>`). Every change writes an audit row ([identiteit-en-privacy.md](identiteit-en-privacy.md#team-management)).

Who may do what, checked on the server at every request:

- **Editorial** decides on proposals: a member of the site's team, as beheerder or redactie, or someone whose linked GitHub account has write or admin permission on the repository.
- **Site admin** manages the team and the settings, and may merge a proposal they wrote despite four eyes: a beheerder on the team, a platform admin, or someone whose linked GitHub account has admin permission on the repository.
- **Platform admin** ("Schrijver-beheerder") manages every site, so no site can be locked out. A platform admin is not editorial by that alone: one who decides on proposals adds themselves to the team.
- Everyone signed in may propose.

A lookup that fails (the database, GitHub) makes no one editorial or admin.

### SCHRIJVER_BEHEERDERS

The platform admins: a comma-separated list of SSO subjects (`sub`), the stable key Schrijver knows a person by, never e-mail addresses. For example `SCHRIJVER_BEHEERDERS=<sub>,<sub>`, with spaces around the commas allowed. A change takes effect when Schrijver starts with the new environment.

Set at least one. `sites.yaml` only invites the redactie, so without a platform admin nobody can manage a site's team until someone is a site admin another way (a linked GitHub account with admin permission on the repository). Everyone finds their own `sub` under Instellingen, as "Je kenmerk bij SSO Rijk", and hands it to the operator who sets this variable. On ZAD it is a user environment variable of the `web` component ([zad/project.yaml](../zad/project.yaml)).

## Schema (schemas/\<id\>.yaml)

| Field | Meaning |
| --- | --- |
| `titel` | Where the page title comes from: `uit-h1` (the first H1 is the title, no title field) or `veld:<naam>` (a frontmatter field, for example `veld:title`). |
| `velden` | Map of frontmatter field name to definition. |
| `nieuwe-pagina` | Required. How new pages are placed, in one of two variants (below). |

Fields that appear in a file but not in the schema are kept untouched, in their original order. A page that fails validation when opened still opens, with the problem highlighted.

### Field definitions

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `type` | see below | required | Field type. |
| `label` | string | field name | Label in the form. |
| `hulp` | string | none | Help text under the field. |
| `verplicht` | boolean | `false` | Saving is blocked while empty. |
| `verborgen` | boolean | `false` | Kept in the file but not shown in the form. |
| `meervoud` | boolean | none | Several values (used with `paginaverwijzing`). |
| `max` | number | none | Maximum number of values. |
| `alleen-in` | list of globs | none | Show the field only for pages matching one of the globs. |

The five types: `tekst` (text), `getal` (number), `ja-nee` (yes or no), `datum` (date), `paginaverwijzing` (reference to another page).

### nieuwe-pagina

Variant one, a list of folders:

| Option | Meaning |
| --- | --- |
| `mappen` | Folders (relative to `content.pad`) where a new page may be created. |
| `bestandsnaam` | Only `uit-titel`: the file name is derived from the title. |
| `sjabloon` | Starting body, with `{titel}` for the title. Accepted by the schema; the current code does not apply it yet. |

Variant two, page types (`soorten`), each with:

| Option | Meaning |
| --- | --- |
| `naam` | Name of the page type shown in "Nieuwe pagina". |
| `map` | One fixed folder. Placeholder `{jaar}` is the current year. |
| `mappen` | Alternatively, folders to choose from; `*` matches one level. |
| `bestandsnaam` | File name pattern. `{datum}` is today as `YYYY-MM-DD`, `{titel}` the slug of the title, `{jaar}` the year. |
| `velden` | Fields shown for this type, by name. |
| `sjabloon` | Starting body. Not applied by the current code, like `sjabloon` in the first variant. |

## schrijfwijzer/

One Markdown file per site, for example `schrijfwijzer/moza-site.md`. It is the style guidance sent to VLAM as part of the system prompt and the help shown in the editor. Copy the rules in; do not reference another repository, so the configuration stays self-contained. The MOZa example is [tests/fixtures/config/schrijfwijzer/moza-site.md](../tests/fixtures/config/schrijfwijzer/moza-site.md).

## Worked example: Astro content collection (Digi Handboek)

Pages are `docs/**/*.md`, the title is the first H1, and images go in a folder per page.

```yaml
# sites.yaml
- id: digi-handboek
  naam: Digi Handboek
  forge: github
  repo: DigiGilde/handboek
  standaardbranch: main
  content:
    pad: docs
    patroon: "**/*.md"
    schema: digi-handboek
    afbeeldingen:
      pad: docs/afbeeldingen/{paginaslug}
      verwijzing: relatief
  review:
    model: goedkeuring
    mergen-vanuit-schrijver: true
    redactie:
      - naam@rijksoverheid.nl
  identiteit:
    toegestaan: [anoniem, gekoppeld, op-naam]
  preview:
    soort: bij-push
    url: "https://plak.rijks.app/digigilde/handboek/_preview/pr-{nummer}/"
  schrijfwijzer: digi-handboek.md
```

```yaml
# schemas/digi-handboek.yaml
titel: uit-h1
velden:
  description: { type: tekst, label: Samenvatting, hulp: "Een of twee zinnen." }
  hero: { type: ja-nee, verborgen: true }
  related: { type: paginaverwijzing, meervoud: true, max: 5, label: Lees ook }
nieuwe-pagina:
  mappen: [kennis, werkwijze, onboarding, over]
  bestandsnaam: uit-titel
  sjabloon: |
    # {titel}
```

## Worked example: Hugo section (MOZa, including Weekly)

Pages are `content/**/*.md` except `documenten/**` (read-only), the title is the `title` field, images go in an `images` folder next to the page, and a label triggers the preview. The Mermaid tokens are the three that MOZa's diagrams use in a `classDef`, with the values its build resolves from its token files.

```yaml
# sites.yaml
- id: moza-site
  naam: MOZa-site
  forge: github
  repo: MinBZK/moza-site
  standaardbranch: main
  content:
    pad: content
    patroon: "**/*.md"
    schema: moza-site
    uitsluiten: ["documenten/**"]
    afbeeldingen:
      pad: "{paginamap}/images"
      verwijzing: relatief
  review:
    model: goedkeuring
    mergen-vanuit-schrijver: true
    redactie: [redactie@example.org]
  identiteit:
    toegestaan: [anoniem, gekoppeld]
  preview:
    soort: bij-label
    label: preview
    url: "https://web-pr-{nummer}-mzs-3ik.rig.prd1.gn2.quattro.rijksapps.nl"
  schrijfwijzer: moza-site.md
  mermaid:
    tokens:
      --color-bg-light: { licht: "#f0f7ff", donker: "#172538" }
      --color-rijks-oranje: { licht: "#e17000", donker: "#e17000" }
      --color-text: { licht: "#091629", donker: "#ebeef2" }
```

```yaml
# schemas/moza-site.yaml
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

A "Weekly" lands in `content/weekly/<year>/<date>.md` and shows only the `title` and `date` fields. Menus (`hugo.yaml`) are out of scope: the pull request description tells the editorial team to update the menu for a new page.

## Public drafts

`concepten: openbaar` is the only supported value. Drafts are pull requests on the site repository, readable by anyone when the repository is public. See [identiteit-en-privacy.md](identiteit-en-privacy.md#public-drafts).
