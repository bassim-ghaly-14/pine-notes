/**
 * Markdown editor feature — Write/Preview tabs + formatting toolbar.
 *
 * Ownership: orchestrates DOM behavior only. Content mutations still flow
 * through the existing note form/actions; the renderer is the pure util
 * utils/markdown.js (same renderer used by note cards). Preview HTML is
 *  * never persisted — it is rebuilt from the textarea on demand.
 */

import { getState, subscribe } from "../state/store.js";
import { renderMarkdown } from "../utils/markdown.js";
import { byId, qs } from "../utils/dom.js";

let textarea = null;
let toolbar = null;
let tabs = null;
let tabWrite = null;
let tabPreview = null;
let previewPane = null;
let previewActive = false;

/* ------------------------------------------------------------------ */
/* Visibility                                                          */
/* ------------------------------------------------------------------ */

function syncVisibility() {
  const enabled = getState().settings.markdown === true;
  if (tabs) tabs.hidden = !enabled;
  if (toolbar) toolbar.hidden = !enabled || previewActive;
  if (!enabled) showWrite();
}

function showWrite() {
  previewActive = false;
  if (textarea) textarea.hidden = false;
  if (previewPane) {
    previewPane.hidden = true;
    previewPane.replaceChildren();
  }
  if (toolbar) toolbar.hidden = getState().settings.markdown !== true;
  tabWrite?.setAttribute("aria-selected", "true");
  tabWrite?.classList.add("selected");
  tabPreview?.setAttribute("aria-selected", "false");
  tabPreview?.classList.remove("selected");
}

function showPreview() {
  if (!previewPane) return;
  previewActive = true;
  textarea.hidden = true;
  renderPreview();
  previewPane.hidden = false;
  if (toolbar) toolbar.hidden = true;
  tabPreview?.setAttribute("aria-selected", "true");
  tabPreview?.classList.add("selected");
  tabWrite?.setAttribute("aria-selected", "false");
  tabWrite?.classList.remove("selected");
}

/** Live re-render while typing in Preview mode. Never persists. */
function renderPreview() {
  if (!previewPane) return;
  const source = textarea.value;
  previewPane.replaceChildren(); // discard previous DOM — nothing cached
  if (source.trim()) previewPane.appendChild(renderMarkdown(source));
}

/* ------------------------------------------------------------------ */
/* Text insertion (cursor-aware)                                       */
/* ------------------------------------------------------------------ */

/** Wrap the selection (or insert a placeholder) with before/after markers. */
function wrapSelection(before, after, placeholder = "text") {
  if (!textarea) return;
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  const nextValue = value.slice(0, start) + before + inner + after + value.slice(end);
  textarea.value = nextValue;

  if (selected) {
    // Keep the wrapped text selected for further formatting.
    textarea.setSelectionRange(start + before.length, start + before.length + inner.length);
  } else {
    // Cursor lands inside the markers, on the placeholder.
    textarea.setSelectionRange(start + before.length, start + before.length + placeholder.length);
  }
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Apply a line-level prefix to every selected line. */
function prefixLines(prefixFor) {
  if (!textarea) return;
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndRaw = value.indexOf("\n", end);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");

  let index = 0;
  const rebuilt = lines
    .map((line) => {
      const prefix = prefixFor(index++);
      return prefix + line.replace(/^(#{1,3} |> |- \[[ xX]\] |- |\* |\d+[.)] )/, "");
    })
    .join("\n");

  textarea.value = value.slice(0, lineStart) + rebuilt + value.slice(lineEnd);
  textarea.setSelectionRange(lineStart + rebuilt.length, lineStart + rebuilt.length);
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

const ACTIONS = {
  heading: () => prefixLines(() => "## "),
  bold: () => wrapSelection("**", "**", "bold text"),
  italic: () => wrapSelection("*", "*", "italic text"),
  strike: () => wrapSelection("~~", "~~", "struck text"),
  code: () => wrapSelection("`", "`", "code"),
  link: () => wrapSelection("[", "](https://)", "link text"),
  ul: () => prefixLines(() => "- "),
  ol: () => prefixLines((i) => `${i + 1}. `),
  quote: () => prefixLines(() => "> "),
  codeblock: () => {
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const selected = value.slice(start, end) || "// code";
    const block = "\n```\n" + selected + "\n```\n";
    textarea.value = value.slice(0, start) + block + value.slice(end);
    const cursor = start + block.length;
    textarea.setSelectionRange(cursor, cursor);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  },
  check: () => prefixLines(() => "- [ ] "),
};

/** Public shortcut hooks (used by features/shortcuts.js). */
export const editorShortcuts = {
  bold: () => ACTIONS.bold(),
  italic: () => ACTIONS.italic(),
  link: () => ACTIONS.link(),
};

/** True when focus is inside the note editor textarea. */
export function isEditorFocused() {
  return document.activeElement === textarea;
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

export function initEditor() {
  textarea = byId("noteContent");
  toolbar = byId("mdToolbar");
  tabs = byId("editorTabs");
  tabWrite = byId("tabWrite");
  tabPreview = byId("tabPreview");
  previewPane = byId("previewPane");
  if (!textarea || !tabs) return;

  tabWrite?.addEventListener("click", showWrite);
  tabPreview?.addEventListener("click", () => {
    showPreview();
    // Preview must not steal focus — only focus when keyboard-driven.
  });

  // Left/Right arrows move between tabs (standard tablist behavior).
  tabs?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const goPreview = event.key === "ArrowRight";
    (goPreview ? showPreview : showWrite)();
    (goPreview ? tabPreview : tabWrite)?.focus();
  });

  delegateToolbar();

  // Live preview updates without saving.
  textarea.addEventListener("input", () => {
    if (previewActive) renderPreview();
  });

  subscribe(syncVisibility);
  syncVisibility();
}

function delegateToolbar() {
  if (!toolbar) return;
  toolbar.addEventListener("mousedown", (event) => {
    // Prevent the button from stealing the textarea selection.
    if (event.target instanceof Element && event.target.closest(".md-btn")) {
      event.preventDefault();
    }
  });
  toolbar.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest(".md-btn") : null;
    if (btn?.dataset.md && ACTIONS[btn.dataset.md]) {
      ACTIONS[btn.dataset.md]();
    }
  });
}

