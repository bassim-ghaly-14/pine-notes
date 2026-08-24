/**
 * Single-action undo registry (approved Phase 2 design).
 *
 * NOT a history engine: at most ONE pending undo exists at a time and it
 * expires after a short window. Actions offer an undo (label + restore
 * function); the UI (toast, Ctrl/Cmd+Z) consumes it via subscribe/consume.
 * This module owns no DOM and performs no persistence — it is the
 * mutation layer's bookkeeping for inverse mutations.
 */

const UNDO_WINDOW_MS = 6000;

let pending = null;
let timer = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(pending ? { label: pending.label } : null));
}

function expire() {
  pending = null;
  clearTimeout(timer);
  timer = null;
  notify();
}

/** Register (or replace) the pending undo. */
export function offerUndo(label, restore) {
  clearTimeout(timer);
  pending = { label, restore };
  timer = setTimeout(expire, UNDO_WINDOW_MS);
  notify();
}

/** Execute and clear the pending undo, if any. Returns true if it ran. */
export function consumeUndo() {
  if (!pending) return false;
  const { restore } = pending;
  expire();
  restore();
  return true;
}

export function getPendingUndo() {
  return pending ? { label: pending.label } : null;
}

export function subscribeUndo(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}