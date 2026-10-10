# 0005: No "Goedkeuren" from Schrijver in version one

Date: 2026-10-08. Status: accepted.

[0007](0007-three-steps-and-four-eyes.md) builds on this: one decision in Schrijver (merge or ask for an adjustment), the conversation in Schrijver and four eyes.

## Context

Schrijver acts on GitHub as a GitHub App: the App opens the pull request and is its author (decision 0002, spec 7.2). GitHub does not let a pull request author approve its own pull request, and an approval posted with the App token would belong to the bot, not to the editorial member who clicked. On a site with a required human review (MOZa) such an approval would count for nothing, and on every site the button would be refused.

## Decision

Version one offers no "Goedkeuren" button. The review page in Schrijver offers "Opmerking plaatsen" (posted by the App with the prefix "Opmerking van de redactie via Schrijver") and "Samenvoegen" (when the site allows it and the person is editorial), plus a link "Beoordelen op GitHub" for the formal approval. GitHub's branch protection remains the judge: on a site that requires an approving review, merging from Schrijver succeeds only after a human approved on GitHub, and the refusal is shown verbatim otherwise.

## Consequences

- Editorial members on sites with required reviews need a GitHub account for the approval step. The linked-account route (decision 0004) makes that identity verifiable.
- Merging from Schrijver stays possible everywhere branch protection allows it.
- A later version can add approval with a user token obtained through the GitHub App user-authorization flow, which Schrijver deliberately does not keep today.
