# Security

BIO checklist for Schrijver, grouped along ISO 27002 themes as a practical list. It was not checked against the BIO text itself: cite article numbers only after checking the official BIO. Source: the BIO and AVG review and the security review of 2026-10-08. Count: 25 controls, 5 covered, 15 partly, 5 missing.

Report vulnerabilities and incidents as described in [SECURITY.md](../SECURITY.md).

## Checklist

| # | Control | Status | Planned closure |
| --- | --- | --- | --- |
| 1 | Strong authentication | covered | Check that the realm enforces MFA (platform statement) |
| 2 | Session management | partly | Absolute lifetime, revocation, always call Keycloak end-session |
| 3 | Authorisation and least privilege | partly | Document the PR-body trailer residual risk. Done: the server enforces "Ondertekenen", send-in never asks the writer to review, and one server guard answers 404 under every site a user may not see (a site only its team sees, which a private repository always is) |
| 4 | Secrets management | partly | Rotation runbook with owner; refuse start when `SESSION_SECRET` or `PSEUDONYM_SECRET` is under 32 bytes |
| 5 | Least privilege of the GitHub App | partly | Mandatory branch protection on every site; the App is installed on site repositories only |
| 6 | Audit trail of who did what | partly | Changes to sites, teams, invitations and site settings are in the audit log with the actor's `sub`. Still open: an actor reference on login, save, send-in, comment, merge, identity change; decide who may resolve it |
| 7 | Log protection, retention, alerting | missing | ZAD log statement; retention (e.g. 90 days), access list, three alerts |
| 8 | No sensitive data in logs | partly | Log `err.name` and status instead of `String(err)` |
| 9 | Transport security | partly | ZAD statement on TLS to the database; `sslmode=require` if offered |
| 10 | Data at rest, key derivation | partly | HKDF per cookie purpose; ZAD at-rest statement |
| 11 | Cryptographic primitives | covered | None |
| 12 | Input validation, CSRF, headers | covered | Tighten `style-src 'unsafe-inline'` when the design system allows |
| 13 | Dependency and supply chain | partly | Dependabot, `npm audit` in CI, image scan, SBOM |
| 14 | Security testing | missing | CodeQL, ZAP baseline against a preview, pentest before go-live |
| 15 | Secure build and deploy | partly | Separate secrets, database, OIDC client and App for previews; restrict who may label; scope `GITHUB_ADMIN_TOKEN` |
| 16 | Test coverage of security behaviour | covered | None: the reviewer exclusion and "Ondertekenen" have their tests |
| 17 | Abuse and DoS protection | partly | Set `ADDRESS_HEADER` and `XFF_DEPTH` on ZAD; shared limit store if more than one replica; parse Markdown for the preview and the diff in a worker with a time limit (crafted Markdown can keep the parser busy for seconds in the browser). Already bounded: a proposal view compares at most 20 pages, fetches no page above 500 kB and gives up on a diff that grows too large ("te groot"); the image usage check takes at most 20 images, reads at most 300 text files of at most 500 kB per branch, remembers per file version what it mentions so a repeated check reads only files that changed, and runs at most 60 times per user per hour |
| 18 | Supplier agreements | missing | Statements from ZAD, SSC-ICT and GitHub, recorded here and in the register |
| 19 | Classification (BIV) and risk analysis | missing | Short BIV classification and risk table; decide the highest classification VLAM may receive |
| 20 | Exit and portability | partly | Document and test a rebuild: the database (sites, teams, settings), secrets list, GitHub App |
| 21 | Backup and restore | partly | ZAD backup statement; keep `PSEUDONYM_SECRET` in the team vault; restore test |
| 22 | Availability and continuity | partly | State RTO and RPO; document the manual fallback (edit on GitHub) |
| 23 | Incident and breach process | partly | One-page procedure: decision owner, FG/CISO contact, AP notification within 72 hours, containment (rotate secrets, revoke App installation, remove the site from Schrijver) |
| 24 | Vulnerability disclosure | covered | Optionally `/.well-known/security.txt` (RFC 9116) |
| 25 | Periodic review | missing | Quarterly review of each site's team, the platform admins (`SCHRIJVER_BEHEERDERS`) and the GitHub collaborators, noted in the CHANGELOG |

## What the code enforces

- OIDC code flow with PKCE and state; AES-256-GCM `httpOnly`, `Secure`, `SameSite=Lax` session cookie.
- CSRF: custom header on `/api/*`, origin check on forms; CSP with nonce, `frame-ancestors 'none'`, nosniff, no-referrer.
- Authorisation derived per request; paths, image types and SVG content validated server-side; alt text required.
- The preview file route reads an image only on the default branch, on a Schrijver branch of the site, or for a proposal that the request names by its number: at the commit its head points at or, with `kant=voor`, at the commit it started from. Schrijver looks both up itself, and only for a head in the site's own repository and a proposal into the default branch. A commit id from the request is never read.
- Image limits a writer can meet: at most 5 MB per image, and at most 10,000 segments or chunks per image file (JPEG segments, PNG and WebP chunks), so an animated PNG (APNG) with more than about 5,000 frames is refused.
- Only text, instruction and writing guide go to VLAM; logs hold no content, e-mail addresses or tokens.
- Webhook HMAC with constant-time compare.
- Rate limits per user per minute: the assistant 20, saves 60, uploads 60, the image usage check 30, reactions, requests for an adjustment and re-sends together 10, images read through Schrijver 600, and posts to the beheer pages and Site toevoegen 30 (loading a page does not count). Per hour: 20 new proposals and 60 image usage scans.
- Who sees a site ([decision 0009](decisions/0009-sites-only-the-team-can-see.md)): the server hook answers every request under `/sites/<id>` and `/api/sites/<id>` with 404 before any route code runs, unless the site is one colleagues can work on and the user may see it; a site that does not exist gets the same answer. A site only its team sees is open to the platform admins, its team and, on a private repository, a linked GitHub account that may read it; a private repository is always such a site, by its visibility as Schrijver last read it, and so is a repository Schrijver could not read at its last try or that GitHub just reported made private or public, until it is read again. The start page, Instellingen, onboarding, the beheer page and the assistant follow the same rule. A test runs every route file under those two folders through the hook. A failed lookup lets no one in.
- Refusals leave a trace: every refused proposal action is logged as `proposal.<action>_refused` with the site, the number and the status, every refused load or action of a beheer page or Site toevoegen as `beheer.refused`, every request under a site the user may not see as `site.refused`, and a refusal by a rate limit as `rate_limited` with its rule, once per window of that limit per user and rule; all with the actor's pseudonym, never an address or a `sub`. A request without a session, which a rate limit counts by its address, logs the rule only.
- Four eyes, where a site has it on: Schrijver records by `sub` who writes in a proposal, and an editor who wrote in it does not merge it in Schrijver; the site's admins may. When Schrijver cannot tell who wrote, it refuses.
- Team, invitation, site and site settings changes go to the audit log with the actor's `sub`, never an e-mail address; retention as in [identiteit-en-privacy.md](identiteit-en-privacy.md#team-management).
- An image is deleted only in the save of the page that showed it: the page's text on the branch referred to it before the save and the new text does not, also not by its site-root path. The server also checks that the image lies in the site's image folder but not under `content.uitsluiten` or in the image folder of a page there, that it is present on the branch, and that no other text file under the content folder (Markdown, HTML, YAML, JSON, TOML, CSS) uses it, on the proposal branch or on the default branch. A file uses the image when it refers to its path, and possibly uses it when it names the image's file anywhere, unless a path in that file reaches another existing file of that name; a possible use keeps the image too, and Schrijver then says it is "mogelijk gebruikt". Remaining limit: a file that shows another image of the same name by its path, and names this one by its file name only, does not keep it. A tree listing GitHub cut off, a file too large to read or more than 300 files make the check incomplete, and then nothing is deleted. The usage check answers with page paths and titles only.
- Deletions leave a trace: the save log counts the deleted files, a refused deletion is logged with a reason code and the actor pseudonym (never a path), and the commit lists each deleted file on a `Verwijderd:` line.
- Merging in Schrijver refuses a pull request that removes an image a page would still show after the merge, and names that page. It also refuses a pull request whose added or changed text files newly show an image that will not exist after the merge, on neither the base branch nor among its own files, and names the page and the image: once a deletion is merged, an older proposal that shows the deleted image is not merged in Schrijver. A reference the base version of the file holds already is not checked, as the merge does not add it. GitHub lists at most 3,000 files of a pull request, so at that many Schrijver cannot see them all and refuses the merge with a pointer to GitHub; it does the same when the pull request changes more than 300 text files under the content folder, or one too large to read, and when GitHub lists as many commits of it as it gives (250): the head cannot then be checked against the list, and four eyes cannot tell who wrote the rest. Remaining limit: a merge done on GitHub is not checked, so there a deletion and an older proposal that shows the image can still break a page. A page the pull request changes is read as the pull request leaves it, so a reference the default branch added to that same page in the meantime is missed when GitHub merges the two versions of the page.
- Dev bypasses refuse to start outside development and test, and the e2e override of the hourly limit on new proposals counts only there; non-root container, base image and actions pinned.

## Questions for ZAD

- Keycloak realm: is `email_verified` only true for addresses asserted by SSO Rijk; is self-registration off and the e-mail read-only? An invitation to a team is claimed with a verified address.
- Who can sign in: every SSO Rijk user, or can the realm or client restrict by organisation or group? Does SSO Rijk offer MFA or an `acr` value to require for merge?
- Realm session lifetimes and the `sub` format (pairwise or not).
- Does the ingress set `X-Forwarded-For` reliably, with which `XFF_DEPTH`, and does it enforce its own body limit and timeouts?
- Log retention and access suitable for an audit trail.
- What `clone-from: production` copies into previews (variables, secrets, database), and who can trigger it.
- TLS policy of the ingress and of the database connection; encryption at rest.
- Backups and restore (see [privacy.md](privacy.md)); secret store access for platform admins.
- Incident contact and breach notification time.
