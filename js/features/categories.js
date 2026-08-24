/**
 * Keep the form's category <select> in sync with the category entities.
 * Preserves the current selection across re-renders when possible.
 */
function renderCategorySelect() {
  const select = byId("noteCategory");
  if (!select) return;
  const previous = select.value;
  const { categories } = getState();

  const fragment = document.createDocumentFragment();
  const uncategorized = document.createElement("option");
  uncategorized.value = "";
  uncategorized.textContent = "Uncategorized";
  fragment.appendChild(uncategorized);

  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = cat.name;
    fragment.appendChild(option);
  });

  select.replaceChildren(fragment);
  select.value = categories.some((c) => c.id === previous) ? previous : "";
}

/**
 * Categories feature — chip navigation with counts + management modal
 * (create / rename / delete). Deleting a category never deletes notes.
 */

import { getState, subscribe } from "../state/store.js";
import {
  addCategory, renameCategory, deleteCategory, setCategoryFilter,
} from "../state/actions.js";
import { delegate } from "../events/delegate.js";
import { showToast } from "../components/toast.js";
import { createModalController } from "../utils/focusTrap.js";
import { byId, qs } from "../utils/dom.js";

let chipsEl = null;
let manageModal = null;
let controller = null;

/** Active (non-archived, non-trashed) note counts per category. */
function countsByCategory() {
  const counts = new Map();
  getState().notes.forEach((note) => {
    if (note.archived || note.deletedAt || !note.categoryId) return;
    counts.set(note.categoryId, (counts.get(note.categoryId) ?? 0) + 1);
  });
  return counts;
}

function renderChips() {
  if (!chipsEl) return;
  const { categories, categoryFilter } = getState();
  const counts = countsByCategory();
  const fragment = document.createDocumentFragment();

  const makeChip = (label, id, count, selected) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "category-chip" + (selected ? " selected" : "");
    chip.dataset.action = "filter";
    chip.dataset.id = id ?? "";
    chip.setAttribute("aria-pressed", String(selected));
    chip.textContent = count === null ? label : `${label} (${count})`;
    return chip;
  };

  const total = getState().notes.filter((n) => !n.archived && !n.deletedAt).length;
  fragment.appendChild(makeChip("All Notes", null, total, !categoryFilter));

  categories.forEach((cat) =>
    fragment.appendChild(makeChip(cat.name, cat.id, counts.get(cat.id) ?? 0, categoryFilter === cat.id))
  );

  const manageBtn = document.createElement("button");
  manageBtn.type = "button";
  manageBtn.className = "category-chip manage";
  manageBtn.dataset.action = "manage";
  manageBtn.textContent = "Manage…";
  fragment.appendChild(manageBtn);

  chipsEl.replaceChildren(fragment);
}

/* ------------------------------------------------------------------ */
/* Manage modal                                                        */
/* ------------------------------------------------------------------ */

function renderManager() {
  const listEl = qs("#categoryList", manageModal);
  if (!listEl) return;
  const { categories } = getState();
  const fragment = document.createDocumentFragment();

  categories.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.dataset.id = cat.id;

    const input = document.createElement("input");
    input.type = "text";
    input.value = cat.name;
    input.dataset.role = "name";
    input.setAttribute("aria-label", `Rename ${cat.name}`);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.dataset.action = "rename";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.action = "delete-category";

    row.append(input, saveBtn, deleteBtn);
    fragment.appendChild(row);
  });

  if (categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "modal-note";
    empty.textContent = "No categories yet. Add one below.";
    fragment.appendChild(empty);
  }

  listEl.replaceChildren(fragment);
}

function openManager() {
  renderManager();
  controller.open({ initialFocus: qs("#newCategoryName", manageModal) });
}

function closeManager() {
  controller?.close();
}

/* ------------------------------------------------------------------ */
/* Initialization                                                      */
/* ------------------------------------------------------------------ */

export function initCategories() {
  chipsEl = byId("categoryChips");
  manageModal = byId("manageCategoriesModal");
  controller = createModalController(manageModal);

  delegate(chipsEl, "click", "data-action", (action, el) => {
    if (action === "manage") return openManager();
    setCategoryFilter(el.dataset.id || null);
  });

  qs("#addCategoryBtn", manageModal)?.addEventListener("click", () => {
    const input = qs("#newCategoryName", manageModal);
    if (!input) return;
    if (input.value.trim()) {
      addCategory(input.value);
      showToast("Category Added", "success");
      input.value = "";
      renderManager();
    }
  });
  // Enter in the new-category field adds it.
  qs("#newCategoryName", manageModal)?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      qs("#addCategoryBtn", manageModal)?.click();
    }
  });

  // Rename / delete rows inside the manager (delegated).
  delegate(qs("#categoryList", manageModal), "click", "data-action", (action, el) => {
    const row = el.closest("[data-id]");
    if (!row?.dataset.id) return;
    const id = row.dataset.id;

    if (action === "rename") {
      const nameInput = qs('[data-role="name"]', row);
      const ok = renameCategory(id, nameInput?.value ?? "");
      showToast(ok ? "Category Renamed" : "That name already exists", ok ? "success" : "warning");
      if (ok) renderChips();
    }
    if (action === "delete-category") {
      // Notes are kept — they just become uncategorized.
      deleteCategory(id);
      showToast("Category Deleted — its notes were kept", "success");
      renderManager();
    }
  });

  qs("#closeCategoriesBtn", manageModal)?.addEventListener("click", closeManager);

  subscribe(() => {
    renderChips();
    renderCategorySelect();
  });
  renderChips();
  renderCategorySelect();
}