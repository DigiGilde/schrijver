# 0002: The forge is the only state

Date: 2026-10-07. Status: accepted.

## Context

Colleagues who do not use Schrijver will keep opening and merging pull requests on GitHub. A tool with its own proposal database would drift from GitHub and hide those PRs. The review model must be configurable per site and merging must be possible from Schrijver.

## Decision

A proposal is a branch plus a pull request, from the first save on. Schrijver stores no proposals; it lists them from GitHub. Its own state is limited to the configuration repository and one table of user preferences. GitHub branch protection stays the final judge; refusals are shown verbatim.

## Consequences

- PRs made outside Schrijver appear in Schrijver, and Schrijver's PRs are ordinary PRs on GitHub.
- Drafts on a public repository are public from the first save (see spec section 7.4). Version one is explicit about that in the UI and keeps site previews until send-in; a private draft repository is the planned next step.
- Every save is a commit. Squash on merge keeps history readable.
- A Forgejo adapter is one more implementation of the same eight operations.
