/**
 * Note card component — owns creating the DOM for one note.
 *
 * Security model:
 *   - ALL user-controlled text is set via textContent/createTextNode
 *     (never innerHTML), which makes XSS structurally impossible.
 *   - The only innerHTML usage is the ICONS constants below: static
 *     developer-authored SVG strings that contain no user data.
 *   - Search highlighting uses utils/highlight.js (pure DOM fragments).
 *
 * The card is VIEW-AWARE (Active/Archive/Trash) and TYPE-aware
 * ("text" notes vs "task" notes with checklists).
 */

import { formatNoteDate } from "../utils/format.js";
import { highlightText } from "../utils/highlight.js";
import { renderMarkdown } from "../utils/markdown.js";

const ICONS = {
  pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 17v5M9 3h6l1 7 2.5 2.5a1 1 0 0 1-.7 1.7H6.2a1 1 0 0 1-.7-1.7L8 10l1-7z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  archive: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/></svg>',
  unarchive: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M12 12v6m0-6-3 3m3-3 3 3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0v13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6"/></svg>',
  restore: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5"/></svg>',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconButton(action, iconKey, label) {
  const btn = el("button", `action-${action}`);
  btn.type = "button";
  btn.dataset.action = action;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = ICONS[iconKey]; // static, safe
  return btn;
}

/* ------------------------------------------------------------------ */
/* Task notes                                                          */
/* ------------------------------------------------------------------ */

function taskProgress(items) {
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  return { done, total };
}

function buildTaskList(note, view) {
  const wrap = el("div", "task-list");
  const items = Array.isArray(note.items) ? note.items : [];
  const interactive = view !== "trash"; // trash is read-only
  const { done, total } = taskProgress(items);

  // Progress header: "3 / 5 done" + subtle bar.
  const header = el("div", "task-progress");
  header.appendChild(
    el("span", "task-progress-label", total === 0 ? "No tasks yet" : `${done} / ${total} done`)
  );
  if (total > 0) {
    const bar = el("div", "task-progress-bar");
    const fill = el("div", "task-progress-fill");
    fill.style.width = `${Math.round((done / total) * 100)}%`;
    bar.appendChild(fill);
    header.appendChild(bar);
  }
  wrap.appendChild(header);

  if (items.length > 0) {
    const list = el("ul", "task-items");
    items.forEach((item, index) => {
      list.appendChild(buildTaskItem(item, index, interactive));
    });
    wrap.appendChild(list);
  }

  if (interactive) {
    const addRow = el("div", "task-add");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Add a task…";
    input.dataset.role = "new-task";
    input.setAttribute("aria-label", "New task text");
    const addBtn = el("button", null, "Add");
    addBtn.type = "button";
    addBtn.dataset.action = "task-add";
    addRow.append(input, addBtn);
    wrap.appendChild(addRow);
  }

  return wrap;
}

function buildTaskItem(item, index, interactive) {
  const li = el("li", "task-item" + (item.done ? " done" : ""));

  if (interactive) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.done;
    checkbox.dataset.taskAction = "toggle";
    checkbox.dataset.itemId = item.id;
    checkbox.setAttribute("aria-label", `Task ${index + 1}: ${item.text}`);
    li.appendChild(checkbox);
  } else {
    const staticMark = el("span", "task-static-mark", item.done ? "✓" : "○");
    staticMark.setAttribute("aria-hidden", "true");
    li.appendChild(staticMark);
  }

  const text = el("span", "task-text");
  text.appendChild(document.createTextNode(item.text));
  li.appendChild(text);

  if (interactive) {
    const renameBtn = el("button", "task-rename-btn");
    renameBtn.type = "button";
    renameBtn.dataset.action = "task-edit";
    renameBtn.dataset.itemId = item.id;
    renameBtn.textContent = "Rename";
    renameBtn.setAttribute("aria-label", `Rename task: ${item.text}`);

    const removeBtn = el("button", "task-remove-btn");
    removeBtn.type = "button";
    removeBtn.dataset.action = "task-del";
    removeBtn.dataset.itemId = item.id;
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Delete task: ${item.text}`);

    li.append(renameBtn, removeBtn);
  }
  return li;
}

/* __CARDS__ */

/**
 * @param {object} note   Sanitized note from state.
 * @param {string} view   "active" | "archive" | "trash".
 * @param {string} categoryName Display name of the note's category (or "").
 * @param {string} searchQuery Current search query for highlighting (or "").
 * @param {{markdown?: boolean}} [options] When markdown is true, text-note
 *        content renders through the safe Markdown renderer (search
 *        highlighting is skipped on rendered content — correctness and
 *        safety take priority over fancy highlighting).
 * @returns {HTMLElement} Card element (data-id set for delegation).
 */
export function createNoteCard(note, view, categoryName = "", searchQuery = "", options = {}) {
  const card = el("div", "note-card" + (note.pinned && view === "active" ? " pinned" : ""));
  card.dataset.id = note.id;
  if (note.color) card.dataset.color = note.color;

  if (note.pinned && view === "active") {
    const badge = el("span", "pinned-badge");
    badge.innerHTML = ICONS.pin.replace('width="18" height="18"', 'width="14" height="14"'); // static, safe
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", "Pinned");
    card.appendChild(badge);
  }

  const title = el("h3", null);
  title.appendChild(highlightText(note.title, searchQuery));
  card.appendChild(title);

  if (note.type === "task") {
    card.appendChild(buildTaskList(note, view));
  } else if (options.markdown && String(note.content ?? "").trim()) {
    const rendered = renderMarkdown(note.content); // safe DOM (utils/markdown)
    rendered.classList.add("note-md");
    card.appendChild(rendered);
  } else {
    const content = el("p", null);
    content.appendChild(highlightText(note.content, searchQuery));
    card.appendChild(content);
  }

  const chipLabel = categoryName || "Uncategorized";
  const chip = el("span", "note-category" + (categoryName ? "" : " uncategorized"), chipLabel);
  card.appendChild(chip);

  if (note.type === "task") {
    card.appendChild(el("span", "note-type-badge", "Tasks"));
  }

  const dateLabel = formatNoteDate(note);
  if (dateLabel) card.appendChild(el("span", "note-date", dateLabel));

  const actions = el("div", "note-actions");
  if (view === "active") {
    actions.append(
      iconButton("pin", "pin", note.pinned ? "Unpin note" : "Pin note"),
      iconButton("edit", "edit", "Edit note"),
      iconButton("archive", "archive", "Archive note"),
      iconButton("trash", "trash", "Move to trash")
    );
  } else if (view === "archive") {
    actions.append(
      iconButton("unarchive", "unarchive", "Unarchive note"),
      iconButton("trash", "trash", "Move to trash")
    );
  } else {
    // trash
    actions.append(
      iconButton("restore", "restore", "Restore note"),
      iconButton("purge", "trash", "Delete forever")
    );
  }
  card.appendChild(actions);
  return card;
}

/** Static empty-state markup, per view and search context. */
export function createEmptyState(view, isSearch) {
  const wrap = el("div", "empty-notes");
  const messages = {
    active: isSearch
      ? ["No Matching Notes", `No notes found for "${isSearch}".`]
      : ["No Notes Found", "Try adding a new note ✨"],
    archive: isSearch
      ? ["No Matching Archived Notes", `Nothing archived matches "${isSearch}".`]
      : ["No Archived Notes", "Notes you archive will appear here."],
    trash: isSearch
      ? ["No Matching Notes in Trash", `Nothing in trash matches "${isSearch}".`]
      : ["Trash is Empty", "Deleted notes rest here for 30 days before being purged."],
  };
  const [heading, body] = messages[view] ?? messages.active;
  // Built with createElement/textContent only — same XSS-safe model as
  // the rest of the component layer.
  const h3 = el("h3", null, heading);
  const p = el("p", null, body);
  wrap.append(h3, p);
  return wrap;
}