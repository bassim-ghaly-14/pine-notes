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

const TYPING_TARGETS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTyping(event) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return (
    TYPING_TARGETS.has(target.tagName) || target.isContentEditable === true
  );
}

export function initShortcuts({ openSettings } = {}) {
  document.addEventListener("keydown", (event) => {
    const meta = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    // --- In-editor Markdown shortcuts (only while editing the note) ---
    if (meta && !event.shiftKey && isEditorFocused()) {
      if (key === "b") {
        event.preventDefault();
        editorShortcuts.bold();
        return;
      }
      if (key === "i") {
        event.preventDefault();
        editorShortcuts.italic();
        return;
      }
      if (key === "k") {
        // Editor owns Ctrl/Cmd+K ONLY when the note textarea has focus.
        event.preventDefault();
        editorShortcuts.link();
        return;
      }
    }

    // --- Global command palette ---
    if (meta && key === "k") {
      event.preventDefault();
      togglePalette();
      return;
    }

    if (event.key === "Escape") {
      // Modals/palette close themselves via their own Escape listeners.
      return;
    }

    // --- Undo (only when a pending undo exists and not while typing) ---
    if (meta && event.key.toLowerCase() === "z") {
      if (getPendingUndo() && !isTyping(event)) {
        event.preventDefault();
        consumeUndo();
      }
      return;
    }

    // --- Single-key shortcuts: never while typing ---
    if (meta || event.altKey || isTyping(event)) return;

    if (event.key === "/") {
      event.preventDefault(); // stop browsers' quick-find
      byId("searchInput")?.focus();
      return;
    }

    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      openSettings?.();
      return;
    }

    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      setEditing(null); // ensure create mode
      window.scrollTo({ top: 0, behavior: "smooth" });
      byId("noteTitle")?.focus();
    }
  });
}