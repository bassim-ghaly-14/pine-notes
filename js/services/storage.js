/**
 * Persistence service — owns ALL localStorage access for notes data.
 *
 * Storage strategy:
 *   - Single versioned key "pine-notes:v2" holding the full envelope.
 *     (The key name predates schema v3; renaming it would orphan existing
 *     users' data for zero benefit, so the key stays and the ENVELOPE
 *     carries the true schema version.)
 *
 *   - Schema history:
 *       v1 (original): plain array under "pine-notes", display-string dates,
 *                      category stored as a plain string on each note.
 *       v2 (Phase 1):  envelope {version:2, notes[]} with ids/ISO dates.
 *       v3 (Phase 2):  envelope {version:3, notes[], categories[], settings}.
 *                      Notes gain categoryId/archived/deletedAt/color.
 *                      Category strings upgrade into category entities;
 *                      assignments are preserved (never duplicated/lost).
 *       v4 (Phase 3):  Notes gain type("text"|"task") + items[] (task lists).
 *                      Settings gain theme/confirmDelete/userName.
 *                      New top-level streak slice
 *                      {currentStreak, longestStreak, lastActiveDate}.
 *
 *   - Corrupted payloads are quarantined to "pine-notes:corrupt-backup"
 *     instead of being destroyed; the app falls back gracefully.
 */

import { createId } from "../utils/id.js";

const STORAGE_KEY = "pine-notes:v2";
export const LEGACY_KEY = "pine-notes";
export const SCHEMA_VERSION = 4;
const CORRUPT_BACKUP_KEY = "pine-notes:corrupt-backup";

export const NOTE_COLORS = [null, "green", "blue", "amber", "rose", "purple"];
export const SORT_OPTIONS = ["updated", "created", "alpha", "pinned"];
export const THEME_MODES = ["light", "dark", "system"];
const TRASH_TTL_DAYS = 30;

/* ------------------------------------------------------------------ */
/* Validation / sanitization                                           */
/* ------------------------------------------------------------------ */

function sanitizeText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/** Coerce an unknown object into a valid note. Never throws. */
function sanitizeNote(raw) {
  if (!raw || typeof raw !== "object") return null;

  const createdAtMs = Date.parse(sanitizeText(raw.createdAt));
  const updatedAtMs = Date.parse(sanitizeText(raw.updatedAt));
  const deletedAtMs = raw.deletedAt == null ? NaN : Date.parse(raw.deletedAt);

  // Pre-V2 notes carried only a display string. Keep it as a fallback label.
  const legacyLabel = sanitizeText(raw.createdAtLabel ?? raw.createdAt);

  // Task items: only meaningful for task notes; sanitized defensively.
  let items;
  if (Array.isArray(raw.items)) {
    items = raw.items
      .map((item) =>
        item && typeof item === "object"
          ? {
              id: sanitizeText(item.id) || createId(),
              text: sanitizeText(item.text),
              done: item.done === true,
            }
          : null
      )
      .filter(Boolean);
  } else {
    items = [];
  }

  return {
    id: sanitizeText(raw.id) || createId(),
    type: raw.type === "task" ? "task" : "text", // existing notes never become tasks
    title: sanitizeText(raw.title),
    content: sanitizeText(raw.content),
    categoryId: sanitizeText(raw.categoryId) || null, // null = uncategorized
    color: NOTE_COLORS.includes(raw.color) ? raw.color : null,
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    deletedAt: Number.isNaN(deletedAtMs) ? null : new Date(deletedAtMs).toISOString(),
    createdAt: Number.isNaN(createdAtMs) ? null : new Date(createdAtMs).toISOString(),
    updatedAt: Number.isNaN(updatedAtMs)
      ? (Number.isNaN(createdAtMs) ? null : new Date(createdAtMs).toISOString())
      : new Date(updatedAtMs).toISOString(),
    ...(legacyLabel ? { createdAtLabel: legacyLabel } : {}),
    items,
  };
}

function sanitizeCategory(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = sanitizeText(raw.name).trim();
  if (!name) return null;
  return {
    id: sanitizeText(raw.id) || createId(),
    name,
    createdAt: Number.isNaN(Date.parse(raw.createdAt))
      ? new Date().toISOString()
      : raw.createdAt,
  };
}

const DEFAULT_SETTINGS = Object.freeze({
  sortBy: "updated",
  theme: null, // null = not yet chosen; resolved from legacy keys / system
  confirmDelete: true,
  userName: "",
});

function sanitizeSettings(raw) {
  const settings = raw && typeof raw === "object" ? raw : {};
    return {
    sortBy: SORT_OPTIONS.includes(settings.sortBy) ? settings.sortBy : DEFAULT_SETTINGS.sortBy,
    theme: THEME_MODES.includes(settings.theme) ? settings.theme : null,
    confirmDelete: settings.confirmDelete !== false, // default ON
    // Markdown rendering: opt-in (default OFF) so existing notes never
    // change appearance after upgrade. Missing key on old envelopes → false;
    // no schema bump needed because the sanitizer supplies the default.
    markdown: settings.markdown === true,
    userName: sanitizeText(settings.userName).slice(0, 60),
  };
}

/** Streak: minimal approved model. Invalid values fall back to zero-state. */
function sanitizeStreak(raw) {
  const streak = raw && typeof raw === "object" ? raw : {};
  const positiveInt = (value) => (Number.isInteger(value) && value > 0 ? value : 0);
  return {
    currentStreak: positiveInt(streak.currentStreak),
    longestStreak: Math.max(positiveInt(streak.longestStreak), positiveInt(streak.currentStreak)),
    lastActiveDate: /^\d{4}-\d{2}-\d{2}$/.test(streak.lastActiveDate ?? "")
      ? streak.lastActiveDate
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

/**
 * Migrate any recognized payload (v1 array, v2/v3 envelope, v4 envelope)
 * to the current schema. Pure: never touches storage. Exported for the
 * import pipeline (dataTransfer), which reuses this exact migration path.
 */
export function toV4(parsed) {
  // Accept v2 envelopes ({version:2, notes}) and any object with a notes array.
  const rawNotes = Array.isArray(parsed.notes) ? parsed.notes : [];
  const rawCategories = Array.isArray(parsed.categories) ? parsed.categories : [];

  let categories = rawCategories.map(sanitizeCategory).filter(Boolean);

  // Derive category entities from RAW notes BEFORE sanitization strips the
  // legacy `category` string field. Unknown/custom names become entities;
  // known names reuse the existing entity (no duplicates).
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const prepared = rawNotes.map((raw) => {
    if (
      raw && typeof raw === "object" &&
      !raw.categoryId &&
      typeof raw.category === "string" && raw.category.trim()
    ) {
      const key = raw.category.trim().toLowerCase();
      let cat = byName.get(key);
      if (!cat) {
        cat = { id: createId(), name: raw.category.trim(), createdAt: new Date().toISOString() };
        categories.push(cat);
        byName.set(key, cat);
      }
      return { ...raw, categoryId: cat.id };
    }
    return raw;
  });

  const notes = prepared.map(sanitizeNote).filter(Boolean);

  return {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    notes,
    categories,
    settings: sanitizeSettings(parsed.settings),
    streak: sanitizeStreak(parsed.streak),
  };
}

function freshData() {
  return {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    notes: [],
    categories: [],
    settings: { ...DEFAULT_SETTINGS },
    streak: sanitizeStreak(null),
  };
}

/* ------------------------------------------------------------------ */
/* Load                                                                */
/* ------------------------------------------------------------------ */

/**
 * Load the full data envelope. Order of preference:
 *   1. Valid current/older-versioned envelope → normalized to current schema.
 *   2. Corrupt payload + valid legacy         → quarantine, migrate legacy.
 *   3. Valid legacy array                     → migrate.
 *   4. Nothing usable                         → fresh install.
 */
export function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("[storage] Unable to read localStorage:", error);
    return { data: freshData(), migrated: false, recovered: false };
  }

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.notes)) {
        return {
          data: toV4(parsed),
          migrated: parsed.version !== SCHEMA_VERSION,
          recovered: false,
        };
      }
    } catch {
      /* fall through to corruption handling */
    }

    // Payload exists but is unusable — never destroy it silently.
    try {
      localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("[storage] Could not quarantine corrupted data:", error);
    }
    console.warn("[storage] Corrupted data quarantined under '" + CORRUPT_BACKUP_KEY + "'.");
  }

  const legacy = migrateLegacyRaw();
  if (legacy !== null) {
    return { data: toV4({ notes: legacy }), migrated: true, recovered: raw !== null };
  }

  return { data: freshData(), migrated: false, recovered: raw !== null };
}

/** Read + JSON-parse the V1 array. Returns array | null (never throws). */
function migrateLegacyRaw() {
  let raw = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch (error) {
    console.error("[storage] Unable to read legacy storage:", error);
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("[storage] Legacy data was not an array; ignoring.", typeof parsed);
      return null;
    }
    // The original legacy value stays untouched as a rollback copy.
    return parsed;
  } catch (error) {
    console.warn("[storage] Legacy data was malformed; ignoring.", error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Save                                                               */
/* ------------------------------------------------------------------ */

/**
 * Persist the whole envelope atomically. Returns true on success.
 * @param {{notes: any[], categories: any[], settings: object, streak: object}} data
 */
export function saveData({ notes, categories, settings, streak }) {
  const envelope = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    notes,
    categories,
    settings,
    streak,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch (error) {
    // Quota exceeded, private-mode failures, serialization issues…
    console.error("[storage] Failed to save notes:", error);
    return false;
  }
}

/** True when a trashed note is older than the 30-day purge window. */
export function isTrashExpired(note, now = Date.now()) {
  if (!note.deletedAt) return false;
  const age = now - Date.parse(note.deletedAt);
  return Number.isNaN(age) ? false : age > TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;
}
