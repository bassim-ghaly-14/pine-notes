/**
 * Data transfer — Export / Import / Merge. PURE logic, no DOM.
 *
 * Envelope contract (matches storage.js):
 *   { version: 4, savedAt, notes[], categories[], settings{}, streak{} }
 * Transient UI state (search, view, modal/palette state, undo) lives in
 * store.js only and is NEVER part of the envelope → never exported.
 *
 * Import pipeline: parse → validate shape → validate version → migrate
 * (v1/v2/v3 → v4 via the SAME toV4 used at boot) → preview → commit.
 * Validation failures throw ImportError BEFORE any state is touched,
 * so a bad file can never partially modify existing data.
 *
 * Merge rules (deterministic, documented):
 *   Notes      — imported ids are preserved when valid. An id collision is
 *                resolved by newer `updatedAt` winning; exact ties keep the
 *                EXISTING note (never silently overwrite unrelated work).
 *                Duplicate ids WITHIN one import file: newer updatedAt wins.
 *   Categories — deduped by normalized name (trim + lowercase); an imported
 *                category whose normalized name already exists maps onto the
 *                existing category (note references are remapped to its id).
 *   Settings   — current settings WIN during merge (imported settings are
 *                ignored). Replace mode replaces them wholesale.
 *   Streak     — the entry with the more recent `lastActiveDate` provides
 *                `currentStreak` + `lastActiveDate`; `longestStreak` is the
 *                max of both. Ties keep the existing entry's current streak.
 */

import { SCHEMA_VERSION, toV4 } from "./storage.js";

export class ImportError extends Error {
  constructor(message, code = "invalid") {
    super(message);
    this.name = "ImportError";
    this.code = code; // "parse" | "schema" | "version" | "invalid"
  }
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/** Build the complete persisted envelope for export. Pure. */
export function buildExportEnvelope(
  { notes, categories, settings, streak },
  exportedAt = new Date().toISOString()
) {
  return {
    version: SCHEMA_VERSION,
    exportedAt,
    savedAt: exportedAt,
    notes: structuredClone(notes),
    categories: structuredClone(categories),
    settings: { ...settings },
    streak: { ...streak },
  };
}

/** Human-readable JSON for the backup file. Pure. */
export function serializeBackup(envelope) {
  return JSON.stringify(envelope, null, 2);
}

/** "pine-notes-backup-YYYY-MM-DD.json" from an ISO timestamp. */
export function backupFileName(iso = new Date().toISOString()) {
  return `pine-notes-backup-${iso.slice(0, 10)}.json`;
}

/* ------------------------------------------------------------------ */
/* Import — validation + migration                                     */
/* ------------------------------------------------------------------ */

/**
 * Validate + migrate raw parsed JSON into a full v4 envelope.
 * Throws ImportError on unknown shapes or unsupported future versions.
 * Never mutates its input.
 */
export function parseImportPayload(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new ImportError("This file is not a Pine Notes backup.", "schema");
  }

  const looksLikeV1 = Array.isArray(parsed);
  const version = !looksLikeV1 && typeof parsed.version === "number" ? Math.floor(parsed.version) : NaN;

  if (!looksLikeV1 && Number.isNaN(version)) {
    throw new ImportError("This file has no recognizable schema version.", "schema");
  }
  if (!Number.isNaN(version) && version > SCHEMA_VERSION) {
    throw new ImportError(
      `This backup was created by a newer version of Pine Notes (v${version}). This app supports up to v${SCHEMA_VERSION}.`,
      "version"
    );
  }

  // v1 legacy format: a bare array of note objects under key "pine-notes".
  const payload = looksLikeV1 ? { notes: parsed } : parsed;

  if (!Array.isArray(payload.notes)) {
    throw new ImportError('Invalid backup: the "notes" section is missing or damaged.', "schema");
  }

  // Same migration path as boot: v1/v2/v3 payloads come out fully v4,
  // with every note/category/settings/streak field sanitized.
  return toV4(payload);
}

/** Read a File/Blob → parsed JSON. Throws ImportError("parse") on bad JSON. */
export async function readBackupFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    throw new ImportError("The file could not be read.", "parse");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError("This file is not valid JSON.", "parse");
  }
}

/* ------------------------------------------------------------------ */
/* Strategies                                                          */
/* ------------------------------------------------------------------ */

const newerUpdatedAt = (a, b) => {
  const ta = Date.parse(a?.updatedAt ?? "") || 0;
  const tb = Date.parse(b?.updatedAt ?? "") || 0;
  return tb > ta ? b : a; // ties → a (the existing item)
};

/** REPLACE: current data is discarded, imported data becomes everything. */
export function applyReplace(current, imported) {
  return {
    notes: imported.notes,
    categories: imported.categories,
    settings: imported.settings,
    streak: imported.streak,
  };
}

const normalizeName = (name) => String(name ?? "").trim().toLowerCase();

/**
 * MERGE: imported data is combined into current data using the rules
 * documented in the module header. Pure — returns new slices only.
 */
export function applyMerge(current, imported) {
  /* Categories: dedupe by normalized name, build id remap table. */
  const categories = [...current.categories];
  const idRemap = new Map();
  for (const cat of imported.categories) {
    const existing = categories.find((c) => normalizeName(c.name) === normalizeName(cat.name));
    if (existing) {
      idRemap.set(cat.id, existing.id);
    } else {
      categories.push(cat);
      idRemap.set(cat.id, cat.id);
    }
  }

  /* Notes: dedupe within the import file first, then against current data. */
  const incoming = new Map();
  for (const note of imported.notes) {
    incoming.set(note.id, newerUpdatedAt(incoming.get(note.id), note));
  }

  const mergedById = new Map(current.notes.map((n) => [n.id, n]));
  for (const [id, note] of incoming) {
    // Collision → newer updatedAt wins; tie keeps the EXISTING note.
    const existing = mergedById.get(id);
    mergedById.set(id, existing ? newerUpdatedAt(existing, note) : note);
  }

  const notes = [...mergedById.values()].map((note) =>
    note.categoryId && idRemap.has(note.categoryId)
      ? { ...note, categoryId: idRemap.get(note.categoryId) }
      : note
  );

  /* Settings: current settings win during merge. */
  const settings = { ...current.settings };

  /* Streak: the more recent lastActiveDate carries its currentStreak
     through; longestStreak is the max of both. Ties keep current. */
  const cur = current.streak;
  const imp = imported.streak;
  const curDate = Date.parse(cur.lastActiveDate ?? "") || 0;
  const impDate = Date.parse(imp.lastActiveDate ?? "") || 0;
  const streak =
    impDate > curDate
      ? {
          ...cur,
          currentStreak: imp.currentStreak,
          lastActiveDate: imp.lastActiveDate,
          longestStreak: Math.max(cur.longestStreak ?? 0, imp.longestStreak ?? 0),
        }
      : { ...cur, longestStreak: Math.max(cur.longestStreak ?? 0, imp.longestStreak ?? 0) };

  return { notes, categories, settings, streak };
}
