# Security policy

## Reporting a vulnerability

Do not open a public issue for a security problem. Report it privately to the maintainers by e-mail at robbert@askanna.io, or through the private vulnerability reporting of the GitHub repository when it is enabled. Include what you found, how to reproduce it and the impact.

We acknowledge a report within five working days and keep you informed until it is fixed.

## Platform

Schrijver runs on ZAD. Problems with the platform itself (ingress, cluster, Keycloak service) go through the ZAD platform's own reporting process; tell us as well if Schrijver is affected.

## Bounty

There is no bug bounty.

## Secrets

If you find a leaked secret (GitHub App private key, `SESSION_SECRET`, `PSEUDONYM_SECRET`, VLAM key), report it at once so it can be rotated.
