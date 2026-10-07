# Schrijver

Schrijver is a web app that lets colleagues edit the Markdown pages of static sites (Digi Handboek on Astro, the MOZa site on Hugo) in a friendly editor and propose their changes as GitHub pull requests, without needing to know Git or having a GitHub account.

## Architecture

The forge is the only state: a proposal is a branch plus a pull request, and Schrijver reads proposals live from GitHub instead of keeping its own list. All writes go through a GitHub App installed on each site repository, so no colleague needs a personal token; every commit is authored by the App and the person is named only in a commit trailer, as chosen. The editor is the NLDD Designsysteem's `nldd-text-editor`, so the document stays Markdown text. VLAM acts as a writing assistant that suggests but never writes. Sites and their page schemas are configured in a private repository. It is a SvelteKit app (Node adapter) that runs on ZAD behind SSO Rijk (Keycloak). Background: [docs/decisions](docs/decisions/README.md) and the [design](docs/superpowers/specs/2026-10-07-schrijver-design.md).

## Local development

```sh
npm install
cp .env.example .env
SCHRIJVER_FAKE_FORGE=1 SCHRIJVER_TEST_SESSION='{"sub":"dev","name":"Dev Gebruiker","email":"dev@example.org","emailVerified":true,"organisation":null,"exp":9999999999999}' npm run dev
```

- `SCHRIJVER_FAKE_FORGE=1` replaces GitHub and the configuration repository with an in-memory fake forge, seeded with the corpus of both pilot sites and a draft proposal each. No GitHub App, Keycloak or database is needed.
- `SCHRIJVER_TEST_SESSION` is a JSON session (`sub`, `name`, `email`, `emailVerified`, `organisation`, `exp` in epoch milliseconds) that skips the login.
- Both are ignored when `NODE_ENV` is `production`.

To run against real services, fill in `.env` (see `.env.example`) and follow the Keycloak check below.

## Tests

```sh
npm test            # unit tests, including the Markdown round-trip corpus
npm run check       # svelte-check
npm run lint        # prettier --check
npm run test:e2e    # Playwright against the fake forge
```

## Container and deployment

Build the container with `podman build -f Containerfile -t schrijver .` (the app listens on `PORT`). Deployment to ZAD, the secrets and the GitHub App are described in [docs/een-site-aansluiten.md](docs/een-site-aansluiten.md) and the design's deployment section ([section 10](docs/superpowers/specs/2026-10-07-schrijver-design.md)).

## Documentation

- [docs/configuratie.md](docs/configuratie.md): `sites.yaml`, schemas and writing guides, with worked examples.
- [docs/een-site-aansluiten.md](docs/een-site-aansluiten.md): connect a new site, step by step.
- [docs/identiteit-en-privacy.md](docs/identiteit-en-privacy.md): identity choices, pseudonyms, what goes to VLAM.
- [docs/decisions/README.md](docs/decisions/README.md): decision records.
- [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), [SECURITY.md](SECURITY.md), [LICENSE](LICENSE) (EUPL-1.2), [publiccode.yml](publiccode.yml).
- In the app: the help page `/help` ("Zo werkt Schrijver").

## Commands

```sh
npm run dev     # start the development server
npm test        # run the unit tests
npm run build   # production build (adapter-node, output in build/)
```

Copy `.env.example` to `.env` and fill in the values first.

## Manual check of the login against Keycloak

Schrijver signs users in through OIDC (code flow with PKCE). To try it locally against a Keycloak realm (the dev realm from `compose.yml` once it exists, or any realm you can reach):

1. In the realm, create a confidential client with the redirect URI `http://localhost:5173/login/callback` and (optionally) the post-logout redirect URI `http://localhost:5173/`. Give the test user a name and e-mail address; mark the e-mail verified to test the "Op naam" option.
2. In `.env` set `OIDC_DISCOVERY_URL` (`http://localhost:8080/realms/<realm>/.well-known/openid-configuration`), `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `SESSION_SECRET` (any long random string) and `DATABASE_SERVER_FULL` (a reachable Postgres; `db/schema.sql` is applied on the first request). Plain `http` issuers are accepted for local use.
3. Run `npm run dev` and open `http://localhost:5173/`.

Expected:

- You are redirected to `/login`, then to Keycloak. After signing in you land on `/onboarding` (first time) or `/`.
- Your name appears in the header and links to `/instellingen`. The session cookie `schrijver_sessie` is `httpOnly` and lasts 8 hours.
- `/uitloggen` clears the cookie and, when the realm advertises an end-session endpoint, ends the Keycloak session too.
- A failed or replayed callback shows "Inloggen is niet gelukt" (status 400) and logs `auth.callback_failed` as JSON on stdout, without tokens.
