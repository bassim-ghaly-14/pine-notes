/** Tiny DOM query helpers so modules stop repeating getElementById. */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function byId(id) {
  return document.getElementById(id);
}