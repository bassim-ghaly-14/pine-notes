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

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function iconButton(action, iconKey, label) {
  const btn = el("button", `action-${action}`);

  btn.type = "button";
  btn.dataset.action = action;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = ICONS[iconKey];

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

function buildTaskProgress(items) {
  const { done, total } = taskProgress(items);
  const header = el("div", "task-progress");

  const label = total === 0
    ? "No tasks yet"
    : `${done} / ${total} done`;

  header.appendChild(
    el("span", "task-progress-label", label)
  );

  if (total > 0) {
    header.appendChild(buildProgressBar(done, total));
  }

  return header;
}

function buildProgressBar(done, total) {
  const bar = el("div", "task-progress-bar");
  const fill = el("div", "task-progress-fill");

  fill.style.width = `${Math.round((done / total) * 100)}%`;
  bar.appendChild(fill);

  return bar;
}

function buildTaskItems(items, interactive) {
  if (items.length === 0) {
    return null;
  }

  const list = el("ul", "task-items");

  items.forEach((item, index) => {
    list.appendChild(
      buildTaskItem(item, index, interactive)
    );
  });

  return list;
}

function buildTaskAddRow() {
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

  return addRow;
}

function buildTaskList(note, view) {
  const wrap = el("div", "task-list");
  const items = Array.isArray(note.items) ? note.items : [];
  const interactive = view !== "trash";

  wrap.appendChild(buildTaskProgress(items));

  const taskItems = buildTaskItems(items, interactive);

  if (taskItems) {
    wrap.appendChild(taskItems);
  }

  if (interactive) {
    wrap.appendChild(buildTaskAddRow());
  }

  return wrap;
}

function buildTaskItem(item, index, interactive) {
  const li = el(
    "li",
    `task-item${item.done ? " done" : ""}`
  );

  li.appendChild(
    interactive
      ? buildTaskCheckbox(item, index)
      : buildStaticTaskMark(item)
  );

  li.appendChild(buildTaskText(item));

  if (interactive) {
    li.appendChild(buildTaskActions(item));
  }

  return li;
}

function buildTaskCheckbox(item, index) {
  const checkbox = document.createElement("input");

  checkbox.type = "checkbox";
  checkbox.checked = item.done;
  checkbox.dataset.taskAction = "toggle";
  checkbox.dataset.itemId = item.id;
  checkbox.setAttribute(
    "aria-label",
    `Task ${index + 1}: ${item.text}`
  );

  return checkbox;
}

function buildStaticTaskMark(item) {
  const mark = el(
    "span",
    "task-static-mark",
    item.done ? "✓" : "○"
  );

  mark.setAttribute("aria-hidden", "true");

  return mark;
}

function buildTaskText(item) {
  const text = el("span", "task-text");
  text.appendChild(document.createTextNode(item.text));

  return text;
}

function buildTaskActions(item) {
  const renameBtn = el("button", "task-rename-btn");
  renameBtn.type = "button";
  renameBtn.dataset.action = "task-edit";
  renameBtn.dataset.itemId = item.id;
  renameBtn.textContent = "Rename";
  renameBtn.setAttribute(
    "aria-label",
    `Rename task: ${item.text}`
  );

  const removeBtn = el("button", "task-remove-btn");
  removeBtn.type = "button";
  removeBtn.dataset.action = "task-del";
  removeBtn.dataset.itemId = item.id;
  removeBtn.textContent = "×";
  removeBtn.setAttribute(
    "aria-label",
    `Delete task: ${item.text}`
  );

  const actions = el("div", "task-actions");
  actions.append(renameBtn, removeBtn);

  return actions;
}

/* ------------------------------------------------------------------ */
/* Note content                                                        */
/* ------------------------------------------------------------------ */

function buildNoteTitle(note, searchQuery) {
  const title = el("h3");

  title.appendChild(
    highlightText(note.title, searchQuery)
  );

  return title;
}

function buildNoteContent(note, view, searchQuery, options) {
  if (note.type === "task") {
    return buildTaskList(note, view);
  }

  if (shouldRenderMarkdown(note, options)) {
    return buildMarkdownContent(note);
  }

  return buildPlainTextContent(note, searchQuery);
}

function shouldRenderMarkdown(note, options) {
  return (
    options.markdown &&
    String(note.content ?? "").trim()
  );
}

function buildMarkdownContent(note) {
  const rendered = renderMarkdown(note.content);

  rendered.classList.add("note-md");

  return rendered;
}

function buildPlainTextContent(note, searchQuery) {
  const content = el("p");

  content.appendChild(
    highlightText(note.content, searchQuery)
  );

  return content;
}

/* ------------------------------------------------------------------ */
/* Note metadata                                                       */
/* ------------------------------------------------------------------ */

function buildCategoryChip(categoryName) {
  const isUncategorized = !categoryName;
  const label = categoryName || "Uncategorized";
  const className = `note-category${isUncategorized ? " uncategorized" : ""}`;

  return el("span", className, label);
}

function buildNoteMetadata(note, categoryName) {
  const metadata = document.createDocumentFragment();

  metadata.appendChild(
    buildCategoryChip(categoryName)
  );

  if (note.type === "task") {
    metadata.appendChild(
      el("span", "note-type-badge", "Tasks")
    );
  }

  const dateLabel = formatNoteDate(note);

  if (dateLabel) {
    metadata.appendChild(
      el("span", "note-date", dateLabel)
    );
  }

  return metadata;
}

/* ------------------------------------------------------------------ */
/* Pin badge                                                           */
/* ------------------------------------------------------------------ */

function buildPinnedBadge() {
  const badge = el("span", "pinned-badge");

  badge.innerHTML = ICONS.pin.replace(
    'width="18" height="18"',
    'width="14" height="14"'
  );

  badge.setAttribute("role", "img");
  badge.setAttribute("aria-label", "Pinned");

  return badge;
}

function shouldShowPinnedBadge(note, view) {
  return note.pinned && view === "active";
}

/* ------------------------------------------------------------------ */
/* Card actions                                                        */
/* ------------------------------------------------------------------ */

const VIEW_ACTIONS = {
  active: [
    ["pin", "pin", "Pin note"],
    ["edit", "edit", "Edit note"],
    ["archive", "archive", "Archive note"],
    ["trash", "trash", "Move to trash"],
  ],
  archive: [
    ["unarchive", "unarchive", "Unarchive note"],
    ["trash", "trash", "Move to trash"],
  ],
  trash: [
    ["restore", "restore", "Restore note"],
    ["purge", "trash", "Delete forever"],
  ],
};

function getActionLabel(action, note) {
  if (action === "pin") {
    return note.pinned ? "Unpin note" : "Pin note";
  }

  return VIEW_ACTIONS[viewActionFallback(action)]?.find(
    ([actionName]) => actionName === action
  )?.[2] || "";
}

function viewActionFallback(action) {
  if (action === "pin" || action === "edit" || action === "archive") {
    return "active";
  }

  if (action === "unarchive") {
    return "archive";
  }

  return "trash";
}

function buildActionButton(action, iconKey, defaultLabel, note) {
  const label = action === "pin"
    ? getActionLabel(action, note)
    : defaultLabel;

  return iconButton(action, iconKey, label);
}

function buildCardActions(note, view) {
  const actions = el("div", "note-actions");
  const viewActions = VIEW_ACTIONS[view] || [];

  viewActions.forEach(([action, iconKey, label]) => {
    actions.appendChild(
      buildActionButton(action, iconKey, label, note)
    );
  });

  return actions;
}

/* ------------------------------------------------------------------ */
/* Note card                                                           */
/* ------------------------------------------------------------------ */

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
export function createNoteCard(
  note,
  view,
  categoryName = "",
  searchQuery = "",
  options = {}
) {
  const card = el(
    "div",
    `note-card${note.pinned && view === "active" ? " pinned" : ""}`
  );

  card.dataset.id = note.id;

  if (note.color) {
    card.dataset.color = note.color;
  }

  if (shouldShowPinnedBadge(note, view)) {
    card.appendChild(buildPinnedBadge());
  }

  card.appendChild(
    buildNoteTitle(note, searchQuery)
  );

  card.appendChild(
    buildNoteContent(
      note,
      view,
      searchQuery,
      options
    )
  );

  card.appendChild(
    buildNoteMetadata(note, categoryName)
  );

  card.appendChild(
    buildCardActions(note, view)
  );

  return card;
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

/** Static empty-state markup, per view and search context. */
export function createEmptyState(view, isSearch) {
  const wrap = el("div", "empty-notes");
  const [heading, body] = getEmptyStateMessage(view, isSearch);

  const h3 = el("h3", null, heading);
  const p = el("p", null, body);

  wrap.append(h3, p);

  return wrap;
}

function getEmptyStateMessage(view, isSearch) {
  const messages = {
    active: isSearch
      ? ["No Matching Notes", `No notes found for "${isSearch}".`]
      : ["No Notes Found", "Try adding a new note."],

    archive: isSearch
      ? [
          "No Matching Archived Notes",
          `Nothing archived matches "${isSearch}".`,
        ]
      : [
          "No Archived Notes",
          "Notes you archive will appear here.",
        ],

    trash: isSearch
      ? [
          "No Matching Notes in Trash",
          `Nothing in trash matches "${isSearch}".`,
        ]
      : [
          "Trash is Empty",
          "Deleted notes rest here for 30 days before being purged.",
        ],
  };

  return messages[view] ?? messages.active;
}