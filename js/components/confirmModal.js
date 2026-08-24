/**
 * Confirm modal component — owns THE shared confirmation dialog
 * (role="dialog", Escape closes, focus lands on confirm).
 * Features supply title/message/confirm-label/onConfirm; this component
 * owns the DOM and nothing else.
 */

import { byId, qs } from "../utils/dom.js";
import { createModalController } from "../utils/focusTrap.js";

let modal = null;
let controller = null;

function ensure() {
  if (modal) return true;
  modal = byId("confirmModal");
  if (modal) controller = createModalController(modal);
  return Boolean(modal);
}

export function openConfirm({ title, message, confirmLabel = "Confirm", onConfirm }) {
  if (!ensure()) return;
  qs("#modalTitle", modal).textContent = title;
  qs("#modalMessage", modal).textContent = message;
  qs("#modalConfirm", modal).textContent = confirmLabel;
  modal._onConfirm = onConfirm;
  controller.open({ initialFocus: qs("#modalConfirm", modal) });
}

export function closeConfirm() {
  if (!controller) return;
  controller.close();
  modal._onConfirm = null;
}

/** Wire once at boot. */
export function initConfirmModal() {
  if (!ensure()) return;

  qs("#modalCancel", modal)?.addEventListener("click", closeConfirm);

  qs("#modalConfirm", modal)?.addEventListener("click", () => {
    const handler = modal._onConfirm;
    closeConfirm();
    handler?.();
  });
}
