# Configuration

Schrijver is configured, not hard-coded, in two places split by who changes what:

- **The structure of a site** (content folder and file pattern, page schema, preview, Mermaid colours, writing guide) lives in the site's own repository, in `.schrijver/`. It changes with the site's code and goes through a pull request like everything else. See [The .schrijver folder](#the-schrijver-folder).
- **Who works on a site and how** (its name, description and address, merging, four eyes, ways to sign, and its team) lives in Schrijver's database and is managed in Schrijver. See [Site settings and team](#site-settings-and-team).

The list of sites is a table in the same database. A platform admin adds a site with "Site toevoegen" under Instellingen and removes one from its beheer page; step by step in [een-site-aansluiten.md](een-site-aansluiten.md). There is no central configuration repository.

## The .schrijver folder

```
.schrijver/site.yaml
.schrijver/schema.yaml
.schrijver/schrijfwijzer.md   (optional)
```

Working examples of the pilot sites are in [een-site-aansluiten.md](een-site-aansluiten.md#3-add-schrijver-to-the-repository); the repositories of the local preview are in [tests/fixtures/sites](../tests/fixtures/sites). Keys are in Dutch. Parsing is strict: an unknown key is an error, so a typo is caught on load. The authoritative definition is [src/lib/config/types.ts](../src/lib/config/types.ts).

How Schrijver reads the folder:

- From the default branch of the site repository: at start-up for every site, four at a time, and again on a push to that branch (see the webhook in [een-site-aansluiten.md](een-site-aansluiten.md#9-add-the-webhook)). "Site toevoegen" reads it before the site is added.
- The repository is known by GitHub's numeric id. When GitHub renames or moves it, Schrijver follows at once on GitHub's `repository` event, and otherwise on the next push or load, which also follow a new default branch. A repository that takes over the old name with another id is never used, and the site cannot be edited until that is sorted out.
- `site.yaml` and `schema.yaml` are read up to 64 kB each, `schrijfwijzer.md` up to 32 kB; a larger file is refused unread. Files are UTF-8; YAML aliases that would expand without bound are refused.
- Every problem names its file and its field, in Dutch, for example `.schrijver/site.yaml: preview.url: moet {nummer} bevatten`. The site's admins see them on the start page ("De instellingen in de repository kloppen niet") and on the beheer page of the site; the logs only count them.
- A site whose files are missing or not valid cannot be edited, and only its admins see it. When a later change is not valid, Schrijver keeps the last valid structure until it restarts, and shows the problem to the admins.
- When GitHub cannot be reached, or the App is no longer installed on the repository, the site stays editable with its last valid structure, and its admins see the problem. Schrijver reads that site again every minute, and only the sites that failed, until it succeeds. GitHub's events on the App's installation read the sites it concerns again at once, so a removed App shows as a problem at once and one that is back works at once (see [the webhook](een-site-aansluiten.md#9-add-the-webhook)).

### site.yaml

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `concepten` | `openbaar` or `privé` | `openbaar` | Where drafts live. `privé` is refused in version one: "concepten: privé wordt nog niet ondersteund". |
| `content.pad` | string | required | Folder with the Markdown pages, from the root of the repository: no leading `/`, no `..`. |
| `content.patroon` | string | required | Glob of editable pages, relative to `pad`, for example `**/*.md`. |
| `content.uitsluiten` | list of globs | none | Pages that are not offered for editing, for example `documenten/**`. |
| `content.afbeeldingen.pad` | string | none | Where uploaded images are stored. Placeholders: `{paginaslug}` (file name of the page without extension) and `{paginamap}` (folder of the page). Without this block the site refuses images ("Deze site accepteert geen afbeeldingen"). |
| `content.afbeeldingen.verwijzing` | `relatief` | required in the block | How images are referenced from the page. Only `relatief`. |
| `preview.soort` | `bij-push`, `bij-label` or `geen` | required | `bij-push`: a preview exists for every push to the pull request. `bij-label`: a preview exists once the label is set, which Schrijver does at "Insturen". `geen`: no preview link. |
| `preview.label` | string | required for `bij-label` | Label that triggers the preview build. |
| `preview.url` | `https:` or `http:` address | required unless `soort` is `geen` | Preview URL pattern. Must contain `{nummer}`, replaced by the pull request number. |
| `mermaid.tokens` | map of token name to `licht` and `donker` | none | Colours for `var(--token)` in Mermaid diagrams, such as `classDef inzicht fill:var(--color-bg-light)`. The key is the custom property name with its `--`; `licht` and `donker` are hex colours (quote them, a bare `#` starts a YAML comment). "Voorbeeld" puts the colour of the current colour scheme in place before it draws, as the site's build does. A token missing here shows as grey, and "Voorbeeld" names it. |

"Voorbeeld" draws Mermaid diagrams the way the MOZa site's build does (NLDD colours, RijksSans, the `nldd:` icons from the design system, a light and a dark variant), for every site. Only the token colours are per site.

The fields of the former central `sites.yaml` that are now set elsewhere are refused with an error that says where: `id` (chosen at "Site toevoegen"), `naam`, `omschrijving` and `adres` (the site settings), `review` ("Samenvoegen in Schrijver", "Vier ogen" and the team), `identiteit` ("Ondertekenen"), `team` and `redactie` (the team), `forge`, `repo` and `standaardbranch` (from GitHub), `schrijfwijzer` (the file `.schrijver/schrijfwijzer.md`) and `content.schema` (the file `.schrijver/schema.yaml`).

### schema.yaml

| Field | Meaning |
| --- | --- |
| `titel` | Where the page title comes from: `uit-h1` (the first H1 is the title, no title field) or `veld:<naam>` (a frontmatter field, for example `veld:title`). |
| `velden` | Map of frontmatter field name to definition. |
| `nieuwe-pagina` | Required. How new pages are placed, in one of two variants (below). |

Fields that appear in a file but not in the schema are kept untouched, in their original order. A page that fails validation when opened still opens, with the problem highlighted.

#### Field definitions

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

#### nieuwe-pagina

Variant one, a list of folders:

| Option | Meaning |
| --- | --- |
| `mappen` | Folders (relative to `content.pad`) where a new page may be created. |
| `bestandsnaam` | Only `uit-titel`: the file name is derived from the title. |
| `sjabloon` | Starting body of a new page in the editor, with `{titel}` for the title. Without it, a site whose title comes from the first H1 starts with `# <titel>`. |

Variant two, page types (`soorten`), each with:

| Option | Meaning |
| --- | --- |
| `naam` | Name of the page type shown in "Nieuwe pagina". |
| `map` | One fixed folder. Placeholder `{jaar}` is the current year. |
| `mappen` | Alternatively, folders to choose from; `*` matches one level. |
| `bestandsnaam` | File name pattern. `{datum}` is today as `YYYY-MM-DD`, `{titel}` the slug of the title, `{jaar}` the year. |
| `velden` | Fields shown for this type, by name. |
| `sjabloon` | Starting body of a new page of this type, as `sjabloon` in the first variant. |

### schrijfwijzer.md

Optional. The style guidance of the site, sent to VLAM as part of the system prompt and shown as help in the editor. Copy the rules in; do not reference another file or repository, so the guide is complete on its own. Without the file the assistant works without site rules.

## Site settings and team

Each site's settings live in Schrijver's database, keyed by its `id`: Naam, Omschrijving, Adres, "Samenvoegen in Schrijver", "Vier ogen" and "Ondertekenen". A new site starts with merging in Schrijver on, four eyes on and every way to sign allowed, and with the naam, omschrijving and adres given at "Site toevoegen". The site's admins change them, and its team, under Instellingen in "Beheer van <naam>" (`/instellingen/sites/<id>`), which also shows the structure from `.schrijver/`. Every change writes an audit row ([identiteit-en-privacy.md](identiteit-en-privacy.md#team-management)), and so does adding and removing a site. Removing a site removes its settings, team, invitations and the record of who wrote in its proposals; the repository and its proposals stay on GitHub.

Who may do what, checked on the server at every request:

- **Editorial** decides on proposals: a member of the site's team, as beheerder or redactie, or someone whose linked GitHub account has write or admin permission on the repository.
- **Site admin** manages the team and the settings, and may merge a proposal they wrote despite four eyes: a beheerder on the team, a platform admin, or someone whose linked GitHub account has admin permission on the repository.
- **Platform admin** ("Schrijver-beheerder") adds and removes sites and manages every site, so no site can be locked out. A platform admin is not editorial by that alone: one who decides on proposals adds themselves to the team.
- Everyone signed in may propose.

A lookup that fails (the database, GitHub) makes no one editorial or admin.

### SCHRIJVER_BEHEERDERS

The platform admins: a comma-separated list of SSO subjects (`sub`), the stable key Schrijver knows a person by, never e-mail addresses. For example `SCHRIJVER_BEHEERDERS=<sub>,<sub>`, with spaces around the commas allowed. A change takes effect when Schrijver starts with the new environment.

Set at least one: only a platform admin adds a site, and a site whose beheerders all left can otherwise only be managed by someone whose linked GitHub account has admin permission on its repository. Everyone finds their own `sub` under Instellingen, as "Je kenmerk bij SSO Rijk", and hands it to the operator who sets this variable. On ZAD it is a user environment variable of the `web` component ([zad/project.yaml](../zad/project.yaml)).

## Public drafts

`concepten: openbaar` is the only supported value. Drafts are pull requests on the site repository, readable by anyone when the repository is public. See [identiteit-en-privacy.md](identiteit-en-privacy.md#public-drafts).

The repository of a site is public: "Site toevoegen" refuses a private one, because everyone who signs in with SSO Rijk can read a site's pages, proposals and their conversation in Schrijver, more people than GitHub lets read a private repository.
