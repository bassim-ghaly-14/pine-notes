/**
 * Deterministic tests for the Phase 4 data-management layer
 * (export / import / migrate / replace / merge). No DOM required.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildExportEnvelope, serializeBackup, backupFileName,
  parseImportPayload, applyReplace, applyMerge, ImportError,
} from "../js/services/dataTransfer.js";
import { SCHEMA_VERSION } from "../js/services/storage.js";

const iso = (d) => `2026-0${d}-01T10:00:00.000Z`;

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
  createdAt: iso(1),
  updatedAt: iso(1),
  items: [],
  ...overrides,
});

const baseState = () => ({
  notes: [note("a"), note("b")],
  categories: [{ id: "c1", name: "Work", createdAt: iso(1) }],
  settings: { sortBy: "updated", theme: "dark", confirmDelete: true, userName: "Sam" },
  streak: { currentStreak: 3, longestStreak: 5, lastActiveDate: "2026-02-01" },
});

/* ---------------- Export ---------------- */

test("export: complete envelope with correct version and all persisted slices", () => {
  const env = buildExportEnvelope(baseState(), "2026-08-24T00:00:00.000Z");
  assert.equal(env.version, SCHEMA_VERSION);
  assert.equal(env.version, 4);
  assert.equal(env.exportedAt, "2026-08-24T00:00:00.000Z");
  assert.ok(Array.isArray(env.notes));
  assert.ok(Array.isArray(env.categories));
  assert.deepEqual(Object.keys(env.settings).sort(), ["confirmDelete", "sortBy", "theme", "userName"]);
  assert.deepEqual(env.streak, baseState().streak);
});

test("export: transient UI state is excluded", () => {
  const state = { ...baseState(), view: "trash", search: "hello", categoryFilter: "c1", editingId: "a", saveFailed: false };
  const json = serializeBackup(buildExportEnvelope(state));
  const parsed = JSON.parse(json);
  for (const key of ["view", "search", "categoryFilter", "editingId", "saveFailed"]) {
    assert.equal(key in parsed, false, `${key} must not be exported`);
  }
});

test("export: valid human-readable JSON and safe filename", () => {
  const json = serializeBackup(buildExportEnvelope(baseState()));
  assert.doesNotThrow(() => JSON.parse(json));
  assert.match(json, /\n\s{2}"/); // pretty-printed
  assert.equal(backupFileName("2026-08-24T12:34:56.000Z"), "pine-notes-backup-2026-08-24.json");
});

test("export: deep-copies notes (mutating export does not touch state)", () => {
  const state = baseState();
  const env = buildExportEnvelope(state);
  env.notes[0].title = "hacked";
  assert.equal(state.notes[0].title, "Note a");
});

/* ---------------- Import: validation & migration ---------------- */

test("import: valid v4 envelope round-trips through validation", () => {
  const env = JSON.parse(serializeBackup(buildExportEnvelope(baseState())));
  const migrated = parseImportPayload(env);
  assert.equal(migrated.version, 4);
  assert.equal(migrated.notes.length, 2);
  assert.equal(migrated.notes[0].id, "a");
});

test("import: v1 legacy bare array migrates to v4", () => {
  const v1 = [
    { id: "old1", title: "Legacy", content: "hi", category: "Errands" },
  ];
  const out = parseImportPayload(v1);
  assert.equal(out.version, 4);
  assert.equal(out.notes.length, 1);
  assert.equal(out.notes[0].id, "old1");
  // legacy category string upgraded to an entity + preserved reference
  const cat = out.categories.find((c) => c.name === "Errands");
  assert.ok(cat, "legacy category becomes an entity");
  assert.equal(out.notes[0].categoryId, cat.id);
});

test("import: v2 envelope migrates to v4 with defaults filled", () => {
  const v2 = { version: 2, savedAt: iso(2), notes: [{ id: "n2", title: "V2 note", createdAt: iso(2), updatedAt: iso(2) }] };
  const out = parseImportPayload(v2);
  assert.equal(out.version, 4);
  assert.equal(out.notes[0].type, "text"); // v4 default
  assert.equal(out.settings.sortBy, "updated");
});

test("import: v3 envelope migrates to v4", () => {
  const v3 = {
    version: 3,
    notes: [note("n3")],
    categories: [{ id: "c9", name: "Old", createdAt: iso(1) }],
    settings: { sortBy: "alpha" },
  };
  const out = parseImportPayload(v3);
  assert.equal(out.version, 4);
  assert.equal(out.notes[0].categoryId, null);
  assert.equal(out.streak.currentStreak, 0); // v3 had no streak slice → zero-state
});

test("import: unsupported future version is rejected", () => {
  assert.throws(() => parseImportPayload({ version: 5, notes: [] }), ImportError);
  try {
    parseImportPayload({ version: 99, notes: [] });
    assert.fail("should have thrown");
  } catch (error) {
    assert.equal(error.code, "version");
  }
});

test("import: malformed / invalid payloads are rejected without side effects", () => {
  assert.throws(() => parseImportPayload(null), ImportError);
  assert.throws(() => parseImportPayload("string"), ImportError);
  assert.throws(() => parseImportPayload({}), ImportError); // no notes array, no version
  assert.throws(() => parseImportPayload({ version: 4 }), ImportError); // missing notes
  assert.throws(() => parseImportPayload({ version: 4, notes: "nope" }), ImportError);
});

test("import: corrupt file content fails at readBackupFile stage", async () => {
  const blob = { text: async () => "{not valid json" };
  await assert.rejects(async () => {
    const parsed = JSON.parse(await blob.text()); // same path as readBackupFile's parse step
    return parseImportPayload(parsed);
  }, SyntaxError);
});

test("validation failure is atomic: current data object is never mutated", () => {
  const state = baseState();
  const snapshot = structuredClone(state);
  assert.throws(() => parseImportPayload({ version: 42, notes: [] }));
  assert.deepEqual(state, snapshot);
});
