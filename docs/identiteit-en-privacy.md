# Identity and privacy

Schrijver lets a colleague propose changes without a GitHub account. This page states how the identity choices work. The processing inventory, the register draft, the DPIA advice and the open statements are in [privacy.md](privacy.md); the writing assistant is described in [ai-en-vlam.md](ai-en-vlam.md).

## Why commits are authored by the App

GitHub shows a commit made by a GitHub App as Verified only when it has no custom author or committer. Every commit in a site repository is therefore authored by the App, and the person is expressed only in trailers in the commit message and in the pull request body. Schrijver lists "my proposals" by matching that trailer in the pull request body; it has no table of proposals.

## The three identity choices

The choice is made in onboarding ("Hoe wil je je wijzigingen ondertekenen?"), can be changed in "Instellingen", and is limited per site by `identiteit.toegestaan`.

| Choice | Trailer, verbatim | Visible on GitHub |
| --- | --- | --- |
| `anoniem` (default) | `Schrijver-Auteur: <pseudonym>` | Nothing personal. |
| `gekoppeld` | `Co-authored-by: <GitHub name> <ID+login@users.noreply.github.com>` | The commit is linked to the GitHub profile; the work e-mail address is not exposed. |
| `op-naam` | `Co-authored-by: <SSO name> <SSO e-mail>` | Full name and e-mail address. |

In the code (`src/lib/forge/trailers.ts`) the `gekoppeld` name is the SSO name and the address is `${githubId}+${login}@users.noreply.github.com`. A commit message is the summary, a blank line and the trailer.

`op-naam` is only available when the identity provider reports the e-mail address as verified (`email_verified`). Publication in a public repository is permanent (see [privacy.md](privacy.md#irreversible-publication)), so `op-naam` should only be allowed where the site's settings permit it.

### Linking a GitHub account

`gekoppeld` needs a verified link: the colleague authorizes Schrijver's GitHub App for their user, and the login and id come from the authenticated `GET /user` response, never from a form field. The user token is used once and discarded. See [decision 0004](decisions/0004-github-link-verified.md).

## The pseudonym

The pseudonym is `HMAC-SHA256(PSEUDONYM_SECRET, sub)` truncated to 12 hexadecimal characters, where `sub` is the SSO subject.

- Tracing a pseudonym to a person means computing it for a candidate `sub` and comparing. There is no lookup table to leak.
- Rotating `PSEUDONYM_SECRET` changes every pseudonym. Existing commits keep the old value, and "my proposals" no longer matches proposals made under the old secret. Rotate only deliberately, and record the date.

## What is sent to VLAM

Sent: the text being worked on (the selection or the page), the instruction (a fixed action or the colleague's free prompt) and the site's writing guide (`schrijfwijzer`) as the system prompt.

Never sent: name, e-mail address, `sub`, pseudonym or GitHub login. The request goes to `VLAM_API_URL` with `VLAM_KEY_PREPAID`. The assistant only returns suggestions; the colleague applies them ("Overnemen") or discards them ("Verwerpen").

## What is logged

Logs are JSON on stdout. Forge calls and assistant requests are logged with site, operation or action, pull request number, outcome and token counts. Not logged: page content, e-mail addresses, tokens and secrets. Authentication failures are logged with a reason only.

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
| Membership: site, `sub`, role (beheerder or redactie), who added them and when. | Who decides on proposals and who manages the site. | As long as the person is on the team. |
| Invitation: site, the e-mail address the admin typed, role, who invited and when. | A colleague who has not signed in yet joins at their first login with that verified address. | 30 days, until it is claimed or revoked. An expired invitation is deleted. |
| Audit row: time, who acted (`sub`), site, what happened, the target (a `sub`, an invitation id or the names of changed settings) and the role. Never an e-mail address. | Accountability: who changed a team, an invitation or a site setting. | Two years, also after the people in it left. |
| Site: its key, the repository with GitHub's numeric id for it, the default branch, who added it (`sub`) and when. | Which repositories Schrijver works on. | As long as the site is in Schrijver. |
| Site settings: name, description, address, merging in Schrijver, four eyes, allowed signing, who changed them last. | The policy of a site. | As long as the site is in Schrijver: removing a site removes its settings, team, invitations and writer records. |
| Writer record: site, proposal number, the `sub` of each person Schrijver committed to the proposal for, and the time of their first commit. | Four eyes: whoever wrote in a proposal does not merge it ([decision 0007](decisions/0007-three-steps-and-four-eyes.md)). | Removed with the profile; until then it stays, also for closed proposals. |

- The retention runs when Schrijver starts and once a day.
- Schrijver sends no invitation e-mail; the admin tells the colleague.
- No e-mail address or `sub` goes into a URL. The team page shows names, addresses and roles to the site's beheerders and the platform admins only; "Over `<site>`" shows everyone who signs in the names of the team and who is beheerder, never an address. Everyone sees their own `sub` on Instellingen, as "Je kenmerk bij SSO Rijk".
- Platform admins are subs in the environment variable `SCHRIJVER_BEHEERDERS`, not in the database.
- Logged for team changes: the event, site, role and the actor's pseudonym; never an address or a `sub`.

## Public drafts

Both pilot repositories are public. A draft pull request is readable by anyone on the internet from the first "Concept bewaren", and a per-push preview would put the half-finished text online as a web page. Anonymity hides who wrote it, not what it says.

What Schrijver does about it:

- On a site with a public repository, "Concept bewaren" says: "Dit concept komt als voorstel op GitHub en is openbaar leesbaar, ook voordat je het instuurt." The editor shows a dimmed "Openbaar concept" line.
- The site preview should build only after "Insturen": the `preview` label is set at "Insturen" (MOZa), and Digi Handboek's `preview.yml` skips draft pull requests. See [een-site-aansluiten.md](een-site-aansluiten.md#4-set-up-the-preview).
- `concepten: privé` (drafts in a private repository) is planned and refused in version one.
