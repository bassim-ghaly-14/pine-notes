/**
 * Toast notifications.
 * Phase 2: supports an optional single action button ("Undo") alongside
 * the message. The action lives only as long as the toast does.
 */

import { byId } from "../utils/dom.js";

const TYPE_CLASSES = ["toast-success", "toast-danger", "toast-warning"];
let hideTimer = null;
let toastEl = null;
let actionBtn = null;
let activeAction = null;

function ensureElements() {
  if (toastEl) return true;
  toastEl = byId("toast");
  if (!toastEl) return false;

  // Action button is created once and toggled per toast.
  actionBtn = document.createElement("button");
  actionBtn.type = "button";
  actionBtn.className = "toast-action";
  actionBtn.addEventListener("click", () => {
    const fn = activeAction;
    hideToast();
    fn?.();
  });
  toastEl.appendChild(actionBtn);
  return true;
}

function hideToast() {
  clearTimeout(hideTimer);
  toastEl.classList.remove("show");
  activeAction = null;
}

/**
 * @param {string} message
 * @param {"success"|"danger"|"warning"} type
 * @param {{label: string, onAction: Function}} [action] e.g. Undo.
 */
export function showToast(message, type = "success", action = null) {
  if (!ensureElements()) return;

  clearTimeout(hideTimer);

  // Rebuild the text node so the action button always sits after it.
  const text = document.createTextNode(message);
  toastEl.insertBefore(text, actionBtn);
  [...toastEl.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && node !== text) node.remove();
  });

  activeAction = action?.onAction ?? null;
  actionBtn.textContent = action?.label ?? "";
  actionBtn.style.display = action ? "" : "none";

  toastEl.classList.remove(...TYPE_CLASSES);
  toastEl.classList.add("show", `toast-${type}`);

  hideTimer = setTimeout(hideToast, action ? 6000 : 2000);
}