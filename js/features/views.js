/**
 * Views feature — lifecycle navigation (Active / Archive / Trash),
 * the sort selector (persisted via settings), and Empty Trash control.
 */

import { getState, subscribe } from "../state/store.js";
import { setView, setSortBy, emptyTrash } from "../state/actions.js";
import { delegate } from "../events/delegate.js";
import { openConfirm } from "../components/confirmModal.js";
import { showToast } from "../components/toast.js";
import { byId } from "../utils/dom.js";

const VIEW_LABELS = { active: "Active", archive: "Archive", trash: "Trash" };

let tabsEl = null;
let sortSelect = null;
let trashActions = null;

function viewCount(view) {
  return getState().notes.filter((note) =>
    view === "trash" ? Boolean(note.deletedAt)
    : view === "archive" ? note.archived && !note.deletedAt
    : !note.archived && !note.deletedAt
  ).length;
}

function renderTabs() {
  if (!tabsEl) return;
  const { view } = getState();
  const fragment = document.createDocumentFragment();

  Object.entries(VIEW_LABELS).forEach(([key, label]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "view-tab" + (view === key ? " selected" : "");
    tab.dataset.view = key;
    if (view === key) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
    tab.textContent = `${label} (${viewCount(key)})`;
    fragment.appendChild(tab);
  });

  tabsEl.replaceChildren(fragment);

  // "Empty Trash" only makes sense inside the Trash view.
  if (trashActions) trashActions.style.display = view === "trash" ? "" : "none";
}

export function initViews() {
  tabsEl = byId("viewTabs");
  sortSelect = byId("sortSelect");
  trashActions = byId("trashActions");

  delegate(tabsEl, "click", "data-view", (view) => setView(view));

  sortSelect?.addEventListener("change", () => {
    setSortBy(sortSelect.value);
  });
  // Reflect persisted setting into the control on boot and after changes.
  const syncSort = () => {
    if (sortSelect) sortSelect.value = getState().settings.sortBy;
  };

  byId("emptyTrashBtn")?.addEventListener("click", () => {
    const trashed = getState().notes.filter((n) => n.deletedAt).length;
    if (trashed === 0) {
      showToast("Trash is Already Empty", "warning");
      return;
    }
    const finish = () => {
      emptyTrash();
      showToast("Trash Emptied", "danger");
    };
    if (!getState().settings.confirmDelete) return finish();
    openConfirm({
      title: "Empty Trash",
      message: `${trashed} note${trashed === 1 ? "" : "s"} will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Empty Trash",
      onConfirm: finish,
    });
  });

  subscribe(() => {
    renderTabs();
    syncSort();
  });
  renderTabs();
  syncSort();
}