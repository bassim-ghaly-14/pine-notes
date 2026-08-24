/**
 * Settings feature — a lightweight modal for Appearance (theme), Notes
 * (default sort), Behavior (confirm-before-delete) and Profile (optional
 * display name). All persistence flows through actions.setSetting.
 */

import { getState, subscribe } from "../state/store.js";
import { setSetting } from "../state/actions.js";
import { applyTheme } from "../services/theme.js";
import { byId, qs } from "../utils/dom.js";
import { createModalController } from "../utils/focusTrap.js";

let overlay = null;
let controller = null;

function syncControls() {
  const { settings } = getState();
  const themeSelect = qs("#settingTheme", overlay);
  if (themeSelect && document.activeElement !== themeSelect) {
    themeSelect.value = settings.theme ?? "dark"; // unresolved default shown as dark
  }
  const sortSelect = qs("#settingSort", overlay);
  if (sortSelect && document.activeElement !== sortSelect) {
    sortSelect.value = settings.sortBy;
  }
  const confirmCheckbox = qs("#settingConfirmDelete", overlay);
  if (confirmCheckbox) confirmCheckbox.checked = settings.confirmDelete !== false;

  const markdownCheckbox = qs("#settingMarkdown", overlay);
  if (markdownCheckbox && document.activeElement !== markdownCheckbox) {
    markdownCheckbox.checked = settings.markdown === true;
  }

  const nameInput = qs("#settingDisplayName", overlay);
  if (nameInput && document.activeElement !== nameInput) nameInput.value = settings.userName;

  const longest = qs("#settingLongestStreak", overlay);
  if (longest) {
    longest.textContent = `${getState().streak.longestStreak} day${getState().streak.longestStreak === 1 ? "" : "s"}`;
  }
}

export function openSettings() {
  if (!overlay || !controller) return;
  syncControls();
  controller.open({ initialFocus: qs("#settingTheme", overlay) });
}

function closeSettings() {
  controller?.close();
}

/** Apply side effects of settings changes that are not pure state. */
function onSettingChanged(key, value) {
  if (key === "theme") applyTheme(value);
}

export function initSettings() {
  overlay = byId("settingsModal");
  if (!overlay) return;
  controller = createModalController(overlay);

  qs("#closeSettingsBtn", overlay)?.addEventListener("click", closeSettings);

  qs("#settingTheme", overlay)?.addEventListener("change", (event) => {
    setSetting("theme", event.target.value);
    onSettingChanged("theme", event.target.value);
  });

  qs("#settingSort", overlay)?.addEventListener("change", (event) => {
    setSetting("sortBy", event.target.value);
  });

  qs("#settingConfirmDelete", overlay)?.addEventListener("change", (event) => {
    setSetting("confirmDelete", event.target.checked);
  });

  qs("#settingMarkdown", overlay)?.addEventListener("change", (event) => {
    setSetting("markdown", event.target.checked);
  });

  let nameTimer = null;
  qs("#settingDisplayName", overlay)?.addEventListener("input", (event) => {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => setSetting("userName", event.target.value.trim()), 300);
  });

  subscribe(syncControls);
}