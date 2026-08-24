# Pine Notes

A fast, private, Apple-inspired notes app that runs entirely in your browser.
No accounts, no backend, no dependencies — your notes never leave your device.

## Features

- **Notes** — create, edit, and organize rich text notes with 6 color accents
- **Categories** — group notes and filter by category chips with live counts
- **Search** — instant, debounced full-text search with match highlighting
- **Sorting** — recently updated / created, alphabetical, or pinned first
- **Pinning** — keep important notes at the top
- **Archive** — hide notes without deleting them
- **Trash** — 30-day safety net with restore, then automatic purge
- **Undo** — one-tap undo (toast button or Ctrl/Cmd+Z) for destructive actions
- **Tasks** — task-type notes with checklists and progress bars
- **Daily Streak** — motivational streak tracking for real productivity
- **Markdown** — built-in editor toolbar, Write/Preview tabs, safe rendering
- **Command Palette** — Ctrl/Cmd+K to jump to any command
- **Keyboard Shortcuts** — full keyboard-driven workflow
- **Import / Export** — JSON backups with merge or replace strategies
- **Themes** — Light, Dark, and System (follows OS preference)
- **Responsive UI** — usable from 320px phones to wide desktops
- **Accessibility** — focus trapping dialogs, ARIA roles, keyboard navigation
- **LocalStorage persistence** — versioned schema (v4), zero setup

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `N` | Start a new note |
| `/` | Focus search |
| `S` | Open settings |
| `Ctrl/Cmd + K` | Command palette (or insert a link, while editing a note) |
| `Ctrl/Cmd + B` | Bold (in note editor) |
| `Ctrl/Cmd + I` | Italic (in note editor) |
| `Ctrl/Cmd + Z` | Undo last destructive action (when available) |
| `↑` / `↓` + `Enter` | Navigate & run command palette results |
| `←` / `→` | Switch Write / Preview tabs |
| `Esc` | Close modal, dialog, or palette |

Shortcuts never fire while typing in inputs unless explicitly intended.

## Architecture

```
index.html            single-page shell
css/
  master.css          stylesheet entry point (import order matters)
  tokens.css          design tokens: colors, radii, shadows, motion
  base.css            reset, element defaults, focus rings, reduced motion
  layout.css          app shell, header, sections, grid, breakpoints
  components.css      reusable component styles
js/
  app.js              entry point — boot order + wiring only
  state/
    store.js          central state tree + pub/sub
    actions.js        the ONLY mutation API (validates → mutates → persists)
    undo.js           single-action undo registry
  services/
    storage.js        localStorage access, v1→v4 migration, corruption quarantine
    dataTransfer.js   export/import/merge logic (pure)
    theme.js          light/dark/system application
    streak.js         daily-streak math (pure)
  features/           orchestration: notes, categories, views, editor,
                      palette, shortcuts, settings, dataManager, welcome
  components/         DOM construction: noteCard, confirmModal, toast
  events/delegate.js  delegated event handling (no inline handlers)
  utils/              pure helpers: markdown renderer, highlight, focus trap,
                      format, id, dom queries
tests/                node:test suites (`npm test`)
```

Ownership rules: **state** owns data · **actions** are the only mutation API ·
**services** own browser/storage infrastructure · **features** orchestrate ·
**components** build DOM · **utils** are pure.

## Data

All data lives in your browser's LocalStorage under the key `pine-notes:v2`
as a single versioned envelope:

```json
{ "version": 4, "savedAt": "…", "notes": [], "categories": [], "settings": {}, "streak": {} }
```

Legacy formats (v1–v3) migrate automatically on first load. Corrupted
payloads are quarantined under `pine-notes:corrupt-backup` instead of being
destroyed. Trashed notes purge automatically after 30 days. Use
**Settings → Data → Export Backup** for portable JSON snapshots.

## Security

- **XSS-safe DOM rendering** — all user content enters the DOM via
  `textContent` / `createTextNode`; no user string is ever parsed as HTML.
- **Markdown sanitization** — raw HTML is treated as plain text; link URLs
  pass a protocol allowlist (http/https/mailto only), so `javascript:` URLs
  render inert.
- **Validated imports** — backup files are shape- and version-checked before
  anything touches your data; validation failure is atomic (no partial state).
- No inline event handlers, no `eval`, no external network calls.

## Tech Stack

- HTML5
- CSS3 (custom properties, grid, container-friendly media queries)
- Vanilla JavaScript (ES Modules) — zero runtime dependencies
- LocalStorage API
- Web APIs: File/Blob export, `prefers-color-scheme`, `prefers-reduced-motion`

## Getting Started

1. Clone or download this repository
2. Open `index.html` in any modern browser (or serve the folder statically)
3. Start writing — everything persists locally, instantly

Run the test suite with:

```sh
npm test
```

## Future / V3

Deliberately postponed:

- Cloud Sync & multi-device sync
- Authentication
- Collaboration
- Rich Text editor
- Drag & Drop reordering

