/**
 * Theme service — OWNS applying appearance to the DOM.
 *
 * Persistence lives in the versioned settings envelope (actions.setSetting),
 * NOT in a separate storage key. This module only knows how to APPLY a mode:
 *   "light" | "dark" | "system" (resolves via prefers-color-scheme).
 * The legacy standalone theme keys are read once at boot for migration.
 */

import { byId } from "../utils/dom.js";

export function resolveMode(mode) {
  if (mode === "light" || mode === "dark") return mode;
  if (mode === "system" && typeof matchMedia === "function") {
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark"; // app default
}

function apply(mode) {
  const isLight = resolveMode(mode) === "light";
  document.body.classList.toggle("light", isLight);
  const btn = byId("themeBtn");
  if (btn) btn.textContent = isLight ? "☀" : "☾";
}

/** Initialize from a settings value, falling back to legacy keys, then dark. */
export function initTheme(mode = null) {
  let resolved = mode;
  if (!resolved) {
    try {
      const legacy = localStorage.getItem("pine-notes:theme") ?? localStorage.getItem("theme");
      resolved = legacy === "light" || legacy === "Light" ? "light" : null;
    } catch {
      resolved = null;
    }
  }
  apply(resolved ?? "dark");

  // Follow OS changes live while in "system" mode.
  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
      if ((mode ?? "") === "system") apply("system");
    });
  }
}

/** Apply an already-persisted mode change coming from settings. */
export function applyTheme(mode) {
  apply(mode);
}