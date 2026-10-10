# 0001: NLDD text editor instead of a block editor

Date: 2026-10-07. Status: accepted.

## Context

Colleagues asked for a writing experience without Markdown knowledge, ideally with draggable blocks, inline images and Mermaid rendering (Notion-like). The NLDD Designsysteem ships `nldd-text-editor`, a hybrid Markdown editor on CodeMirror 6: the document stays Markdown text, formatting is shown inline with dimmed syntax markers, and it has a headless command API, `insertAtCursor`, `replaceRange` and an annotation overlay. A ProseMirror-based block editor (Milkdown) would give blocks and inline media but adds a third-party dependency, its own styling work, and a tree-to-Markdown conversion that is never byte-faithful.

## Decision

Use `nldd-text-editor` as the writing surface, with a Schrijver-built toolbar and a live preview pane (`nldd-rich-text`) that renders images and Mermaid. No block drag-and-drop in version one.

## Consequences

- Markdown in, Markdown out holds trivially: the editor text is the file body.
- The assistant's suggestions use the existing annotation overlay.
- Writers see dimmed Markdown markers. If testing shows this blocks colleagues, Milkdown is the fallback; the rest of the design is unaffected because the contract is "Markdown in, Markdown out".
- Gaps found (no inline image or Mermaid rendering, no block drag) are reported to the design system.
- RegelRecht made the same move: its article editor replaced Tiptap with `nldd-text-editor` (see 0003).
