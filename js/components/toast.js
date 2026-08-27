 /**
 * Toast notifications.
 *
 * Supports an optional single action button ("Undo") alongside
 * the message. The action button lives only as long as the toast does.
 */

import { byId } from "../utils/dom.js";

const TYPE_CLASSES = [
  "toast-success",
  "toast-danger",
  "toast-warning",
];

let hideTimer = null;
let toastEl = null;
let actionBtn = null;
let activeAction = null;

function ensureElements() {
  if (toastEl) {
    return true;
  }

  toastEl = byId("toast");

  if (!toastEl) {
    return false;
  }

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

function updateToastMessage(message) {
  const text = document.createTextNode(message);

  actionBtn.before(text);

  [...toastEl.childNodes].forEach((node) => {
    if (
      node.nodeType === Node.TEXT_NODE &&
      node !== text
    ) {
      node.remove();
    }
  });
}

function updateAction(action) {
  activeAction = action?.onAction ?? null;

  actionBtn.textContent = action?.label ?? "";
  actionBtn.style.display = action ? "" : "none";
}

function updateToastType(type) {
  toastEl.classList.remove(...TYPE_CLASSES);
  toastEl.classList.add(
    "show",
    `toast-${type}`
  );
}

function scheduleHide(action) {
  hideTimer = setTimeout(
    hideToast,
    action ? 6000 : 2000
  );
}

/**
 * Shows a toast notification.
 *
 * @param {string} message
 * @param {"success"|"danger"|"warning"} type
 * @param {{label: string, onAction: Function}} [action]
 *        Optional action button, e.g. Undo.
 */
export function showToast(
  message,
  type = "success",
  action = null
) {
  if (!ensureElements()) {
    return;
  }

  clearTimeout(hideTimer);

  updateToastMessage(message);
  updateAction(action);
  updateToastType(type);
  scheduleHide(action);
}