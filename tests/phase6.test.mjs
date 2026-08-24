/**
 * Phase 6 regression tests — final-polish QA sweep.
 *
 * Covers behavior testable without a browser: undo registry, streak math,
 * Markdown/safeUrl security helpers, corrupted-storage recovery, schema
 * stability, import validation and merge rules. DOM-only behaviors (focus
 * trap, keyboard routing, responsive layout) are manual browser checks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import "./shim.mjs";
const { saveData, loadData, SCHEMA_VERSION } = await import("../js/services/storage.js");
const { offerUndo, consumeUndo, getPendingUndo, subscribeUndo } = await import("../js/state/undo.js");
const { recordActivity, toDateKey, previousDayKey } = await import("../js/services/streak.js");
const { safeUrl, parseInline, parseMarkdown } = await import("../js/utils/markdown.js");
const { parseImportPayload, applyMerge } = await import("../js/services/dataTransfer.js");

/* ---------------- Undo registry ---------------- */

test("undo: single pending undo is offered, replaced, and consumed once", () => {
  let ran = 0;
  offerUndo("Delete note", () => { ran += 1; });
  assert.equal(getPendingUndo()?.label, "Delete note");

  // A second offer replaces the first (only ONE pending undo ever).
  offerUndo("Archive note", () => {});
  assert.equal(getPendingUndo()?.label, "Archive note");

  assert.equal(consumeUndo(), true);
  assert.equal(ran, 0); // first restore was replaced, never ran
  assert.equal(getPendingUndo(), null);
  assert.equal(consumeUndo(), false); // nothing left to consume
});

test("undo: subscribers are notified with null after consumption", () => {
  const events = [];
  const off = subscribeUndo((pending) => events.push(pending?.label ?? null));
  offerUndo("x", () => {});
  consumeUndo();
  off();
  assert.deepEqual(events.slice(-2), ["x", null]);
});

/* ---------------- Streak ---------------- */

test("streak: same-day activity never increments", () => {
  const s = { currentStreak: 3, longestStreak: 5, lastActiveDate: "2026-08-24" };
  const next = recordActivity(s, "2026-08-24");
  assert.equal(next, s); // identical object → no state churn
});

test("streak: yesterday → +1, gap → reset to 1, longest tracked", () => {
  assert.equal(previousDayKey("2026-08-24"), "2026-08-23"); // month-safe via UTC noon
  const grown = recordActivity(
    { currentStreak: 2, longestStreak: 2, lastActiveDate: "2026-08-23" },
    "2026-08-24"
  );
  assert.equal(grown.currentStreak, 3);
  assert.equal(grown.longestStreak, 3);

  const reset = recordActivity(grown, "2026-09-01");
  assert.equal(reset.currentStreak, 1);
  assert.equal(reset.longestStreak, 3);

  assert.equal(toDateKey(new Date(2026, 7, 4)), "2026-08-04"); // zero-padded keys
});

/* ---------------- Markdown / URL security ---------------- */

test("safeUrl blocks dangerous schemes regardless of case or padding", () => {
  for (const bad of ["JAVASCRIPT:x", "JaVaScRiPt:alert(1)", " javascript:x", "DATA:text/html,x"]) {
    assert.equal(safeUrl(bad), null, bad);
  }
  assert.equal(safeUrl("https://example.com"), "https://example.com");
  assert.equal(safeUrl("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(safeUrl("relative/path"), "relative/path");
});

test("markdown IR never emits html/script node types from user content", () => {
  for (const source of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "[a](javascript:x)"]) {
    const walk = (nodes) => {
      for (const n of nodes) {
        assert.ok(n.t !== "html" && n.t !== "script", `unexpected node type ${n.t}`);
        (n.children ?? []).forEach(walk);
      }
    };
    walk(parseInline(source));
    for (const block of parseMarkdown(source)) {
      if (Array.isArray(block.children)) walk(block.children);
    }
  }
});

/* ---------------- Storage / schema ---------------- */

test("schema: key and version stay stable across a save/load round-trip", () => {
  localStorage.clear();
  const ok = saveData({
    notes: [],
    categories: [],
    settings: { sortBy: "updated", theme: "dark", confirmDelete: true, userName: "" },
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  });
  assert.equal(ok, true);
  const raw = JSON.parse(localStorage.getItem("pine-notes:v2"));
  assert.equal(raw.version, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 4); // DO NOT bump casually
  assert.equal(loadData().data.settings.sortBy, "updated");
});

test("storage: corrupted payload is quarantined, app recovers gracefully", () => {
  localStorage.clear();
  localStorage.setItem("pine-notes:v2", "{ this is not json !!!");
  const loaded = loadData();
  assert.equal(Array.isArray(loaded.data.notes), true); // fell back to fresh state
  assert.notEqual(localStorage.getItem("pine-notes:corrupt-backup"), null); // never destroyed silently
  assert.equal(localStorage.getItem("pine-notes:v2"), null);
});

/* ---------------- Import validation & merge ---------------- */

test("import: future versions and non-envelope shapes are rejected", () => {
  assert.throws(() => parseImportPayload({ version: 99, notes: [] }), /version/i);
  assert.throws(() => parseImportPayload({ hello: "world" }));
  assert.throws(() => parseImportPayload("just a string"));
});

test("merge: streak keeps max longestStreak and newest lastActiveDate", () => {
  const current = {
    notes: [], categories: [], settings: {},
    streak: { currentStreak: 2, longestStreak: 4, lastActiveDate: "2026-08-20" },
  };
  const imported = {
    notes: [], categories: [], settings: {},
    streak: { currentStreak: 7, longestStreak: 9, lastActiveDate: "2026-08-24" },
  };
  const merged = applyMerge(current, imported);
  assert.equal(merged.streak.currentStreak, 7);
  assert.equal(merged.streak.longestStreak, 9);
  assert.equal(merged.streak.lastActiveDate, "2026-08-24");

  // Older import must NOT drag the current streak backwards.
  const older = applyMerge(imported, {
    ...imported,
    streak: { currentStreak: 1, longestStreak: 2, lastActiveDate: "2026-01-01" },
  });
  assert.equal(older.streak.currentStreak, 7);
});
