# Compliance reviews

Three read-only reviews of the v1 branch were done on 2026-10-08. The full reports are in the project's internal workspace and are not copied here. The documentation they produced is in this folder's parent.

| Review | Top findings | Status |
| --- | --- | --- |
| Security | 2 high: a quadratic regex in the alt-text check can block the server; the review page does not show what will be merged. 9 medium, including merge not pinned to the reviewed commit, `identiteit.toegestaan` never enforced, sessions that slide forever, no audit trail | Fixed in code: linear alt-text check, review page shows the head commit that a pinned merge merges, `identiteit.toegestaan` enforced, 12-hour absolute session limit, structured logs of saves and proposal actions |
| BIO and AVG | 20 gaps of 25 controls. Reviewer request can de-anonymise an anonymous author; irreversible publication of names and e-mail in public history; no register entry, DPIA decision or processor statements | Documented in [privacy.md](../privacy.md) and [beveiliging.md](../beveiliging.md); code fixes done (no reviewers requested for anonymous authors); statements from ZAD and SSC-ICT open |
| WCAG 2.2 AA, NeRDS, public code | 15 accessibility issues (wrong `aria-expanded`, lost focus, unannounced errors), 8 NeRDS gaps (accessibility statement, privacy, AI, open source), 11 public-code gaps (design document link, Code of Conduct, review rule) | Accessibility issues fixed in code (axe and pa11y pass); documentation done: [toegankelijkheid.md](../toegankelijkheid.md), [ai-en-vlam.md](../ai-en-vlam.md), Code of Conduct, NOTICE; manual audit and publication of the repository open |
