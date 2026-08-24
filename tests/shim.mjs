/**
 * Minimal localStorage shim for Node so storage.js can be exercised
 * in tests without a browser.
 */

export function installStorageShim() {
  const map = new Map();
  const impl = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
  // Node ≥22 exposes a stub `localStorage` global that is not writable;
  // (re)define it so the shim always wins.
  try {
    Object.defineProperty(globalThis, "localStorage", {
      value: impl,
      configurable: true,
      writable: true,
    });
  } catch {
    globalThis.localStorage = impl;
  }
  return impl;
}

installStorageShim();
