# 0004: Linking a GitHub account requires proof of ownership

Date: 2026-10-08. Status: accepted.

## Context

The onboarding form let a colleague type any GitHub login to "link" it. Schrijver would then write `Co-authored-by` trailers for that account and, worse, grant editorial rights when that login has push permission on a site repository. A free-text login is a privilege escalation: claim a maintainer's name, become editorial.

## Decision

A GitHub link is only stored after the colleague authorises Schrijver's GitHub App for their user (the App's "user authorization" OAuth flow, with state bound to the session). The login and id come from the authenticated `GET /user` response, never from a form field. Until then the identity choice "gekoppeld" is unavailable and the editorial check has only the e-mail route.

## Consequences

- Two extra secrets: the GitHub App's client id and client secret (`GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`).
- The user token obtained in the flow is used once for `GET /user` and discarded; Schrijver keeps no user tokens.
- The free-text field is removed from onboarding and settings.
