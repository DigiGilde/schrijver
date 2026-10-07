# Connecting a site

Step by step for adding a site to Schrijver. For the file formats see [configuratie.md](configuratie.md).

## 1. Create or reuse the GitHub App

One GitHub App serves all sites. Create it under the organisation that owns the config repository, or reuse the existing one.

Repository permissions:

| Permission | Level | Used for |
| --- | --- | --- |
| Contents | Read and write | Reading pages, creating branches, committing, merging. |
| Pull requests | Read and write | Draft pull requests, marking ready, reviewers, reviews, listing. |
| Issues | Read and write | Labels only (the `preview` label). |
| Checks | Read | Showing the build status of a preview. |
| Metadata | Read | The collaborator permission check for the editorial role. |

Subscribe the App to the `push` and `pull_request` events. For account linking the App also uses user authorization: its client id and secret are `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` (see [decision 0004](decisions/0004-github-link-verified.md)). The App id and private key go into `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`.

## 2. Install the App

Install it on the site repository and on the private configuration repository (`GITHUB_CONFIG_REPO`). Select only these repositories, not the whole organisation.

## 3. Write the site entry and schema

In the configuration repository add an entry to `sites.yaml` and a file `schemas/<id>.yaml`, and optionally `schrijfwijzer/<id>.md`. Start from the worked examples in [configuratie.md](configuratie.md#worked-example-astro-content-collection-digi-handboek). Open a pull request; the push webhook (step 8) reloads the configuration after merge.

## 4. Choose the review model and the editorial list

- `review.model: goedkeuring` for sites where someone reviews every change; `direct` only where "Insturen" may merge at once.
- `review.redactie`: the e-mail addresses of the editorial team. Users with a verified GitHub link and push permission on the repository are editorial as well.
- GitHub stays the last judge: branch protection and required reviews apply, and Schrijver shows a refusal verbatim.
- `identiteit.toegestaan`: on a public repository leave out `op-naam` unless you want real names visible.

## 5. Set the preview URL pattern

`preview.url` must contain `{nummer}`, which becomes the pull request number. Pick `soort`:

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

## 6. Run the round-trip check

Opening and saving a page without edits must give a byte-identical file.

1. Copy the site's Markdown files into `tests/corpus/<site-id>/` (the pilot sites are refreshed with `scripts/refresh-corpus.sh`).
2. Run the corpus test: `npx vitest run tests/unit/corpus-roundtrip.test.ts`.
3. A file that fails is either a bug in Schrijver or content it cannot parse. Files that are known to be unparseable are listed in `tests/corpus/verwacht-ongeldig.json`; any intended normalisation is recorded in `tests/corpus/NORMALISATIES.md` (currently none).

## 7. Check the site in Schrijver

Open `/sites/<id>`: the page list, a page, and "Nieuwe pagina" for each page type should work. Create a draft and check that the branch, the pull request and the preview link look right.

## 8. Add the webhook

On the App (or on each repository) add a webhook:

- URL: `https://<ORIGIN>/api/webhook/github`
- Content type: `application/json`
- Secret: the value of `GITHUB_WEBHOOK_SECRET`
- Events: `push` and `pull_request`

A push to the configuration repository reloads the configuration; events on site repositories refresh the proposal lists.
