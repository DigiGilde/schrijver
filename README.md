# Schrijver

Schrijver is a web app that lets colleagues edit the Markdown pages of static sites (Digi Handboek on Astro, the MOZa site on Hugo) in a friendly editor and propose their changes as GitHub pull requests, without needing to know Git or having a GitHub account.

## Status

Version 0.1.0, a pilot. Schrijver is not yet deployed; the pilot sites are Digi Handboek and MOZa. Known gaps and the open compliance work are listed in [docs/review/README.md](docs/review/README.md).

## Architecture

The forge is the only state: a proposal is a branch plus a pull request, and Schrijver reads proposals live from GitHub instead of keeping its own list. All writes go through a GitHub App installed on each site repository, so no colleague needs a personal token; every commit is authored by the App and the person is named only in a commit trailer, as chosen. The editor is the NLDD Designsysteem's `nldd-text-editor`, so the document stays Markdown text. VLAM acts as a writing assistant that suggests but never writes. Each site keeps its structure (content folder, page schema, writing guide) in `.schrijver/` in its own repository; the list of sites and each site's team and settings live in Postgres, with people known by their SSO subject, and are managed in the app. A site on a private repository is open to its team only, and to colleagues whose linked GitHub account may read the repository. It is a SvelteKit app (Node adapter) that runs on ZAD behind SSO Rijk (Keycloak). Background: [docs/decisions](docs/decisions/README.md) and the [design](docs/ontwerp.md).

## Local development

```sh
npm install
cp .env.example .env
SCHRIJVER_FAKE_FORGE=1 SCHRIJVER_BEHEERDERS=test SCHRIJVER_TEST_SESSION='{"sub":"test","name":"Test Gebruiker","email":"test@example.org","emailVerified":true,"organisation":null,"exp":9999999999999}' npm run dev
```

- `SCHRIJVER_FAKE_FORGE=1` replaces GitHub with an in-memory fake forge, seeded with the corpus of both pilot sites and a draft proposal each, and keeps the sites, teams and preferences in memory. No GitHub App, Keycloak or database is needed. A "Testomgeving" bar above the app bar says so, and without `VLAM_API_URL` Schrijfhulp gives marked test answers (see [testing Schrijfhulp locally](docs/ai-en-vlam.md#testing-schrijfhulp-locally)). The fake teams make `test@example.org` beheerder of Digi Handboek and redactie of MOZa; a third site with outdated `.schrijver/` files shows platform admins how Schrijver reports a broken site, and Werkplaats, on a private repository, is open to its team only, with the test user as its bijdrager.
- `SCHRIJVER_TEST_SESSION` is a JSON session (`sub`, `name`, `email`, `emailVerified`, `organisation`, `exp` in epoch milliseconds) that skips the login.
- `SCHRIJVER_BEHEERDERS` lists the SSO subjects of the platform admins, comma separated. They manage every site and are the only ones who add or remove one; each finds their own subject under Instellingen.
- The first two are ignored when `NODE_ENV` is `production`.

To run against real services, fill in `.env` (see `.env.example`). The app reads `process.env`, and `npm run dev` does not load `.env` into it: load it into the shell first, for example `set -a; . ./.env; set +a; npm run dev`. Two variables worth knowing: `VLAM_MODEL` (default `vlam-llm-large-prepaid`) selects the VLAM model, and `DATABASE_SERVER_FULL` is the Postgres connection string, provided by the platform on ZAD. A full local stack with Keycloak and Postgres is described in [dev/README.md](dev/README.md) (`podman compose up --build`). The Keycloak check below is for any other realm.

## Tests

```sh
npm run dev         # start the development server
npm test            # unit tests, including the Markdown round-trip corpus
npm run build       # production build (adapter-node, output in build/)
npm run check       # svelte-check
npm run lint        # prettier --check
npm run test:e2e    # Playwright against the fake forge
```

## Container and deployment

Build the container with `podman build -f Containerfile -t schrijver .` (the app listens on `PORT`). Run exactly one replica: the cache, the rate limits and the loaded site structure live in memory, and a webhook reaches only one replica. Deployment to ZAD, the secrets and the GitHub App are described in [docs/een-site-aansluiten.md](docs/een-site-aansluiten.md) and the design's deployment section ([section 10](docs/ontwerp.md)).

## Documentation

- [docs/configuratie.md](docs/configuratie.md): `.schrijver/` in a site repository (`site.yaml`, the page schema, the writing guide), with worked examples.
- [docs/een-site-aansluiten.md](docs/een-site-aansluiten.md): add a site, step by step.
- [docs/identiteit-en-privacy.md](docs/identiteit-en-privacy.md): identity choices, pseudonyms, what goes to VLAM.
- [docs/ontwerp.md](docs/ontwerp.md): the v1 design.
- [docs/decisions/README.md](docs/decisions/README.md): decision records.
- [docs/toegankelijkheid.md](docs/toegankelijkheid.md): accessibility status and input for the toegankelijkheidsverklaring.
- [docs/ai-en-vlam.md](docs/ai-en-vlam.md): the writing assistant, AI Act and algoritmeregister.
- [docs/privacy.md](docs/privacy.md): processing inventory, register draft and DPIA advice.
- [docs/beveiliging.md](docs/beveiliging.md): BIO checklist and platform questions.
- [docs/smoke-test.md](docs/smoke-test.md): the manual run against real GitHub before the pilot.
- [docs/review/README.md](docs/review/README.md): index of the compliance reviews.
- [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), [SECURITY.md](SECURITY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [NOTICE](NOTICE), [LICENSE](LICENSE) (EUPL-1.2), [publiccode.yml](publiccode.yml) (a draft until the repository is published).
- In the app: the help page `/help` ("Zo werkt Schrijver").

## Manual check of the login against Keycloak

Schrijver signs users in through OIDC (code flow with PKCE). To try it locally against a Keycloak realm (the dev realm from `compose.yml`, see [dev/README.md](dev/README.md), or any realm you can reach):

1. In the realm, create a confidential client with the redirect URI `http://localhost:5173/login/callback` and (optionally) the post-logout redirect URI `http://localhost:5173/`. Give the test user a name and e-mail address; mark the e-mail verified to test the "Op naam" option.
2. In `.env` set `OIDC_DISCOVERY_URL` (`http://localhost:8080/realms/<realm>/.well-known/openid-configuration`), `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `SESSION_SECRET` (any long random string) and `DATABASE_SERVER_FULL` (a reachable Postgres; `db/schema.sql` is applied on the first request). Plain `http` issuers are accepted for local use.
3. Load `.env` into the shell and start the server (`set -a; . ./.env; set +a; npm run dev`), then open `http://localhost:5173/`.

Expected:

- You are redirected to `/login`, then to Keycloak. After signing in you land on `/onboarding` (first time) or `/`.
- Your name and address head the "Menu" in the app bar, above the Account group with Instellingen and Uitloggen. The session cookie `schrijver_sessie` is `httpOnly` and lasts 8 hours.
- `/uitloggen` clears the cookie and, when the realm advertises an end-session endpoint, ends the Keycloak session too.
- A failed or replayed callback shows "Inloggen is niet gelukt" (status 400) and logs `auth.callback_failed` as JSON on stdout, without tokens.
