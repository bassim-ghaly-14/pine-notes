# 🍍 Pine Notes

> A fast, private, distraction-free notes app built for people who want their notes to stay theirs.

**Pine Notes** is a lightweight, Apple-inspired notes application that runs entirely in your browser.

No account.  
No backend.  
No database.  
No tracking.  
No external dependencies.

Your notes are stored locally on your device using the browser's **LocalStorage API**.

---

## ✨ Why Pine Notes?

Most note-taking apps require an account, a server, or some kind of cloud infrastructure.

Pine Notes takes a different approach:

> **Your notes don't need to leave your device.**

Everything happens locally in your browser, making Pine Notes:

- ⚡ Fast
- 🔒 Private by design
- 📦 Portable
- 🌐 Offline-friendly
- 🧩 Dependency-free
- 📱 Responsive across devices

---

## 🚀 Features

### 📝 Notes

Create, edit, organize, pin, archive, and delete notes with a clean distraction-free editor.

- Rich note editing
- 6 note color accents
- Pin important notes
- Archive notes
- Trash & restore
- Automatic permanent deletion after 30 days
- Destructive-action undo

---

### ✅ Tasks

Turn notes into actionable tasks.

- Task-based notes
- Interactive checklists
- Completion tracking
- Progress indicators

---

### 🗂️ Organization

Keep your notes organized without complicated folder systems.

- Custom categories
- Category filtering
- Live category counts
- Recently updated
- Recently created
- Alphabetical sorting
- Pinned-first sorting

---

### 🔎 Search

Find anything instantly.

- Debounced search
- Full-text search
- Match highlighting
- Keyboard shortcut support
- Clear search action

Press:

```text
/

to focus the search field.

⸻

📝 Markdown

Write notes using Markdown without leaving the editor.

* Heading
* Bold
* Italic
* Strikethrough
* Inline code
* Links
* Bulleted lists
* Numbered lists
* Quotes
* Code blocks
* Checkboxes
* Write / Preview modes
* Safe Markdown rendering

Markdown can be enabled or disabled from:

Settings → Markdown

⸻

⚡ Command Palette

Navigate Pine Notes using commands instead of menus.

Open it with:

Ctrl/Cmd + K

Search commands and execute actions without reaching for the mouse.

⸻

⌨️ Keyboard-First Workflow

Pine Notes is designed to be usable without constantly switching between keyboard and mouse.
Shortcut	Action
N	Create a new note
/	Focus search
S	Open settings
Ctrl/Cmd + K	Open command palette
Ctrl/Cmd + B	Bold text
Ctrl/Cmd + I	Italic text
Ctrl/Cmd + Z	Undo destructive action
↑ / ↓	Navigate command results
Enter	Execute selected command
← / →	Switch Write / Preview
Esc	Close modal or palette

Shortcuts are automatically ignored while typing in regular inputs unless the shortcut is intentionally supported there.

⸻

🎨 Themes

Pine Notes supports three appearance modes:

* Light
* Dark
* System

The System option automatically follows your operating system preference.

⸻

📱 Responsive by Design

The interface is designed to work across a wide range of screen sizes:

320px phones
      ↓
Mobile
      ↓
Tablet
      ↓
Desktop
      ↓
Wide screens

The UI adapts dynamically across:

* Header
* Search
* Note editor
* Toolbars
* Categories
* Note grid
* Modals
* Settings
* Empty states
* Footer

No separate mobile application is required.

⸻

♿ Accessibility

Accessibility is treated as part of the UI architecture rather than an afterthought.

Pine Notes includes:

* Semantic HTML
* ARIA roles and labels
* Keyboard navigation
* Focus management
* Modal focus trapping
* Visible focus states
* Reduced-motion support
* Keyboard-accessible command palette
* Proper form labels

⸻

🔐 Privacy & Security

Privacy is one of the core design decisions behind Pine Notes.

Your data stays local

Pine Notes does not send your notes to a server.

There is:

* No authentication
* No backend
* No database
* No analytics service
* No tracking
* No external API
* No cloud synchronization

Your data is stored in your browser’s LocalStorage.

XSS Protection

User-generated content is inserted into the DOM using safe DOM APIs such as:

textContent
createTextNode
User strings are never directly injected as HTML.
Markdown Security
Markdown rendering is intentionally restricted.
* Raw HTML is treated as plain text
* Link URLs are validated
* Allowed protocols include:
    * http
    * https
    * mailto
Potentially dangerous URLs such as:

javascript:

are rejected and rendered inert.

Import Validation

Imported backups are validated before they can modify application state.

Invalid or corrupted imports:

* Do not partially modify existing data
* Are rejected atomically
* Cannot overwrite valid state with malformed data

⸻

💾 Data & Backups

Pine Notes stores application data locally using a versioned storage envelope.

{
  "version": 4,
  "savedAt": "…",
  "notes": [],
  "categories": [],
  "settings": {},
  "streak": {}
}

The storage layer automatically handles legacy versions.

Automatic Migration

Previous schemas are migrated automatically:

v1 → v2 → v3 → v4

Users don’t need to manually migrate their data.

Corruption Protection

If stored data becomes corrupted, Pine Notes quarantines the payload instead of silently destroying it.

pine-notes:corrupt-backup

Trash Retention

Deleted notes remain recoverable for:

30 days

After that period, they are automatically purged.

Manual Backups

Backups can be exported from:

Settings → Data → Export Backup

Backups can later be restored using:

Settings → Data → Import Backup

Import supports:

* Merge
* Replace

⸻

🧠 Architecture

Pine Notes intentionally uses a small, dependency-free architecture.

pine-notes/
│
├── index.html
│
├── css/
│   ├── master.css
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   └── components.css
│
├── js/
│   ├── app.js
│   │
│   ├── state/
│   │   ├── store.js
│   │   ├── actions.js
│   │   └── undo.js
│   │
│   ├── services/
│   │   ├── storage.js
│   │   ├── dataTransfer.js
│   │   ├── theme.js
│   │   └── streak.js
│   │
│   ├── features/
│   │   ├── notes
│   │   ├── categories
│   │   ├── views
│   │   ├── editor
│   │   ├── palette
│   │   ├── shortcuts
│   │   ├── settings
│   │   ├── dataManager
│   │   └── welcome
│   │
│   ├── components/
│   │   ├── noteCard.js
│   │   ├── confirmModal.js
│   │   └── toast.js
│   │
│   ├── events/
│   │   └── delegate.js
│   │
│   └── utils/
│       ├── markdown
│       ├── highlight
│       ├── focusTrap
│       ├── format
│       ├── id
│       └── dom
│
└── tests/

Architecture Rules

The application follows clear ownership boundaries:

State
  ↓
owns application data

Actions
  ↓
the only mutation API

Services
  ↓
browser/storage infrastructure

Features
  ↓
application orchestration

Components
  ↓
DOM construction

Utils
  ↓
pure reusable helpers

Ownership
Layer	Responsibility
state	Application state
actions	State mutations
services	Storage and browser APIs
features	Feature orchestration
components	DOM construction
utils	Pure reusable logic
events	Event delegation

This separation keeps the application predictable and makes individual features easier to maintain and test.

⸻

🧪 Testing

Pine Notes includes automated Node.js tests.

Run:

npm test
The test suite covers core application behavior including:
* State management
* Actions
* Storage
* Migration
* Data validation
* Import/export
* Undo behavior
* Streak calculations
* Utility functions

⸻

🛠️ Tech Stack
Pine Notes intentionally avoids frameworks and runtime dependencies.
Core
* HTML5
* CSS3
* Vanilla JavaScript
* ES Modules
Browser APIs
* LocalStorage
* File API
* Blob API
* prefers-color-scheme
* prefers-reduced-motion
Testing
* Node.js
* node:test
Runtime Dependencies
0

No React.
No Vue.
No framework.
No UI library.
No runtime dependency.

Just the browser.

⸻

🚀 Getting Started

1. Clone the repository

git clone <repository-url>
cd pine-notes

. Run the app

Pine Notes is a static application.

You can serve the project with any static server.

For example:

npx serve .

Then open the provided local URL in your browser.

You can also open index.html directly in most modern browsers.

3. Run tests

npm test

📦 Project Philosophy

Pine Notes is intentionally small.

The goal isn’t to recreate every feature of a cloud-based productivity platform.

Instead, the project focuses on:

Simplicity
   +
Privacy
   +
Performance
   +
Good UX
   +
Maintainable Architecture

Every feature should justify its complexity.

If something can be solved with a browser API instead of a dependency, Pine Notes prefers the browser API.

⸻

🗺️ Roadmap

The following features are intentionally postponed:

V3+

* Cloud synchronization
* Multi-device synchronization
* Authentication
* Collaboration
* Rich Text editor
* Drag & Drop note reordering

These features are not part of the current architecture because they introduce fundamentally different infrastructure requirements.

⸻

🤝 Contributing

Contributions, ideas, and feedback are welcome.

Before adding a feature, consider:

1. Does it preserve the local-first philosophy?
2. Does it introduce unnecessary dependencies?
3. Does it affect existing state ownership?
4. Is it accessible?
5. Does it work across mobile and desktop?
6. Can it be tested independently?

  Built with vanilla JavaScript, CSS, and a lot of attention to detail.
  Pine Notes — Your notes. Your device. Your data.
```
