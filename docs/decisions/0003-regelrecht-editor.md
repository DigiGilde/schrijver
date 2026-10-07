# 0003: What Schrijver takes from the RegelRecht editor

Date: 2026-10-07. Status: accepted.

## Context

RegelRecht (MinBZK) has a law editor: Vue 3 frontend, Rust/Axum `editor-api`, `nldd-text-editor` for article text, git as source of truth (`MinBZK/regelrecht-corpus` and private traject repos), Postgres for metadata only. We looked at it before building Schrijver to decide whether to reuse it or learn from it.

## Decision

Build Schrijver separately. The domain differs (law YAML with machine-readable sections versus Markdown pages of static sites), the stack differs (Rust/Vue versus TypeScript/SvelteKit) and RegelRecht explicitly parked the GitHub App route we need. We adopt its patterns where they apply:

1. **Git as truth, database for metadata only.** Identical to 0002.
2. **One stable branch per unit of work with an automatically maintained PR.** Schrijver's branch per draft plus draft PR is the same shape.
3. **Optimistic concurrency on blob SHA** (their `If-Match` chain). Schrijver compares the loaded blob SHA before each save.
4. **Local draft in `localStorage`, promoted to the repository on save.** Schrijver's safety net.
5. **Pre-flight checks with specific errors** (missing config, bad credentials, no write access, missing repo or branch) instead of generic failures. Schrijver's `ForgeError` carries status and verbatim detail.
6. **Conditional GETs with ETags** for repository reads, to stay within rate limits.
7. **Require a verified e-mail claim** before trusting the e-mail for anything: Schrijver uses `email_verified` for the editorial match and the "op naam" identity.

We deliberately differ on commit identity. RegelRecht sets the user as author and the service as committer, which loses GitHub's "Verified" mark. Schrijver keeps the App as author and committer so every commit is Verified, and puts the person in a trailer (`Schrijver-Auteur` pseudonym or `Co-authored-by`). RegelRecht's own notes list weak per-user audit on push events and PAT expiry outages as pain points; the GitHub App with trailers addresses both.

## Consequences

- No code is shared with RegelRecht in version one. If a Forgejo adapter or a corpus-style federation is needed later, their `packages/github` and RFC-010 are the first place to look.
- Spec section 9 gains the `email_verified` requirement.
