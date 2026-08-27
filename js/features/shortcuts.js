/**
 * Centralized keyboard shortcut registration.
 *
 * Rules:
 *   - Global shortcuts never fire while typing in input/textarea/select/
 *     contenteditable.
 *   - Registered: Ctrl/Cmd+K palette · Ctrl/Cmd+B/I/K in-editor Markdown ·
 *     Ctrl/Cmd+Z undo · "/" focus search · "N" new note · "S" settings ·
 *     Escape handled by modal/palette controllers.
 *   - No frameworks: one keydown listener + a small handler table.
 */

import { togglePalette } from "../features/palette.js";
import { getPendingUndo, consumeUndo } from "../state/undo.js";
import { setEditing } from "../state/actions.js";
import { isEditorFocused, editorShortcuts } from "./editor.js";
import { byId } from "../utils/dom.js";

const TYPING_TARGETS = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);

function isTyping(event) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  return (
    TYPING_TARGETS.has(target.tagName) ||
    target.isContentEditable === true
  );
}

function handleEditorShortcut(event, key) {
  if (
    !event.metaKey &&
    !event.ctrlKey ||
    event.shiftKey ||
    !isEditorFocused()
  ) {
    return false;
  }

  const shortcuts = {
    b: editorShortcuts.bold,
    i: editorShortcuts.italic,
    k: editorShortcuts.link,
  };

  const shortcut = shortcuts[key];

  if (!shortcut) {
    return false;
  }

  event.preventDefault();
  shortcut();

  return true;
}

function handlePaletteShortcut(event, key) {
  const meta = event.metaKey || event.ctrlKey;

  if (!meta || key !== "k") {
    return false;
  }

  event.preventDefault();
  togglePalette();

  return true;
}

function handleUndoShortcut(event, key) {
  const meta = event.metaKey || event.ctrlKey;

  if (!meta || key !== "z") {
    return false;
  }

  if (getPendingUndo() && !isTyping(event)) {
    event.preventDefault();
    consumeUndo();
  }

  return true;
}

function focusSearch() {
  event.preventDefault();
  byId("searchInput")?.focus();
}

function startNewNote() {
  setEditing(null);
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
  byId("noteTitle")?.focus();
}

function handleSingleKeyShortcut(event, key, openSettings) {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    isTyping(event)
  ) {
    return false;
  }

  const actions = {
    "/": () => {
      event.preventDefault();
      byId("searchInput")?.focus();
    },

    s: () => {
      event.preventDefault();
      openSettings?.();
    },

    n: () => {
      event.preventDefault();
      startNewNote();
    },
  };

  const action = actions[key];

  if (!action) {
    return false;
  }

  action();
  return true;
}

function handleKeydown(event, openSettings) {
  const key = event.key.toLowerCase();

  if (handleEditorShortcut(event, key)) {
    return;
  }

  if (handlePaletteShortcut(event, key)) {
    return;
  }

  if (event.key === "Escape") {
    return;
  }

  if (handleUndoShortcut(event, key)) {
    return;
  }

  handleSingleKeyShortcut(event, key, openSettings);
}

export function initShortcuts({ openSettings } = {}) {
  document.addEventListener("keydown", (event) => {
    handleKeydown(event, openSettings);
  });
}