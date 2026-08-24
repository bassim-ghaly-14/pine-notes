/**
 * Notes feature — orchestrates rendering and note interactions.
 *
 * Owns NO state (renders from the store) and performs NO persistence
 * (calls actions). Rendering is a pure function of state: the persisted
 * array order is never mutated for display purposes.
 */

import { getState, subscribe } from "../state/store.js";
import {
  togglePin, trashNote, archiveNote, unarchiveNote,
  restoreNote, purgeNote, setEditing, getCategoryById,
  addTaskItem, toggleTaskItem, renameTaskItem, deleteTaskItem,
} from "../state/actions.js";
import { delegate } from "../events/delegate.js";
import { createNoteCard, createEmptyState } from "../components/noteCard.js";
import { openConfirm } from "../components/confirmModal.js";
import { showToast } from "../components/toast.js";
import { byId } from "../utils/dom.js";

let notesGrid = null;

/* ------------------------------------------------------------------ */
/* Pure view computation (sort NEVER mutates persisted order)          */
/* ------------------------------------------------------------------ */

/** Filter to the current view's lifecycle bucket. */
function notesForView(notes, view) {
  return notes.filter((note) =>
    view === "trash" ? Boolean(note.deletedAt)
    : view === "archive" ? note.archived && !note.deletedAt
    : !note.archived && !note.deletedAt
  );
}

const comparators = {
  updated: (a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  created: (a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  alpha: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
};

/**
 * Visible notes = current view bucket → category filter → search filter →
 * presentation-only sort.
 */
function visibleNotes() {
  const { notes, search, view, settings, categoryFilter } = getState();
  const query = search.trim().toLowerCase();

  let list = notesForView(notes, view);

  if (categoryFilter) list = list.filter((n) => n.categoryId === categoryFilter);

  if (query) {
    list = list.filter((note) => {
      const catName = note.categoryId ? getCategoryById(note.categoryId)?.name ?? "" : "";
      return (
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        catName.toLowerCase().includes(query)
      );
    });
  }

  // "Pinned first" only applies where pinning exists (the active view).
  if (settings.sortBy === "pinned" && view === "active") {
    return [...list].sort((a, b) =>
      ((b.pinned === true) - (a.pinned === true)) || comparators.updated(a, b)
    );
  }
  return [...list].sort(comparators[settings.sortBy] ?? comparators.updated);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export function renderNotes() {
  if (!notesGrid) return;

  const { view, search } = getState();
  const query = search.trim();
  const list = visibleNotes();
  const fragment = document.createDocumentFragment();

  if (list.length === 0) {
    fragment.appendChild(createEmptyState(view, query));
  } else {
    list.forEach((note) =>
      fragment.appendChild(
        createNoteCard(
          note,
          view,
          note.categoryId ? getCategoryById(note.categoryId)?.name ?? "" : "",
          query,
          { markdown: getState().settings.markdown === true }
        )
      )
    );
  }

  // Single DOM write per render; a fragment avoids N reflows.
  notesGrid.replaceChildren(fragment);
}

/* ------------------------------------------------------------------ */
/* Task item interactions (inside task-note cards)                     */
/* ------------------------------------------------------------------ */

function startInlineRename(listItem, noteId, itemId) {
  const textEl = listItem.querySelector(".task-text");
  if (!textEl || listItem.querySelector(".task-rename-input")) return;
  const current = textEl.textContent;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-rename-input";
  input.value = current;
  input.setAttribute("aria-label", "Edit task text");

  const commit = () => {
    const value = input.value.trim();
    if (value && value !== current) renameTaskItem(noteId, itemId, value);
    else renderNotes(); // discard — re-render restores the span
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
    if (event.key === "Escape") {
      input.value = current; // force no-change
      input.blur();
    }
  });
  input.addEventListener("blur", commit);

  textEl.replaceWith(input);
  input.focus();
  input.select();
}

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

function initInteractions() {
  // One delegated listener per card action — identity is always data-id.
  delegate(notesGrid, "click", "data-action", (action, el, event) => {
    const card = el.closest("[data-id]");
    if (!card?.dataset.id) return;
    const id = card.dataset.id;

    switch (action) {
      case "pin":
        togglePin(id);
        break;
      case "edit":
        setEditing(id);
        byId("noteTitle")?.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "archive":
        archiveNote(id);
        showToast("Note Archived", "success", { label: "Undo", onAction: () => unarchiveNote(id) });
        break;
      case "unarchive":
        unarchiveNote(id);
        showToast("Note Restored to Active", "success");
        break;
      case "trash":
        trashNote(id);
        showToast("Note Moved to Trash", "warning", { label: "Undo", onAction: () => restoreNote(id) });
        break;
      case "restore":
        restoreNote(id);
        showToast("Note Restored", "success");
        break;
      case "purge":
        requestPurge(id);
        break;
      case "task-add": {
        const input = card.querySelector('[data-role="new-task"]');
        if (input?.value.trim()) {
          addTaskItem(id, input.value);
          input.focus();
        }
        break;
      }
      case "task-edit": {
        const itemEl = el.closest(".task-item");
        if (itemEl) startInlineRename(itemEl, id, el.dataset.itemId);
        break;
      }
      case "task-del":
        deleteTaskItem(id, el.dataset.itemId);
        break;
    }
    event.preventDefault();
  });

  // Task checkboxes fire change events, not click-with-action.
  delegate(notesGrid, "change", "[data-task-action]", (_action, el) => {
    const card = el.closest("[data-id]");
    if (card?.dataset.id && el.dataset.taskAction === "toggle") {
      toggleTaskItem(card.dataset.id, el.dataset.itemId);
    }
  });

  // Enter inside a task-note's "Add a task…" field adds the item.
  notesGrid.addEventListener("keydown", (event) => {
    const target = event.target;
    if (
      event.key === "Enter" &&
      target instanceof Element &&
      target.matches?.('[data-role="new-task"]')
    ) {
      event.preventDefault();
      const card = target.closest("[data-id]");
      if (card?.dataset.id && target.value.trim()) {
        addTaskItem(card.dataset.id, target.value);
        notesGrid.querySelector(`[data-id="${CSS.escape(card.dataset.id)}"] [data-role="new-task"]`)?.focus();
      }
    }
  });
}

/** Delete-forever respects the "Confirm Before Delete" setting. */
function requestPurge(id) {
  if (!getState().settings.confirmDelete) {
    purgeNote(id);
    showToast("Note Deleted Forever", "danger");
    return;
  }
  openConfirm({
    title: "Delete Forever",
    message: "This note will be permanently deleted. This cannot be undone.",
    confirmLabel: "Delete Forever",
    onConfirm: () => purgeNote(id),
  });
}

/* ------------------------------------------------------------------ */
/* Initialization                                                      */
/* ------------------------------------------------------------------ */

export function initNotes() {
  notesGrid = byId("notesGrid");
  initInteractions();
  subscribe(renderNotes);
  renderNotes();
}