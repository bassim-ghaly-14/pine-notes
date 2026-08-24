/**
 * Application entry point.
 *
 * Boot order: theme → load/migrate persisted data → purge expired trash →
 * initialize features → wire form (create/edit), search, colors, undo.
 * This module only wires things together; it owns no state, no rendering,
 * and no business logic.
 */

import { initTheme, applyTheme, resolveMode } from "./services/theme.js";
import { loadData } from "./services/storage.js";
import { initState, subscribe, getState } from "./state/store.js";
import {
  addNote, updateNote, getNoteById, setEditing,
  setSearch, purgeExpiredTrash, setSetting,
} from "./state/actions.js";
import { subscribeUndo, consumeUndo } from "./state/undo.js";
import { initNotes, renderNotes } from "./features/notes.js";
import { initCategories } from "./features/categories.js";
import { initViews } from "./features/views.js";
import { initPalette } from "./features/palette.js";
import { initSettings, openSettings } from "./features/settings.js";
import { initDataManager } from "./features/dataManager.js";
import { initShortcuts } from "./features/shortcuts.js";
import { initEditor } from "./features/editor.js";
import { initWelcome } from "./features/welcome.js";
import { initConfirmModal } from "./components/confirmModal.js";
import { showToast } from "./components/toast.js";
import { byId } from "./utils/dom.js";

/* ------------------------------------------------------------------ */
/* Boot state (handles v1 → v2 → v3 → v4 migration) + trash purge      */
/* ------------------------------------------------------------------ */

const loaded = loadData();
initState({
  notes: loaded.data.notes,
  categories: loaded.data.categories,
  settings: loaded.data.settings,
  streak: loaded.data.streak,
});

// Theme: settings value → legacy key fallback → dark. Applied before UI paints.
initTheme(loaded.data.settings.theme);
purgeExpiredTrash();

if (loaded.recovered) {
  setTimeout(() => showToast("Some saved data was corrupted and could not be restored.", "warning"), 400);
}

/* ------------------------------------------------------------------ */
/* Static UI                                                           */
/* ------------------------------------------------------------------ */

const currentYear = byId("currentYear");
if (currentYear) currentYear.textContent = new Date().getFullYear();

/* ------------------------------------------------------------------ */
/* Note form — create AND edit mode                                    */
/* ------------------------------------------------------------------ */

const noteForm = document.querySelector(".note-form");
const noteTitle = byId("noteTitle");
const noteContent = byId("noteContent");
const noteCategory = byId("noteCategory");
const addNoteBtn = byId("addNoteBtn");
const cancelEditBtn = byId("cancelEditBtn");

/** Selected swatch for the next new note (in edit mode it applies live). */
let selectedColor = null;

function buildColorPicker() {
  const picker = byId("colorPicker");
  if (!picker) return;

  [
    ["", "Default"],
    ["green", "Green"],
    ["blue", "Blue"],
    ["amber", "Amber"],
    ["rose", "Rose"],
    ["purple", "Purple"],
  ].forEach(([value, label], index) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch" + (value === "" ? " default" : "");
    if (value) swatch.dataset.color = value;
    swatch.setAttribute("role", "radio");
    swatch.setAttribute("aria-label", label);
    swatch.setAttribute("aria-checked", String(index === 0));
    if (index === 0) swatch.classList.add("selected");

    swatch.addEventListener("click", () => {
      selectedColor = value || null;
      picker.querySelectorAll(".color-swatch").forEach((s) => {
        const isThis = s === swatch;
        s.classList.toggle("selected", isThis);
        s.setAttribute("aria-checked", String(isThis));
      });
      // While editing, color changes apply immediately.
      const editingId = getState().editingId;
      if (editingId) updateNote(editingId, { color: selectedColor });
    });

    picker.appendChild(swatch);
  });
}

function syncFormMode() {
  const editingId = getState().editingId;
  const note = editingId ? getNoteById(editingId) : null;

  if (note) {
    noteTitle.value = note.title;
    noteContent.value = note.content;
    noteCategory.value = note.categoryId ?? "";
    selectedColor = note.color ?? null;
    addNoteBtn.textContent = "Save Changes";
    cancelEditBtn.hidden = false;
    noteForm?.classList.add("editing");
  } else {
    addNoteBtn.textContent = "Add Note";
    cancelEditBtn.hidden = true;
    noteForm?.classList.remove("editing");
    selectedColor = null;
    byId("colorPicker")?.querySelectorAll(".color-swatch").forEach((s, i) => {
      s.classList.toggle("selected", i === 0);
      s.setAttribute("aria-checked", String(i === 0));
    });
  }
}

function submitNote() {
  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();
  if (title === "" || content === "") return;

  const editingId = getState().editingId;
  if (editingId) {
    updateNote(editingId, { title, content, categoryId: noteCategory.value || null });
    showToast("Note Updated", "success");
    setEditing(null);
  } else {
    addNote({
      title,
      // Task notes carry their work in items[], not in the body text.
      content: selectedType === "task" ? "" : content,
      categoryId: noteCategory.value || null,
      color: selectedColor,
      type: selectedType,
    });
    showToast(selectedType === "task" ? "Task List Created" : "Note Added", "success");
  }

  noteTitle.value = "";
  noteContent.value = "";
  noteTitle.focus();
}

addNoteBtn?.addEventListener("click", submitNote);

cancelEditBtn?.addEventListener("click", () => {
  setEditing(null);
  noteTitle.value = "";
  noteContent.value = "";
});

// Ctrl/Cmd+Enter submits the form from either field.
[noteTitle, noteContent].forEach((field) =>
  field?.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitNote();
    }
  })
);

// Edit-mode transitions (state-driven) reset the form.
subscribe(() => syncFormMode());

/* ------------------------------------------------------------------ */
/* Note/Task type toggle                                               */
/* ------------------------------------------------------------------ */

let selectedType = "text";

function initTypeToggle() {
  document.querySelectorAll(".type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedType = btn.dataset.noteType === "task" ? "task" : "text";
      document.querySelectorAll(".type-btn").forEach((b) => {
        const isThis = b === btn;
        b.classList.toggle("selected", isThis);
        b.setAttribute("aria-checked", String(isThis));
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Search (debounced) + clear button                                   */
/* ------------------------------------------------------------------ */

const searchInput = byId("searchInput");
const clearSearchBtn = byId("clearSearchBtn");
let searchTimer = null;

searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setSearch(searchInput.value), 150);
});

clearSearchBtn?.addEventListener("click", () => {
  setSearch("");
  if (searchInput) searchInput.value = "";
  searchInput?.focus();
});

// Show/hide the clear affordance with the query.
subscribe(() => {
  if (clearSearchBtn) clearSearchBtn.hidden = getState().search.trim() === "";
});

/* ------------------------------------------------------------------ */
/* Header buttons                                                      */
/* ------------------------------------------------------------------ */

byId("openSettingsBtn")?.addEventListener("click", openSettings);

byId("themeBtn")?.addEventListener("click", () => {
  // Quick toggle persists through the settings envelope.
  const next = resolveMode(getState().settings.theme ?? undefined) === "light" ? "dark" : "light";
  setSetting("theme", next);
});

/* ------------------------------------------------------------------ */
/* Undo — toast action + Ctrl/Cmd+Z (keydown lives in shortcuts.js)     */
/* ------------------------------------------------------------------ */

subscribeUndo((pending) => {
  // A fresh pending undo replaces whatever toast is showing.
  if (pending) showToast(pending.label, "success", { label: "Undo", onAction: consumeUndo });
});

/* ------------------------------------------------------------------ */
/* Persistence failure feedback                                        */
/* ------------------------------------------------------------------ */

subscribe((state) => {
  if (state.saveFailed) {
    showToast("Could not save changes — storage unavailable.", "danger");
  }
});

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */

buildColorPicker();
initTypeToggle();
initConfirmModal();
initViews();
initCategories();
initSettings();   // before palette so the palette command can open it
initDataManager(); // export/import/restore (Data section in Settings)
initPalette(openSettings);
initShortcuts({ openSettings });
initEditor(); // Write/Preview tabs + Markdown toolbar (visibility follows settings.markdown)
initWelcome();
initNotes();
renderNotes();

// Theme changes made via settings/palette apply immediately.
subscribe(() => applyTheme(getState().settings.theme));
