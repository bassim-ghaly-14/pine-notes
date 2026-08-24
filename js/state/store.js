/**
 * Central application state.
 *
 * Ownership rules:
 *   - This module owns the state tree. Nothing else mutates it directly.
 *   - Mutations happen exclusively through actions.js, which persists via
 *     the storage service and then calls setState().
 *   - Subscribers are notified on every change; features render from
 *     getState(), never from their own copies.
 */

const listeners = new Set();

let state = {
  notes: [],            // canonical note list (order = creation order, never sorted for UI)
  categories: [],       // [{id, name, createdAt}]
  settings: { sortBy: "updated", theme: null, confirmDelete: true, userName: "" },
  streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  view: "active",       // "active" | "archive" | "trash" — UI state, not persisted
  categoryFilter: null, // category id | null (null = all) — UI state
  search: "",           // UI state
  editingId: null,      // note id being edited in the form — UI state
  saveFailed: false,    // set when persistence errors occur
};

export function initState(initial) {
  state = { ...state, ...initial };
}

export function getState() {
  return state;
}

/** Shallow-merge a patch and notify subscribers. */
export function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

/** Register a state listener. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}