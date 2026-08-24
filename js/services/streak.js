/**
 * Daily streak logic — PURE functions, no state, no DOM, no persistence.
 *
 * A day is "active" when the user performs a meaningful productivity
 * action (creating/editing notes, adding/completing tasks). Opening the
 * app, searching, or changing settings does NOT count.
 *
 * Calendar-day continuity uses local "YYYY-MM-DD" keys (never raw
 * timestamps), so midnight boundaries, refreshes, and timezones are
 * handled by comparing date KEYS, not elapsed time.
 */

/** Local calendar date key for a Date → "YYYY-MM-DD". */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The local date key of the day BEFORE the given key.
 * Uses noon UTC on the parsed key to stay robust across DST shifts.
 */
export function previousDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const prev = new Date(noonUtc - 24 * 60 * 60 * 1000);
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(
    prev.getUTCDate()
  ).padStart(2, "0")}`;
}

export const EMPTY_STREAK = Object.freeze({ currentStreak: 0, longestStreak: 0, lastActiveDate: null });

/**
 * Record activity for `todayKey` against a streak. Pure: returns a NEW
 * streak object. Same-day activity is deduplicated (never increments).
 *
 *   first ever / long gap → currentStreak = 1
 *   lastActiveDate === yesterday → currentStreak += 1
 *   same day → unchanged
 */
export function recordActivity(streak, todayKey) {
  if (streak.lastActiveDate === todayKey) return streak; // dedupe same day

  const consecutive = streak.lastActiveDate === previousDayKey(todayKey);
  const currentStreak = consecutive ? streak.currentStreak + 1 : 1;
  return {
    currentStreak,
    longestStreak: Math.max(streak.longestStreak ?? 0, currentStreak),
    lastActiveDate: todayKey,
  };
}