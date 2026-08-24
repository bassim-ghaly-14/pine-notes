/** Stable note identity. Falls back for older browsers / non-secure contexts. */
export function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "n-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}