# 0006: NLDD application shell, preview on demand, coloured diff

Date: 2026-10-08. Status: accepted.

## Context

The owner's first look at v1 in the local preview: content hugs the left edge and does not line up with the header, the Rijkslint takes room and the app name is not a link home, the editor has no way back, the editor shows formatting inline and a full preview next to it ("lijkt dubbelop"), the page list is cramped, and a reviewer has to hunt for what changed in a proposal. The owner points at the RegelRecht editor and Plak as apps that give content more room.

The NLDD design system distinguishes two compositions: an application (panes, toolbars, a page per pane) and a content page (top navigation bar with the Rijkslint, a stack of sections). v1 used the content-page composition for what is an application. Both sibling apps use the application form without the ribbon; RegelRecht's Markdown document editor has "live-styled source, no separate preview" and puts properties in a right-hand sheet.

## Decision

1. **Application shell.** `nldd-app-view` > `nldd-page` with the app bar in the page's sticky header, so there is no `nldd-bar-split-view` and no divider under the app bar. A wordmark links home, and a plain "Menu" replaces the account button: the signed-in user in the menu header, then Sites, Help and, under "Account", Instellingen and Uitloggen. No `nldd-top-navigation-bar`, so no Rijkslint. Every route renders through one page component: a column that lines up with the app bar, and a sticky `nldd-top-title-bar` with a back button wherever there is a way back.
2. **One writing surface.** The hybrid `nldd-text-editor` is the editor; "Voorbeeld" is a view switch in the editor toolbar for what the editor cannot show (images, Mermaid, the rendered page). The save action sits in the sticky title bar, page properties (frontmatter) in a right-hand sheet, Schrijfhulp beside the text on wide screens. The editor toolbar is an `nldd-toolbar` that overflows into a menu.
3. **Lists after the NLDD list pattern.** Rows of cells, one action per row and at most one shortcut segment; folders in an `nldd-sidebar-section` that collapses into a sheet on narrow screens.
4. **Coloured diff.** A proposal shows a block diff of the rendered page: added blocks green with a solid bar at the start, removed blocks red, struck through and with a dashed bar, so the two differ without colour too; in a changed block the changed words carry a filled colour and an underline or strike-through. Screen readers hear "Toegevoegd", "Verwijderd", "Oude tekst" or "Nieuwe tekst" before each block. Views: "Wijzigingen" (the changes with one block of context), "Hele pagina" and "Brontekst" (a coloured line diff with word marks). This replaces the unmarked side-by-side view. Blocks pair up as "changed" only when they are alike; a comparison that would take too long shows "te groot" and points to GitHub instead.
5. **Parallel work in worktrees.** Implementers that run at the same time each get their own git worktree; the controller merges and runs the full suite on the result.

## Consequences

- The Rijkslint is gone. The design system reserves the top navigation bar for landing and information pages; Schrijver is an internal work tool, and the favicon keeps the rijkswapen.
- Bars line up with the content through the page-section variables (`--semantics-page-sections-*`), as Plak does, and the diff colours come from the category variables (`--semantics-categories-*`). The design system calls its variables internal, so check both on every upgrade.
- After server rendering the design system upgrades elements in definition order: a title bar upgrades before its page and throws when it looks for the scroll target. The page component renders the title bar once `nldd-page` is defined. To report upstream.
- The app bar and the title bar stick with the page header while the document scrolls, and the editor toolbar sticks below them. The page component measures the header and every bar marked `data-plakt` and sets the document's scroll padding from them, so a focused element stays in view (WCAG 2.4.11). To report upstream: the root scroll mode sets no scroll padding of its own.
- CodeMirror inside `nldd-text-editor` ignores that scroll padding, so the line being edited could slide behind the bars. Schrijver keeps the caret below those bars itself, from the editor's public `getSelection().rect` on every selection change. To report upstream: the editor should pass the page insets to CodeMirror's scroll margins, and `nldd-text-editor-state` does not fire on every selection change as its reference says.
- "Uitloggen" in the menu leads to the block on the settings page that says unsaved drafts are cleared, where "Log uit" does it. Logging out straight from the menu would discard drafts without a word.
- axe cannot resolve the contrast of the title bar's back button (`pseudoContent`). The Playwright axe test allows exactly that node; pa11y, which counts unresolved results as errors, hides the title bar.
- Page properties are one click further away. A save that fails on a property offers "Eigenschappen aanpassen", which opens the sheet.
- The app bar stays at the top on phones, where the application pattern prefers the bottom; with only a wordmark and a menu that costs little.
- The "Voorbeeld" link left the proposal lists; it stays on the proposal page.
- Also to report upstream: the save notification floats over the sticky bars for ten seconds, and Enter on a list row made of segments does nothing.
