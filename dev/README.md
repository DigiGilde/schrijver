# Local development stack

Start the stack with `podman compose up --build`. The app answers on http://localhost:8080 (`/healthz`), Keycloak on http://keycloak:8081 (admin / admin).

Log in to the app as `test` / `test`.

Minimal `.env` for this stack (copy `.env.example` and set at least):

```
OIDC_DISCOVERY_URL=http://keycloak:8081/realms/schrijver-dev/.well-known/openid-configuration
OIDC_CLIENT_ID=schrijver
OIDC_CLIENT_SECRET=dev-secret
ORIGIN=http://localhost:8080
PORT=8080
DATABASE_SERVER_FULL=postgres://schrijver:schrijver@db:5432/schrijver
SESSION_SECRET=<long random string>
PSEUDONYM_SECRET=<long random string>
```

Keycloak announces itself as `http://keycloak:8081` to both the app container and the browser, so add `127.0.0.1 keycloak` to `/etc/hosts` on the host. The GitHub App and VLAM variables are only needed for the features that use them.
