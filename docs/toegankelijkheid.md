# Accessibility

Input for the "toegankelijkheidsverklaring" of Schrijver (Besluit digitale toegankelijkheid overheid). Status: **partly compliant, not yet audited manually.** Standard: WCAG 2.2 level AA, EN 301 549. The design system under test is `@nldd/design-system` 0.8.96. This page is a draft; the published verklaring in the format of digitoegankelijk.nl follows after the manual audit below.

## Tested automatically

All checks run against the fake forge (`SCHRIJVER_FAKE_FORGE=1`) at a desktop width of 1280 px.

| Check | Tool | Pages |
| --- | --- | --- |
| Rule scan, WCAG 2.2 AA tags, light and dark mode | axe-core in Playwright (`tests/e2e/axe.spec.ts`) | `/`, a site page, the editor (closed state), proposal 1, the Over page, `/help`, `/instellingen`, `/onboarding`, Nieuwe pagina on both sites |
| Rule scan of screens in a state, light and dark mode | axe-core in the flow tests | The beheer page and its role sheet (`beheer.spec.ts`); Site toevoegen with a refusal and with field errors in step 2, the beheer page of a site whose structure is wrong and the dialog that removes a site (`site-toevoegen.spec.ts`); the seeded proposals, with their conversation and Wat er verandert, among them one whose page changed on the site and one with a request for changes made on GitHub (`voorstel.spec.ts`); the Schrijfhulp panel with a suggestion and the comparison in the text column (`vraag-de-schrijfhulp.spec.ts`); the question about images no page uses (`weghalen.spec.ts`); the image dialog (`afbeelding.spec.ts`) |
| Rule scan with two runners | pa11y-ci, axe and htmlcs (`.pa11yci`, runs in CI) | `/`, `/sites/digi-handboek`, `/sites/digi-handboek/bewerken/index.md`, `/sites/digi-handboek/voorstellen/1`, `/sites/digi-handboek/over`, `/help`, `/instellingen`, `/onboarding`, Nieuwe pagina on both sites, the beheer page of Digi Handboek, Site toevoegen |
| Keyboard walkthrough | Playwright (`tests/e2e/toegankelijkheid.spec.ts`) | Skip link and focus into `main`; Tab from the site page into the editor; every Tab stop has a visible, uncovered focus indicator; Ctrl+S saves; Shift+Tab from the editor reaches Schrijfhulp; Enter toggles the panel; forms have a submit control |

pa11y ignores `H32.2` (form without submit button) on the editor, proposal, settings, onboarding, Nieuwe pagina, beheer and Site toevoegen pages; the keyboard test covers the submit control for proposal and settings.

The back button of `nldd-top-title-bar` draws a pseudo-element behind its text, so axe cannot resolve its contrast and returns it as "incomplete" (`pseudoContent`). The Playwright axe test allows exactly that node; pa11y counts incomplete results as errors, so `.pa11yci` hides the title bar. The same holds for the current row of a list (the open folder): its fill is a pseudo-element, the Playwright test allows that node, `.pa11yci` hides `nldd-list-item[current]`, and the contrast was measured by hand (15.5:1 in light mode, 9.8:1 in dark mode). The step bar on a proposal draws its track as a pseudo-element across the steps: the Playwright test allows its numbers and labels, `.pa11yci` hides `nldd-step-bar`, and the contrast was measured by hand (in both modes at least 4.5:1 for the numbers and 6.2:1 for the labels). The document's scroll padding keeps a focused element clear of the sticky app bar and title bar (WCAG 2.4.11), checked by the keyboard walkthrough. CodeMirror in the editor ignores that padding; Schrijver scrolls the window itself when the caret would slide behind the bars, checked by an e2e test that walks the caret up through a long page. On a viewport of 500 px high or less nothing sticks and the padding goes, checked at 320 by 256 px.

## Known issues

Rows 1 to 12 were found by code review on 2026-10-08; "Code wave" marks what the follow-up code change addresses. Rows 13 to 16 come from the review of the screens of iteration 4 on 2026-10-10: the beheer page with its sheet and dialogs, Site toevoegen, the conversation form and the Schrijfhulp comparison.

| # | Criterion | Issue | Workaround | Status |
| --- | --- | --- | --- | --- |
| 1 | 4.1.2 | The Schrijfhulp button announces `aria-expanded="true"` while the panel is closed; the panel has no accessible name | The panel is usable and its state is visible | Code wave (aria-expanded and panel label) |
| 2 | 2.4.3 | Focus is lost after "Overnemen" or "Verwerpen" and after choosing in the save-conflict dialog | Press Tab or Shift+Tab to return to the editor | Code wave (focus management) |
| 3 | 3.3.1, 3.3.3, 4.1.3 | Form errors are not announced and focus does not move to the first error; Mermaid errors give a line number without a way to jump | Read the alert area above the save button | Code wave (error announcement) |
| 4 | 3.3.2 | Disabled buttons give no reason: image button on sites without images, "Gekoppeld aan GitHub" before linking, "Invoegen" without alt text | Fill in the alt text; link GitHub in "Instellingen" | Open |
| 5 | 3.3.2 | "Nieuwe pagina" uses plain browser controls and is not covered by axe or pa11y | None needed; the controls are native | Fixed: axe and pa11y scan Nieuwe pagina on both sites |
| 6 | 2.4.1, 1.3.1 | Default SvelteKit error pages and the failed-login page are unstyled and have no skip link or `main` | Use the link back to the start page | Fixed for Schrijver's error page and the failed-login page, which now render in the application shell; SvelteKit's static fallback, shown only when the shell itself fails, stays plain |
| 7 | 1.4.3, 4.1.2 | The text editor (`nldd-text-editor`, CodeMirror based) is a third-party component: contrast of some lines and screen-reader behaviour of the Markdown surface are not fully tested | None | Open, to report upstream to the NLDD Designsysteem |
| 8 | 2.1.1 (advisory) | The toolbar has `role="toolbar"` but every button is a separate Tab stop | Tab through, or jump past with the mouse | Open |
| 9 | 1.4.4, 1.4.10, 1.4.12 | Zoom is tested only in part and text spacing not at all. Measured at 320 by 256 px (a 1280 by 1024 screen at 400%): the sticky page header and the editor toolbar kept 158 of 256 px in view and the scroll padding was 166 px. Below 1008 px, so also on a 1280 px screen at 150% or 200%, the public-draft explanation did not show at all | None | Partly fixed: at a viewport height of 500 px or less neither bar sticks and the scroll padding goes, so the text gets the window; below 1008 px the public-draft explanation is a banner above the toolbar; below 641 px the title button is an icon, so a long title keeps its words whole. Tested at 320 by 256, 400 and 900 px; 320 px reflow on the start page, a site page, a proposal, the editor and settings. 200% and 400% on every route and text spacing still need the manual audit |
| 10 | 3.2.5 (advisory) | Links that open in a new tab do not say so | None | Open |
| 11 | 4.1.3 | Success messages are inserted already filled and may not be announced consistently | None | Open |
| 12 | 3.3.3 | When the session lapses during editing, "Opslaan is mislukt" does not say why; the local draft survives | Sign in again; the draft is kept | Open |
| 13 | 2.4.3 | After a successful "Voeg toe" or "Bewaar" on the beheer page the focus went to the top of the page | Tab back to the form | Fixed: the focus returns to the e-mail field after "Voeg toe" and to "Bewaar" after saving the settings of the site |
| 14 | 1.3.1, 2.4.6 (advisory) | Headings in a reaction, in Wat er verandert and in the Schrijfhulp comparison entered the outline of the page at their own level, so a reaction could add a top-level heading | None | Fixed: they keep their look and get `aria-level` below the heading they sit under |
| 15 | 3.3.2 | While a Schrijfhulp comparison showed, the formatting buttons were disabled without a reason; in the form for a request for an adjustment "Annuleer" sat next to the primary button; an empty reaction kept the focus on the button | None | Fixed: the buttons are hidden during a comparison, the way back is a link in the help text, and an empty reaction puts the focus on the field |
| 16 | 4.1.3 | A result may be spoken twice: the proposal page, the beheer page, its sheet and Site toevoegen write it into a persistent status region and also show a banner, which has a role of its own | None needed | Open, to verify with NVDA and VoiceOver (see below) |

## Still needs a manual audit

- Screen reader pass with NVDA and VoiceOver on the editor: toolbar toggles, the Markdown surface, Schrijfhulp state changes, save result, conflict dialog, image dialog.
- Screen reader pass with NVDA and VoiceOver on the screens of iteration 4: the beheer page (the team list, the role sheet, the dialogs for leaving the team and for removing a site, adding a colleague, the settings of the site), Site toevoegen (both steps and every refusal), the conversation form on the proposal page (a reaction, "Vraag om aanpassing" and the link back, an empty submit) and the Schrijfhulp comparison (the view switch, "Overnemen" and "Verwerpen").
- Whether a result is spoken twice (known issue 16): on the proposal page, the beheer page, its sheet and Site toevoegen, check with NVDA and VoiceOver whether a result is read once by the status region and again by the banner. If it repeats, keep the region and leave it empty while a banner shows.
- Zoom to 200% and 400% on every route, including the editor with Schrijfhulp beside the text and the three views of the proposal diff.
- Text spacing (1.4.12), forced colors, reduced motion and dark-mode screenshots.
- Dialog and assistant states, which the automated scans only see closed: image dialog open, assistant with a suggestion, error banners, save conflict, draft-restore banner, read-only banner, validation errors.
- Pages missing from the scans: the login-failed page and the error pages.
- Keyboard: "Concept bewaren" in the sticky title bar, the properties sheet, opening the image dialog and Esc, the conflict flow.
- Voice control: visible labels match accessible names (2.5.3).
- A short user test with a screen-reader user and a keyboard-only user on the whole task: edit, save, send in.

## Reporting a problem

E-mail digigilde@rijksoverheid.nl. Unresolved complaints can go to the Nederlandse Digitale Dienst or through digitoegankelijk.nl. The in-app help page links here.
