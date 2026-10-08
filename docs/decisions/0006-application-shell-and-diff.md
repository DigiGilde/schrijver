# 0006: NLDD application shell, preview on demand, coloured diff

Date: 2026-10-08. Status: accepted.

## Context

The owner's first look at v1 in the local preview: content hugs the left edge and does not line up with the header, the Rijkslint takes room and the app name is not a link home, the editor has no way back, the editor shows formatting inline and a full preview next to it ("lijkt dubbelop"), the page list is cramped, and a reviewer has to hunt for what changed in a proposal. The owner points at the RegelRecht editor and Plak as apps that give content more room.

The NLDD design system distinguishes two compositions: an application (panes, toolbars, a page per pane) and a content page (top navigation bar with the Rijkslint, a stack of sections). v1 used the content-page composition for what is an application. Both sibling apps use the application form without the ribbon; RegelRecht's Markdown document editor has "live-styled source, no separate preview" and puts properties in a right-hand sheet.

## Decision

1. **Application shell.** `nldd-app-view` > `nldd-bar-split-view` with one app toolbar: the name "Schrijver" links home, an account menu holds Instellingen, Help and Uitloggen. No `nldd-top-navigation-bar`, so no Rijkslint. Every route renders through one page component: a column that lines up with the app bar, and a sticky `nldd-top-title-bar` with a back button wherever there is a way back.
2. **One writing surface.** The hybrid `nldd-text-editor` is the editor; "Voorbeeld" is a view switch in the editor toolbar for what the editor cannot show (images, Mermaid, the rendered page). The save action sits in the sticky title bar, page properties (frontmatter) in a right-hand sheet, Schrijfhulp beside the text on wide screens. The editor toolbar is an `nldd-toolbar` that overflows into a menu.
3. **Lists after the NLDD list pattern.** Rows of cells, one action per row and at most one shortcut segment; folders in an `nldd-sidebar-section` that collapses into a sheet on narrow screens.
4. **Coloured diff.** A proposal shows a block diff of the rendered page with word marks: additions green and underlined, deletions red and struck through, with a visually hidden "Toegevoegd" or "Verwijderd" for screen readers. Views: "Wijzigingen" (the changes with one block of context), "Hele pagina" and "Brontekst" (a coloured line diff with word marks). This replaces the unmarked side-by-side view.
5. **Parallel work in worktrees.** Implementers that run at the same time each get their own git worktree; the controller merges and runs the full suite on the result.

## Consequences

- The Rijkslint is gone. The design system reserves the top navigation bar for landing and information pages; Schrijver is an internal work tool, and the favicon keeps the rijkswapen.
- Bars line up with the content through the page-section variables (`--semantics-page-sections-*`), as Plak does. The design system calls its variables internal, so check this on every upgrade.
- After server rendering the design system upgrades elements in definition order: a title bar upgrades before its page and throws when it looks for the scroll target. The page component renders the title bar once `nldd-page` is defined. To report upstream.
- The app bar and the title bar stick while the document scrolls. A scroll padding on the document keeps a focused element in view (WCAG 2.4.11). To report upstream: the root scroll mode sets no scroll padding of its own.
- axe cannot resolve the contrast of the title bar's back button (`pseudoContent`). The Playwright axe test allows exactly that node; pa11y, which counts unresolved results as errors, hides the title bar.
- Page properties are one click further away. A save that fails on a property offers "Eigenschappen aanpassen", which opens the sheet.
- The app toolbar stays at the top on phones, where the application pattern prefers the bottom; with only a name and an account menu that costs little.
- The "Voorbeeld" link left the proposal lists; it stays on the proposal page.
