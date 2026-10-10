# Identity and privacy

Schrijver lets a colleague propose changes without a GitHub account. This page states how the identity choices work. The processing inventory, the register draft, the DPIA advice and the open statements are in [privacy.md](privacy.md); the writing assistant is described in [ai-en-vlam.md](ai-en-vlam.md).

## Why commits are authored by the App

GitHub shows a commit made by a GitHub App as Verified only when it has no custom author or committer. Every commit in a site repository is therefore authored by the App, and the person is expressed only in trailers in the commit message and in the pull request body. Schrijver lists "my proposals" by matching that trailer in the pull request body, not from its own records. It does keep one record per proposal: while a proposal is open, Schrijver's database links it to the SSO account of each writer, also an anonymous one, for four eyes (the writer record under [team management](#team-management)).

## The three identity choices

The choice is made in onboarding ("Hoe wil je je wijzigingen ondertekenen?"), can be changed in "Instellingen", and is limited per site by the site setting "Ondertekenen".

| Choice | Trailer, verbatim | Visible on GitHub |
| --- | --- | --- |
| `anoniem` (default) | `Schrijver-Auteur: <pseudonym>` | Nothing personal. |
| `gekoppeld` | `Co-authored-by: <GitHub login> <ID+login@users.noreply.github.com>` | The commit is linked to the GitHub profile; the work e-mail address is not exposed. |
| `op-naam` | `Co-authored-by: <SSO name> <SSO e-mail>` | Full name and e-mail address. |

In the code (`src/lib/forge/trailers.ts`) the `gekoppeld` name is the GitHub login, not the SSO name, so a pseudonymous GitHub profile stays pseudonymous, and the address is `${githubId}+${login}@users.noreply.github.com`. A commit message is the summary, a blank line and the trailer.

`op-naam` is only available when the identity provider reports the e-mail address as verified (`email_verified`). Publication in a public repository is permanent (see [privacy.md](privacy.md#irreversible-publication)), so `op-naam` should only be allowed where the site's settings permit it.

### Linking a GitHub account

`gekoppeld` needs a verified link: the colleague authorizes Schrijver's GitHub App for their user, and the login and id come from the authenticated `GET /user` response, never from a form field. The user token is used once and discarded. See [decision 0004](decisions/0004-github-link-verified.md).

## The pseudonym

The pseudonym is `HMAC-SHA256(PSEUDONYM_SECRET, sub)` truncated to 12 hexadecimal characters, where `sub` is the SSO subject.

- Outside Schrijver, tracing a pseudonym to a person means computing it for a candidate `sub` and comparing. Inside Schrijver's database it takes no secret for an open proposal: its writer record holds the `sub` of each writer, also of one who signed anonymously, so whoever can read the database (an operator, a backup) can see who wrote it. That link goes when the proposal is merged or closed, and at the latest 183 days after the writer's first commit in it.
- Rotating `PSEUDONYM_SECRET` changes every pseudonym. Existing commits keep the old value, and "my proposals" no longer matches proposals made under the old secret. Rotate only deliberately, and record the date.

## What is sent to VLAM

Sent: the text being worked on (the selection or the page), the instruction (a fixed action or the colleague's free prompt) and the site's writing guide (`schrijfwijzer`) as the system prompt.

Never sent: name, e-mail address, `sub`, pseudonym or GitHub login. The request goes to `VLAM_API_URL` with `VLAM_KEY_PREPAID`. The assistant only returns suggestions; the colleague applies them ("Neem suggestie over") or discards them ("Verwerp suggestie").

## What is logged

Logs are JSON on stdout. Forge calls and assistant requests are logged with site, operation or action, pull request number, outcome and token counts. What a user does or is refused carries their pseudonym (`actor`), among them saves, proposal actions, team changes, a change of their choice at Ondertekenen or of their linked GitHub account, every refused proposal action or beheer request, every request under a site they may not see, and a refusal by a rate limit. An error is logged by its kind and status, not its message. Not logged: page content, e-mail addresses, `sub`, tokens and secrets. Authentication failures are logged with a reason only.

## What is stored

- Session: an encrypted (AES-256-GCM), `httpOnly` cookie `schrijver_sessie` with `sub`, name, e-mail, verification flag and organisation. Lifetime 8 hours, renewed when fewer than 4 hours remain (sliding). No session table.
- Database: user preferences keyed by `sub` (identity choice, GitHub login, GitHub user id, onboarding flag), and the sites, profiles, teams, invitations, writer records, site settings and audit log of [team management](#team-management).
- Browser: an unsaved draft is kept in `localStorage` per branch until a save succeeds.
- Everything else is in the forge.

## Team management

The list of sites, who is on a site's team and the settings of a site live in Schrijver's database and are managed under Instellingen ([decision 0008](decisions/0008-people-in-schrijver-structure-in-the-site.md)). A person is their SSO `sub`; the e-mail address is only display data and a handle to invite someone.

| What | Why | How long |
| --- | --- | --- |
| Profile, with the user preferences: name, e-mail address and time of the last login. The address only when the identity provider verified it, lower-cased; otherwise none. | To show a team by name and address, and to recognise a colleague an admin adds by e-mail address. | Saved again at every login. Removed with the preferences twelve months after the last login, for someone on no team. |
| Membership: site, `sub`, role (beheerder, redactie or bijdrager), who added them and when. | Who decides on proposals, who manages the site, and who sees a site only its team sees. | As long as the person is on the team. |
| Invitation: site, the e-mail address the admin typed, role, who invited and when. | A colleague who has not signed in yet joins at their first login with that verified address. | 30 days, until it is claimed or revoked. An expired invitation is deleted. |
| Audit row: time, who acted (`sub`), site, what happened, the target (a `sub`, an invitation id, the names of the changed settings or of the changed columns of a site, or for a site added or removed its repository) and the role. Never an e-mail address. | Accountability: who changed the list of sites, a team, an invitation or a site setting. | Two years, also after the people in it left. |
| Site: its key, the repository with GitHub's numeric id for it, the default branch, who added it (`sub`) and when. | Which repositories Schrijver works on. | As long as the site is in Schrijver. |
| Site settings: name, description, address, who sees the site, merging in Schrijver, four eyes, allowed signing, who changed them last. | The policy of a site. | As long as the site is in Schrijver: removing a site removes its settings, team, invitations and writer records. |
| Writer record: site, proposal number, the `sub` of each person Schrijver committed to the proposal for, and the time of their first commit. It links the proposal, also an anonymous one, to the SSO account of each writer. | Four eyes: whoever wrote in a proposal does not merge it ([decision 0007](decisions/0007-three-steps-and-four-eyes.md)). | While the proposal is open. Removed when it is merged or closed (GitHub's event on the pull request, or the merge in Schrijver), and at the latest 183 days after the writer's first commit in it; also with the profile, and with the site. |

- The retention runs when Schrijver starts and once a day.
- Schrijver sends no invitation e-mail; the admin tells the colleague.
- No e-mail address or `sub` goes into a URL, and no `sub` into the data of a page or a form other than the user's own: the beheer page knows a member by a key per site and member. The team page shows names, addresses and roles to the site's admins only, if they may see the site: its beheerders, the platform admins, and anyone whose linked GitHub account has admin permission on the repository, which on a private repository can be someone outside the team; "Over `<site>`" shows everyone who may see the site the names of its redactie and who is beheerder, never an address, and no bijdrager. Everyone sees their own `sub` on Instellingen, as "Je kenmerk bij SSO Rijk".
- Platform admins are subs in the environment variable `SCHRIJVER_BEHEERDERS`, not in the database.
- Logged for team changes, for every refused beheer request or proposal action, and for every request refused because the user may not see the site (`site.refused`): the event, site, role or status and the actor's pseudonym; never an address or a `sub`.

## Who reads a site in Schrijver

Schrijver reads GitHub with the rights of its App, not with the colleague's, so Schrijver itself decides who reads a site's pages, its proposals, their changes and their conversation ([decision 0009](decisions/0009-sites-only-the-team-can-see.md)):

- **A site everyone sees** ("Iedereen die inlogt", only with a public repository): everyone who signs in, as anyone can on GitHub.
- **A site only its team sees** ("Alleen het team": always for a private repository, and a choice of its admins for a public one): the platform admins, the members of its team in any role and, for a private repository, colleagues whose linked GitHub account may read the repository. Anyone else gets the page that does not exist, as for a site that does not exist, and does not find the site on the start page or under Instellingen.

What GitHub shows stays as GitHub decides: a public repository is readable by anyone there, whoever Schrijver shows the site to.

## Public drafts

Both pilot repositories are public. A draft pull request is readable by anyone on the internet from the first "Bewaar", and a per-push preview would put the half-finished text online as a web page. Anonymity hides who wrote it, not what it says.

What Schrijver does about it:

- On a site with a public repository the editor explains once, before the first save on that site: "Je concept wordt openbaar", "Iedereen kan het op GitHub lezen zodra je het bewaart, ook voordat je het instuurt." The editor shows a dimmed "Openbaar concept" line.
- The site preview should build only after "Stuur in": the `preview` label is set at "Stuur in" (MOZa), and Digi Handboek's `preview.yml` skips draft pull requests. See [een-site-aansluiten.md](een-site-aansluiten.md#4-set-up-the-preview).
- A site with a private repository warns about nothing: a draft there is readable only by those GitHub lets read the repository and, in Schrijver, by whoever may see the site ([Who reads a site in Schrijver](#who-reads-a-site-in-schrijver)).
- `concepten: privé` (drafts in a private repository of their own, for a site whose repository is public) is planned and refused in version one.
