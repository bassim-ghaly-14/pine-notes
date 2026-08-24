/**
 * Actions — the ONLY place application state is mutated.
 *
 * Every mutation: validate → update state → persist → notify (setState).
 * Identity is by note id, never by array index.
 *
 * Destructive/ambiguous mutations (delete, archive, pin, edit) also offer
 * a single pending undo via ./undo.js using snapshot-merge restoration:
 * undo restores the previous version of every affected note while keeping
 * any notes created afterwards — no history engine required.
 */

import { getState, setState } from "./store.js";
import { saveData, isTrashExpired, NOTE_COLORS } from "../services/storage.js";
import { createId } from "../utils/id.js";
import { recordActivity, toDateKey } from "../services/streak.js";
import { offerUndo } from "./undo.js";

/** Persist all persisted slices; flag a soft failure so the UI can warn. */
function commit() {
  const { notes, categories, settings, streak } = getState();
  const ok = saveData({ notes, categories, settings, streak });
  setState({ saveFailed: !ok });
}

/**
 * Record a meaningful productivity action for the daily streak.
 * Called ONLY from mutations that represent real productivity
 * (create/edit note, add/complete/uncomplete task items) — never from
 * passive actions like viewing, searching, or changing settings.
 */
function touchStreak() {
  const next = recordActivity(getState().streak, toDateKey(new Date()));
  if (next !== getState().streak) setState({ streak: next });
}

/**
 * Merge a pre-mutation notes snapshot back into current state:
 * every snapshot note replaces its newer self; notes created AFTER the
 * snapshot are preserved (an undo must never destroy unrelated work).
 */
function restoreNotesSnapshot(snapshot) {
  const current = getState().notes;
  const restoredIds = new Set(snapshot.map((n) => n.id));
  const merged = [...snapshot.map((n) => ({ ...n }))]; // defensive copy
  current.forEach((note) => {
    if (!restoredIds.has(note.id)) merged.push(note);
  });
  setState({ notes: merged });
  commit();
}

/** Run a mutation with an undo offer. mutate(currentNotes) → newNotes. */
function withUndo(label, mutate) {
  const before = structuredClone(getState().notes);
  setState({ notes: mutate(getState().notes) });
  commit();
  offerUndo(label, () => restoreNotesSnapshot(before));
}

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Notes: create / edit                                                */
/* ------------------------------------------------------------------ */

export function addNote({ title, content, categoryId, color, type = "text" }) {
  const now = nowIso();
  const note = {
    id: createId(),
    type: type === "task" ? "task" : "text",
    title,
    content,
    categoryId: categoryId || null,
    color: NOTE_COLORS.includes(color) ? color : null,
    pinned: false,
    archived: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    items: [],
  };
  // Creation is trivially reversible but NOT undo-worthy; no undo offer.
  setState({ notes: [note, ...getState().notes] });
  touchStreak();
  commit();
  return note;
}

export function updateNote(id, patch) {
  let updated = null;
  const note = getNoteById(id);
  // Only genuine content edits count as productivity for the streak —
  // metadata-only tweaks (color, category) do not.
  const touchesContent =
    note &&
    ((patch.title !== undefined && patch.title !== note.title) ||
      (patch.content !== undefined && patch.content !== note.content));
  withUndo("Edit undone", (notes) =>
    notes.map((note) => {
      if (note.id !== id) return note;
      updated = {
        ...note,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId || null } : {}),
        ...(patch.color !== undefined
          ? { color: NOTE_COLORS.includes(patch.color) ? patch.color : null }
          : {}),
        updatedAt: nowIso(),
      };
      return updated;
    })
  );
  if (touchesContent) touchStreak();
  commit(); // withUndo already committed; harmless double-persist guard
  return updated;
}

export function getNoteById(id) {
  return getState().notes.find((note) => note.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Notes: lifecycle  Active ⇄ Archived ⇄ Trash                         */
/* ------------------------------------------------------------------ */

export function togglePin(id) {
  const note = getNoteById(id);
  if (!note || note.archived || note.deletedAt) return false; // archived/trashed are not pinnable
  withUndo(note.pinned ? "Unpin undone" : "Pin undone", (notes) =>
    notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: nowIso() } : n))
  );
  return true;
}

export function archiveNote(id) {
  if (!getNoteById(id)?.id) return;
  withUndo("Note archived", (notes) =>
    notes.map((n) =>
      n.id === id ? { ...n, archived: true, pinned: false, deletedAt: null, updatedAt: nowIso() } : n
    )
  );
}

export function unarchiveNote(id) {
  withUndo("Note unarchived", (notes) =>
    notes.map((n) =>
      n.id === id && !n.deletedAt ? { ...n, archived: false, deletedAt: null, updatedAt: nowIso() } : n
    )
  );
}

/** Soft delete: Active or Archived → Trash. ID and data fully preserved. */
export function trashNote(id) {
  const note = getNoteById(id);
  if (!note || note.deletedAt) return;
  withUndo("Note restored", (notes) =>
    notes.map((n) => (n.id === id ? { ...n, deletedAt: nowIso(), pinned: false } : n))
  );
}

/** Trash → Active. Preserves the stable id and all other data. */
export function restoreNote(id) {
  withUndo("Restore undone", (notes) =>
    notes.map((n) => (n.id === id ? { ...n, deletedAt: null, updatedAt: nowIso() } : n))
  );
}

/** Permanent, unrecoverable deletion of ONE trashed note. No undo. */
export function purgeNote(id) {
  setState({ notes: getState().notes.filter((n) => !(n.id === id && n.deletedAt)) });
  commit();
}

/** Permanently delete EVERYTHING currently in trash. No undo. */
export function emptyTrash() {
  setState({ notes: getState().notes.filter((n) => !n.deletedAt) });
  commit();
}

/** Boot-time hygiene: purge trashed notes older than 30 days. Returns count. */
export function purgeExpiredTrash() {
  const expired = getState().notes.filter((note) => isTrashExpired(note));
  if (expired.length > 0) {
    setState({ notes: getState().notes.filter((note) => !isTrashExpired(note)) });
    commit();
  }
  return expired.length;
}
/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export function addCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const exists = getState().categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) return null;
  const category = { id: createId(), name: trimmed, createdAt: nowIso() };
  setState({ categories: [...getState().categories, category] });
  commit();
  return category;
}

export function renameCategory(id, name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  // Reject renaming onto an existing different category (no duplicates).
  const clash = getState().categories.some(
    (c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (clash) return false;

  setState({
    categories: getState().categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
  });
  commit();
  return true;
}

/** Deleting a category NEVER deletes notes — they become uncategorized. */
export function deleteCategory(id) {
  setState({
    categories: getState().categories.filter((c) => c.id !== id),
    notes: getState().notes.map((n) => (n.categoryId === id ? { ...n, categoryId: null } : n)),
  });
  commit();
}

export function getCategoryById(id) {
  return getState().categories.find((c) => c.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* UI state (never persisted except settings.sortBy)                   */
/* ------------------------------------------------------------------ */

export function setSearch(query) {
  setState({ search: query });
}

export function setView(view) {
  setState({ view, editingId: null }); // leaving a view cancels edit mode
}

export function setCategoryFilter(categoryId) {
  setState({ categoryFilter: categoryId });
}

export function setEditing(editingId) {
  setState({ editingId });
}

/** Persisted preference — the ONLY sortable-related persisted state. */
export function setSortBy(sortBy) {
  setState({ settings: { ...getState().settings, sortBy } });
  commit();
}

/**
 * Generic settings mutation (theme, confirmDelete, userName, sortBy…).
 * Side effects (e.g. applying the theme) are owned by subscribers.
 */
export function setSetting(key, value) {
  setState({ settings: { ...getState().settings, [key]: value } });
  commit();
}

/* ------------------------------------------------------------------ */
/* Task items — live INSIDE task notes (note.type === "task")          */
/* Reuse all note infrastructure: ids, timestamps, lifecycle, search.  */
/* ------------------------------------------------------------------ */

function mutateTaskItems(noteId, mutator) {
  const note = getNoteById(noteId);
  if (!note || note.type !== "task" || !Array.isArray(note.items)) return false;
  const items = mutator(note.items.map((item) => ({ ...item })));
  if (!items) return false;
  setState({
    notes: getState().notes.map((n) =>
      n.id === noteId ? { ...n, items, updatedAt: nowIso() } : n
    ),
  });
  return true;
}

/** Add a task item. Counts as productivity (streak). */
export function addTaskItem(noteId, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const item = { id: createId(), text: trimmed, done: false };
  if (!mutateTaskItems(noteId, (items) => [...items, item])) return null;
  touchStreak();
  commit();
  return item;
}

/** Toggle an item's done state. Both directions count as productivity. */
export function toggleTaskItem(noteId, itemId) {
  if (!mutateTaskItems(noteId, (items) =>
    items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
  )) return;
  touchStreak();
  commit();
}

/** Rename a task item's text. */
export function renameTaskItem(noteId, itemId, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  const ok = mutateTaskItems(noteId, (items) =>
    items.map((item) => (item.id === itemId ? { ...item, text: trimmed } : item))
  );
  if (ok) commit();
  return ok;
}

/** Remove a task item. */
export function deleteTaskItem(noteId, itemId) {
  const ok = mutateTaskItems(noteId, (items) => items.filter((item) => item.id !== itemId));
  if (ok) commit();
  return ok;
}