/**
 * Date formatting utilities.
 *
 * Notes created before V2 stored their date as a pre-formatted display
 * string ("Sat, August 22, 2026 …"). Those strings are preserved in
 * note.createdAtLabel and shown verbatim. New notes carry real ISO
 * timestamps and are formatted here at render time.
 */

const DATE_OPTIONS = {
  weekday: "short",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/** Human-readable label for a note's creation timestamp. */
export function formatNoteDate(note) {
  if (note.createdAt) {
    const date = new Date(note.createdAt);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("en-US", DATE_OPTIONS);
    }
  }
  // Legacy display string, kept exactly as the user saw it before.
  return note.createdAtLabel || "";
}