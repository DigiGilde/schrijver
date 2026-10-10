# 0008: People in Schrijver, structure in the site

Date: 2026-10-10. Status: accepted.

## Context

The editorial team of a site is a list of e-mail addresses in `sites.yaml`, in a private configuration repository, and nobody can change it in Schrijver. The owner asked: "Through the site you must be able to edit sites.yaml. Always an admin, so through Instellingen you decide who the team is. What is the benefit of sites.yaml? Why e-mail and not a unique identifier?"

Three central government apps answer the same question. ZAD keeps people and configuration in one central YAML written by people, the UI and bots, and pays for it with last-write-wins and a cache that overwrote git. Plak and Invulhulpen keep people in Postgres, keyed by the SSO subject, with the e-mail address only as a handle to invite someone; Invulhulpen moves to a separate invitations table after living with e-mail placeholders. All three are one deployment with tenants inside.

## Decision

1. **One central Schrijver.** A deployment per site would repeat the GitHub App, the SSO client, the database, the secrets and every upgrade, and each extra ZAD hostname needs a platform approval. Each site keeps its own address inside Schrijver (`/sites/<id>`), a live site can link straight to the editor, and an own hostname per site stays possible on the same deployment.
2. **Split by who changes it and how often.** People and policy change often and are changed by site admins: they live in Postgres and are managed in Schrijver. The structure of a site (content folder, file pattern, page schema, preview, Mermaid colours, writing guide) changes with the site's code: it moves into the site's own repository, reviewed by pull request. The central `sites.yaml` and the configuration repository go away.
3. **Identity is the SSO `sub`, never the e-mail address.** Addresses change and can be reused. An address is an invitation handle and display data, stored lower-cased, only when the identity provider verified it, and not unique. An invitation binds to a `sub` at the first login with that verified address and expires after 30 days. No e-mail address or `sub` goes into a URL: members are addressed by an opaque key in the request body.
4. **Tiny roles, checked on the server at every write.** Platform admins ("Schrijver-beheerder") are the subs in `SCHRIJVER_BEHEERDERS`; they manage every site, so no site can be locked out. A beheerder manages a site's team and settings and is editorial too; the redactie decides on proposals; everyone signed in may propose. A linked GitHub account with write permission on the repository counts as redactie, with admin permission as beheerder. A site always keeps one beheerder in the table, unless a platform admin removes the last one on purpose.
5. **Four eyes is a site setting, on by default.** Nobody merges a proposal they wrote, unless they are a beheerder or a platform admin (decision 0007 brings the switch).
6. **Accountability and privacy.** Every change to the list of sites, a team, an invitation or a site setting writes an audit row (who, site, action, target key, role, time; never an e-mail address), kept for two years. The profile and preferences of someone not seen for twelve months who is on no team are removed. No invitation e-mail is sent: the admin tells the colleague.

## Consequences

- `user_prefs` gains the profile (name, verified e-mail, last login), saved at every login. New tables hold the sites, their settings, the members, the invitations, the writers Schrijver recorded per proposal and the audit log (`db/schema.sql`).
- A platform admin adds a site with "Site toevoegen": its repository, bound by GitHub's numeric repository id so a rename is followed, its settings and a first beheerder, in one transaction. "Site verwijderen" removes the site with its team, invitations and writer records; the audit rows stay.
- Changing a role or removing someone locks the site's memberships in one transaction, so two admins who remove each other at the same moment cannot leave the site without a beheerder.
- Operators set the platform admins. Instellingen shows everyone their own `sub` as "Je kenmerk bij SSO Rijk", to hand to an operator. Whether the `sub` from ZAD's Keycloak is the persistent NameID of SSO Rijk is to be verified on the real realm.
- Team lists are personal data; [identiteit-en-privacy.md](../identiteit-en-privacy.md#team-management) says what is stored, why and for how long.
- The local preview and the test session keep the sites and people in memory, with a few known colleagues.

## Stages

Both stages are in the same version.

- **Stage 1, people and settings in the database:** the tables and stores, the profile and invitations at login, the roles, the beheer screens under Instellingen, the audit log and the retention; editorial membership, the four-eyes admin check and every reader of the site settings use the tables.
- **Stage 2, structure in the site repository:** `.schrijver/site.yaml`, the page schema and the writing guide per site, read from the default branch and reloaded on a push to it; the list of sites in the database, with "Site toevoegen" and "Site verwijderen" for platform admins; the central configuration repository removed.
