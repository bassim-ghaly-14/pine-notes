/**
 * Markdown integration tests: settings default + sanitizer, migration
 * compatibility, and export/import round-trip of Markdown content.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import "./shim.mjs";
const { saveData, loadData, SCHEMA_VERSION } = await import("../js/services/storage.js");

test("settings: markdown defaults to false for old envelopes (no schema bump)", () => {
  localStorage.clear();
  localStorage.setItem(
    "pine-notes:v2",
    JSON.stringify({
      version: 4,
      notes: [],
      categories: [],
      settings: { sortBy: "updated", theme: "dark", confirmDelete: true, userName: "" },
      streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
    })
  );
    const loaded = loadData();
  assert.equal(loaded.data.settings.markdown, false); // existing users unaffected
  assert.equal(loaded.data.notes.length, 0);
});

test("settings: markdown=true persists and survives reload", () => {
  localStorage.clear();
  const ok = saveData({
    notes: [],
    categories: [],
    settings: { sortBy: "updated", theme: null, confirmDelete: true, userName: "", markdown: true },
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  });
  assert.equal(ok, true);
  assert.equal(loadData().data.settings.markdown, true);
});

test("schema version remains 4 — markdown needs no bump", () => {
  assert.equal(SCHEMA_VERSION, 4);
});

test("markdown content round-trips export → import byte-identically", async () => {
  const { buildExportEnvelope, serializeBackup, parseImportPayload } = await import("../js/services/dataTransfer.js");
  const content = "# Hello\n\nThis is **important** and `code`.\n\n- [ ] buy milk\n- [x] done";
  const state = {
    notes: [{
      id: "md1", type: "text", title: "MD note", content,
      categoryId: null, color: null, pinned: false, archived: false,
      deletedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      items: [],
    }],
    categories: [],
    settings: { sortBy: "updated", theme: null, confirmDelete: true, userName: "", markdown: true },
    streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
  };

  const json = serializeBackup(buildExportEnvelope(state));
  const imported = parseImportPayload(JSON.parse(json));
  assert.equal(imported.notes[0].content, content); // identical
  assert.equal(imported.notes[0].items.length, 0); // md checkboxes ≠ task items
  assert.ok(!("html" in imported.notes[0])); // no rendered HTML stored anywhere

  // And through actual storage:
  saveData(state);
  assert.equal(loadData().data.notes[0].content, content);
});
