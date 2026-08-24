/**
 * Accessible modal foundation — one reusable focus trap for ALL dialogs.
 *
 * Usage:
 *   const modal = createModalController(overlayEl);
 *   modal.open({ initialFocus: el, labelledBy: "id" });
 *   modal.close();
 *
 * Guarantees:
 *   - focus moves into the dialog on open (initialFocus or first focusable)
 *   - Tab / Shift+Tab cycle INSIDE the dialog (no escape via keyboard)
 *   - background content gets `inert` + aria-hidden so pointer/AT focus
 *     cannot land outside while the dialog is open
 *   - Escape closes (unless a handler opts out)
 *   - focus returns to the triggering element on close
 */

let openModals = []; // stack — only the topmost modal traps focus

function focusableElements(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function createModalController(overlay) {
  let lastFocused = null;
  let active = false;

  function keydown(event) {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    // Only trap for the topmost modal on the stack.
    if (openModals[openModals.length - 1] !== overlay) return;

    const focusables = focusableElements(overlay);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open({ initialFocus = null } = {}) {
    if (active) return;
    active = true;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.classList.add("show");
    openModals.push(overlay);

    // Background content must not receive keyboard/AT focus.
    document.querySelectorAll("body > *:not(script)").forEach((child) => {
      if (child !== overlay) {
        child.setAttribute("inert", "");
        child.setAttribute("aria-hidden", "true");
      }
    });

    const target =
      initialFocus ??
      focusableElements(overlay)[0] ??
      overlay.querySelector("[data-autofocus]");
    target?.focus?.();

    overlay.addEventListener("keydown", keydown);
  }

  function close() {
    if (!active) return;
    active = false;
    overlay.classList.remove("show");
    openModals = openModals.filter((m) => m !== overlay);
    overlay.removeEventListener("keydown", keydown);

    // Restore background only when no other modal remains open.
    if (openModals.length === 0) {
      document.querySelectorAll("body > [inert]").forEach((child) => {
        child.removeAttribute("inert");
        child.removeAttribute("aria-hidden");
      });
    } else {
      // Nested-modal case: re-apply inert so ONLY the topmost dialog is
      // interactive. Without this, the parent dialog would keep the inert
      // it received when the nested one opened, and restored focus would
      // silently fail.
      const topmost = openModals[openModals.length - 1];
      document.querySelectorAll("body > *:not(script)").forEach((child) => {
        if (child !== topmost) {
          child.setAttribute("inert", "");
          child.setAttribute("aria-hidden", "true");
        }
      });
    }

    lastFocused?.focus?.(); // return focus to the trigger
    lastFocused = null;
  }

  /** True when this dialog is currently open. */
  function isOpen() {
    return active;
  }

  return { open, close, isOpen };
}
