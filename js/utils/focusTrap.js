/**
 * Accessible modal foundation — ONE reusable controller for ALL dialogs,
 * built on the native <dialog> element.
 *
 * Usage:
 *   const modal = createModalController(dialogEl);
 *   modal.open({ initialFocus: el });
 *   modal.close();
 *
 * Guarantees (provided natively by showModal() and kept intact here):
 *   - focus moves into the dialog on open (initialFocus or first focusable)
 *   - Tab / Shift+Tab cycle INSIDE the dialog (no escape via keyboard)
 *   - background content becomes inert while the dialog is open, so
 *     pointer/AT focus cannot land outside
 *   - Escape closes (via the `cancel` event, unless a handler opts out)
 *   - focus returns to the triggering element on close
 *   - stacked dialogs keep only the topmost one interactive (top layer)
 */

function focusableElements(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function createModalController(dialog) {
  let lastFocused = null;
  let active = false;
  let showFrame = 0;

  function onCancel(event) {
    // Escape must flow through the single close() path so cleanup and
    // focus restoration stay consistent with programmatic closes.
    event.preventDefault();
    close();
  }

  function open({ initialFocus = null } = {}) {
    if (active) return;
    active = true;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // showModal() provides the focus trap, the modal top layer, background
    // inertness and Escape handling natively.
    dialog.addEventListener("cancel", onCancel);
    dialog.showModal();

    // The dialog just switched from display:none to display:flex; add the
    // animation class on the next frame so the opacity transition runs.
    showFrame = requestAnimationFrame(() => {
      showFrame = 0;
      dialog.classList.add("show");
    });

    const target =
      initialFocus ??
      focusableElements(dialog)[0] ??
      dialog.querySelector("[data-autofocus]");
    target?.focus?.();
  }

  function close() {
    if (!active) return;
    active = false;
    if (showFrame) {
      cancelAnimationFrame(showFrame);
      showFrame = 0;
    }
    dialog.classList.remove("show");
    dialog.removeEventListener("cancel", onCancel);
    dialog.close();

    lastFocused?.focus?.(); // return focus to the trigger
    lastFocused = null;
  }

  /** True when this dialog is currently open. */
  function isOpen() {
    return active;
  }

  return { open, close, isOpen };
}
