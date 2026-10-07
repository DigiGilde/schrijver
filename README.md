# Schrijver

Schrijver is a web app that lets colleagues edit the Markdown pages of static sites in a friendly editor and propose their changes as GitHub pull requests, without needing to know Git.

## Commands

```sh
npm install
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
