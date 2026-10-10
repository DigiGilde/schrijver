# 0007: Three steps, one decision in Schrijver, four eyes

Date: 2026-10-10. Status: accepted. Builds on [0005](0005-no-approve-from-schrijver.md).

## Context

The owner looked at a sent-in proposal as a member of the redactie and could not tell what to do: the text said the next step was approving on GitHub, the only button said Samenvoegen. Schrijver cannot approve (decision 0005) but can merge, so the page showed two verbs for one decision and a step "Goedgekeurd" that Schrijver lets you skip. Nine separate things sat above the fold, three of them about GitHub. A comment of the redactie went to GitHub and never came back, and comments and reviews placed on GitHub were not shown: a writer whose proposal needed changes could not read what to change. Nothing kept a member of the redactie from merging their own proposal.

## Decision

1. **Three steps.** Concept, Ingestuurd, Samengevoegd. A proposal that is sent in, approved on GitHub or waiting for an adjustment is on Ingestuurd; a closed one has no step.
2. **One decision in Schrijver.** A member of the redactie merges ("Samenvoegen") or asks for an adjustment ("Vraag om aanpassing"). Whether the site asks for an approval on GitHub first comes from GitHub, as the pull request's `reviewDecision`, read only by the proposal page and the merge; where one is missing the page says so and links to GitHub, and when GitHub cannot tell, the merge is tried and GitHub's refusal speaks. Where a site merges on GitHub (`mergen-vanuit-schrijver: false`) the page sends the redactie there.
3. **Aanpassing gevraagd is a label.** The App cannot submit a review as the person (decision 0005), so "Vraag om aanpassing" posts the request as a comment and sets the label `aanpassing gevraagd`; "Opnieuw insturen" takes it off. A changes-requested review on GitHub counts the same and stays until it is reviewed again there. Te beoordelen counts what lies with the redactie: sent in or approved.
4. **The conversation comes into Schrijver.** Every comment and review of the pull request shows on the proposal page, in time order, rendered through the Markdown preview pipeline. The writer and the redactie react from Schrijver; the App posts the reaction with a hidden marker and one line on who wrote it, as their identity choice allows, and whether as the writer or for the redactie. That line counts only on comments of the App's own bot account, and only in exactly the form Schrijver writes; in what a user types, a line that looks like it is quoted, and HTML comments and mentions are defused.
5. **Four eyes.** With `review.vier-ogen` on (the default) nobody merges a proposal they wrote in Schrijver: the one who opened it or signed it, or anyone whose identity signed one of its commits. Where Schrijver cannot tell (no or a malformed signature, a proposal made on GitHub and no linked account to compare with, a list of commits that may be incomplete) it treats the reader as the writer. A site admin may still merge; for now that is a linked GitHub account with admin permission on the repository, behind one function that a later definition of site admins replaces.
6. **One block says what now.** Under the title one tinted block holds the step bar, one sentence on what is expected of the reader and the buttons for it, per role: the writer, a member of the redactie, anyone else.

## Consequences

- A site that requires an approving review still needs a GitHub account for that approval; the proposal page now says so in its own words instead of listing who approves.
- Comments that Schrijver posts on GitHub read "**Reactie van de redactie via Schrijver** (…)" with a hidden `<!-- schrijver -->` marker, and quote a typed line that looks like that. Mentions in a reaction no longer notify anyone on GitHub.
- Four eyes in Schrijver rest on the identity trailers and the linked GitHub account. A member of the redactie known only by e-mail address cannot merge a proposal signed with a GitHub account or made on GitHub, because Schrijver cannot tell whether it is theirs. A writer whose e-mail address changed is no longer recognised, and rotating the pseudonym secret makes earlier anonymous proposals unrecognisable too. Branch protection on GitHub remains the hard guarantee, and anyone who can merge on GitHub can still do so there.
- Reactions, requests for an adjustment and re-sends share a limit of ten per minute per person, because what they post goes out under the App's name.
- The proposal page asks GitHub for its review decision, its comments and reviews and, for four eyes, its commits on every view; these are not cached, so the page shows a decision as soon as GitHub has it.
