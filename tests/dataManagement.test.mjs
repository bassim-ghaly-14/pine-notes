/**
 * Tests for Replace / Merge strategies and storage persistence
 * (atomic failure, successful persistence, refresh survival).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import "./shim.mjs";
const { saveData, loadData } = await import("../js/services/storage.js");
const { applyReplace, applyMerge, parseImportPayload } = await import("../js/services/dataTransfer.js");

const note = (id, overrides = {}) => ({
  id,
  type: "text",
  title: `Note ${id}`,
  content: "body",
  categoryId: null,
  color: null,
  pinned: false,
  archived: false,
  deletedAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
  items: [],
  ...overrides,
});

const baseState = () => ({
  notes: [note("a"), note("b")],
  categories: [{ id: "c1", name: "Work", createdAt: "2026-01-01T10:00:00.000Z" }],
  settings: { sortBy: "updated", theme: "dark", confirmDelete: true, userName: "Sam" },
  streak: { currentStreak: 3, longestStreak: 5, lastActiveDate: "2026-02-01" },
});

/* ---------------- Replace ---------------- */

test("replace: imported data fully replaces current data", () => {
  const current = baseState();
  const imported = parseImportPayload({
    version: 4,
    notes: [note("x")],
    categories: [{ id: "cx", name: "Fresh", createdAt: "2026-03-01T00:00:00.000Z" }],
    settings: { sortBy: "alpha", theme: "light", confirmDelete: false, userName: "Ash" },
    streak: { currentStreak: 1, longestStreak: 1, lastActiveDate: "2026-03-01" },
  });
  const out = applyReplace(current, imported);
  assert.deepEqual(out.notes.map((n) => n.id), ["x"]);
  assert.equal(out.categories[0].name, "Fresh");
  assert.equal(out.settings.userName, "Ash");
  assert.equal(out.streak.currentStreak, 1);
});

/* ---------------- Merge ---------------- */

test("merge: new ids are added, existing ids preserved", () => {
  const current = baseState();
  const imported = { notes: [note("new1")], categories: [], settings: {}, streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null } };
  const out = applyMerge(current, imported);
  const ids = out.notes.map((n) => n.id).sort();
  assert.deepEqual(ids, ["a", "b", "new1"]);
  assert.equal(out.notes.find((n) => n.id === "a").title, "Note a"); // untouched
});

test("merge: id collision → newer updatedAt wins", () => {
  const current = baseState(); // a.updatedAt = Jan 1
  const imported = {
    notes: [note("a", { title: "Newer backup copy", updatedAt: "2026-06-01T00:00:00.000Z" })],
    categories: [],
    settings: {},
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  };
  const out = applyMerge(current, imported);
    assert.equal(out.notes.length, 2); // no duplicate created
  assert.equal(out.notes.find((n) => n.id === "a").title, "Newer backup copy");
});

test("merge: id collision tie → existing note kept (no silent overwrite)", () => {
  const current = baseState();
  const imported = {
    notes: [note("a", { title: "Same-timestamp copy", updatedAt: "2026-01-01T10:00:00.000Z" })],
    categories: [],
    settings: {},
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  };
  const out = applyMerge(current, imported);
  assert.equal(out.notes.find((n) => n.id === "a").title, "Note a");
});

test("merge: duplicate ids WITHIN one file resolve to the newest", () => {
  const current = baseState();
  const imported = {
    notes: [
      note("d", { title: "older", updatedAt: "2026-01-05T00:00:00.000Z" }),
      note("d", { title: "newest", updatedAt: "2026-01-09T00:00:00.000Z" }),
    ],
    categories: [],
    settings: {},
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  };
  const out = applyMerge(current, imported);
  const dNotes = out.notes.filter((n) => n.id === "d");
  assert.equal(dNotes.length, 1);
    assert.equal(dNotes[0].title, "newest");
});

test("merge: categories deduped by normalized name; references remapped", () => {
  const current = baseState(); // has "Work" with id c1
  const importedCatId = "import-cat-1";
  const imported = {
    notes: [note("m1", { categoryId: importedCatId })],
    categories: [
      { id: importedCatId, name: "  work ", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "other", name: "Personal", createdAt: "2026-04-01T00:00:00.000Z" },
    ],
    settings: {},
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  };
  const out = applyMerge(current, imported);
  assert.equal(out.categories.filter((c) => c.name.toLowerCase() === "work").length, 1);
  assert.ok(out.categories.some((c) => c.name === "Personal"));
  assert.equal(out.notes.find((n) => n.id === "m1").categoryId, "c1");
});

test("merge: settings are ignored — current settings win", () => {
  const current = baseState();
  const imported = {
    notes: [],
    categories: [],
    settings: { sortBy: "alpha", theme: "light", confirmDelete: false, userName: "Other" },
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  };
  const out = applyMerge(current, imported);
  assert.equal(out.settings.theme, "dark");
  assert.equal(out.settings.userName, "Sam");
  assert.equal(out.settings.sortBy, "updated");
});

test("merge: is pure — inputs are never mutated", () => {
  const current = baseState();
  const snapshot = structuredClone(current);
  applyMerge(current, {
    notes: [note("z")],
    categories: [{ id: "q", name: "work", createdAt: "" }],
    settings: {},
    streak: { currentStreak: 9, longestStreak: 9, lastActiveDate: "2027-01-01" },
  });
    assert.deepEqual(current, snapshot);
});

test("merge: streak — more recent lastActiveDate carries its current streak; longest is max", () => {
  const current = baseState(); // current=3, longest=5, date Feb 1
  const newerImport = {
    notes: [], categories: [], settings: {},
    streak: { currentStreak: 7, longestStreak: 7, lastActiveDate: "2026-07-01" },
  };
  let out = applyMerge(current, newerImport);
  assert.equal(out.streak.currentStreak, 7);
  assert.equal(out.streak.lastActiveDate, "2026-07-01");
  assert.equal(out.streak.longestStreak, 7);

  const olderImport = {
    notes: [], categories: [], settings: {},
    streak: { currentStreak: 9, longestStreak: 2, lastActiveDate: "2025-12-01" },
  };
  out = applyMerge(current, olderImport); // import date OLDER → current streak kept
  assert.equal(out.streak.currentStreak, 3);
  assert.equal(out.streak.lastActiveDate, "2026-02-01");
  assert.equal(out.streak.longestStreak, 5);
});

/* ---------------- Storage integration ---------------- */

test("storage: failed import does not modify persisted state", () => {
  localStorage.clear();
  saveData(baseState());
  const before = localStorage.getItem("pine-notes:v2");

  assert.throws(() => parseImportPayload({ version: 42, notes: [] }));
  assert.equal(localStorage.getItem("pine-notes:v2"), before);
  assert.equal(loadData().data.notes.length, 2);
});

test("storage: successful replace persists and survives reload", () => {
  localStorage.clear();
  saveData(baseState());
  const current = loadData().data;

  const imported = parseImportPayload({
    version: 4,
    notes: [note("only")],
    categories: [],
    settings: { sortBy: "alpha", theme: "light", confirmDelete: true, userName: "" },
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  });
  const next = applyReplace(
    { notes: current.notes, categories: current.categories, settings: current.settings, streak: current.streak },
    imported
  );
  assert.equal(saveData(next), true);

  // Simulate refresh: fresh load from localStorage only.
  const reloaded = loadData();
  assert.equal(reloaded.data.notes.length, 1);
  assert.equal(reloaded.data.notes[0].id, "only");
  assert.equal(reloaded.data.version, 4);
  assert.equal(reloaded.migrated, false);
});
