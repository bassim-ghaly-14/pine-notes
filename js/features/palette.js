/**
 * Command palette — a small command registry plus one accessible dialog.
 *
 * The registry is a plain array of {id, label, keywords, shortcut, action}.
 * Commands call existing actions/features — no business logic lives here.
 *
 * Keyboard:
 * ↑/↓ navigate
 * Enter execute
 * Escape close
 *
 * Focus is restored when the palette closes.
 */

import { getState } from "../state/store.js";
import { setView, setSortBy, setSetting } from "../state/actions.js";
import { resolveMode } from "../services/theme.js";
import { byId, qs } from "../utils/dom.js";
import { createModalController } from "../utils/focusTrap.js";

let overlay = null;
let controller = null;
let input = null;
let listEl = null;
let selectedIndex = 0;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Command registry                                                   */
/* ------------------------------------------------------------------ */

let openSettingsPanel = () => {};

function buildRegistry() {
  const currentMode = resolveMode(getState().settings.theme ?? undefined);

  return [
    {
      id: "new-note",
      label: "Create New Note",
      keywords: "add write compose",
      shortcut: "N",
      action: () => {
        setView("active");
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });

        byId("noteTitle")?.focus();
      },
    },

    {
      id: "search-notes",
      label: "Search Notes",
      keywords: "find query",
      shortcut: "/",
      action: () => {
        byId("searchInput")?.focus();
      },
    },

    {
      id: "show-all",
      label: "Show All Notes",
      keywords: "active view home",
      action: () => {
        setView("active");
      },
    },

    {
      id: "show-pinned",
      label: "Show Pinned Notes",
      keywords: "pin important",
      action: () => {
        setView("active");
        setSortBy("pinned");
      },
    },

    {
      id: "show-archive",
      label: "Show Archived Notes",
      keywords: "archive hidden",
      action: () => {
        setView("archive");
      },
    },

    {
      id: "show-trash",
      label: "Show Trash",
      keywords: "deleted bin rubbish",
      action: () => {
        setView("trash");
      },
    },

    {
      id: "toggle-theme",
      label: `Switch to ${
        currentMode === "light" ? "Dark" : "Light"
      } Theme`,
      keywords: "dark light appearance mode night system toggle",
      action: () => {
        setSetting(
          "theme",
          currentMode === "light" ? "dark" : "light"
        );
      },
    },

    {
      id: "open-settings",
      label: "Open Settings",
      keywords: "preferences options config",
      shortcut: "S",
      action: () => {
        openSettingsPanel();
      },
    },

    {
      id: "create-category",
      label: "Manage Categories",
      keywords: "new category organize group",
      action: () => {
        qs("#manageCategoriesBtn")?.click();
      },
    },
  ];
}

function filteredCommands(query) {
  const needle = query.trim().toLowerCase();
  const registry = buildRegistry();

  if (!needle) {
    return registry;
  }

  return registry.filter(
    (command) =>
      command.label.toLowerCase().includes(needle) ||
      (command.keywords ?? "").toLowerCase().includes(needle)
  );
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

function renderList() {
  if (!listEl || !input) {
    return;
  }

  const commands = filteredCommands(input.value);

  selectedIndex = Math.min(
    selectedIndex,
    Math.max(commands.length - 1, 0)
  );

  listEl.replaceChildren();

  if (commands.length === 0) {
    input.removeAttribute("aria-activedescendant");

    const empty = el(
      "li",
      "palette-empty",
      "No matching commands"
    );

    listEl.appendChild(empty);
    return;
  }

  commands.forEach((command, index) => {
    const item = el(
      "li",
      "palette-item" +
        (index === selectedIndex ? " selected" : "")
    );

    item.dataset.index = String(index);
    item.id = `palette-option-${index}`;

    item.setAttribute("role", "option");
    item.setAttribute(
      "aria-selected",
      String(index === selectedIndex)
    );

    item.appendChild(el("span", null, command.label));

    if (command.shortcut) {
      item.appendChild(
        el("kbd", "palette-kbd", command.shortcut)
      );
    }

    listEl.appendChild(item);
  });

  input.setAttribute(
    "aria-activedescendant",
    `palette-option-${selectedIndex}`
  );
}

/**
 * Update the visual + ARIA selection without rebuilding the list.
 */
function setSelected(index) {
  const items = listEl?.querySelectorAll(".palette-item");

  if (!items || items.length === 0) {
    input?.removeAttribute("aria-activedescendant");
    return;
  }

  selectedIndex = Math.max(
    0,
    Math.min(index, items.length - 1)
  );

  items.forEach((item, itemIndex) => {
    const selected = itemIndex === selectedIndex;

    item.classList.toggle("selected", selected);

    item.setAttribute(
      "aria-selected",
      String(selected)
    );
  });

  input?.setAttribute(
    "aria-activedescendant",
    `palette-option-${selectedIndex}`
  );
}

/* ------------------------------------------------------------------ */
/* Open / Close                                                       */
/* ------------------------------------------------------------------ */

function open() {
  /*
   * The palette can theoretically receive a keyboard shortcut before
   * initialization finishes. Fail safely instead of dereferencing null.
   */
  if (!overlay || !controller || !input) {
    return;
  }

  if (controller.isOpen()) {
    return;
  }

  input.value = "";
  selectedIndex = 0;

  renderList();

  controller.open({
    initialFocus: input,
  });
}

function close() {
  if (!controller) {
    return;
  }

  if (!controller.isOpen()) {
    return;
  }

  controller.close();
}

export function togglePalette() {
  /*
   * Important:
   * controller must exist before calling isOpen().
   */
  if (!controller) {
    return;
  }

  if (controller.isOpen()) {
    close();
  } else {
    open();
  }
}

/* ------------------------------------------------------------------ */
/* Execute                                                            */
/* ------------------------------------------------------------------ */

function execute(index) {
  if (!input) {
    return;
  }

  const commands = filteredCommands(input.value);
  const command = commands[index];

  close();

  command?.action();
}

/* ------------------------------------------------------------------ */
/* Initialization                                                     */
/* ------------------------------------------------------------------ */

export function initPalette(openSettings) {
  if (typeof openSettings === "function") {
    openSettingsPanel = openSettings;
  }

  overlay = byId("paletteOverlay");

  if (!overlay) {
    return;
  }

  /*
   * This was the missing piece.
   *
   * Without this assignment:
   *
   * controller === null
   *
   * and togglePalette() eventually calls:
   *
   * controller.isOpen()
   *
   * which causes:
   * TypeError: null is not an object
   */
  controller = createModalController(overlay);

  input = qs("#paletteInput", overlay);
  listEl = qs("#paletteList", overlay);

  qs("#paletteCloseBtn", overlay)?.addEventListener(
    "click",
    close
  );

  /* -------------------------------------------------------------- */
  /* Keyboard                                                        */
  /* -------------------------------------------------------------- */

  input?.addEventListener("keydown", (event) => {
    const count = filteredCommands(input.value).length;

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setSelected(
        count > 0
          ? (selectedIndex + 1) % count
          : 0
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setSelected(
        count > 0
          ? (selectedIndex - 1 + count) % count
          : 0
      );

      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      execute(selectedIndex);
    }
  });

  /* -------------------------------------------------------------- */
  /* Search                                                          */
  /* -------------------------------------------------------------- */

  input?.addEventListener("input", () => {
    selectedIndex = 0;
    renderList();
  });

  /* -------------------------------------------------------------- */
  /* Mouse selection                                                  */
  /* -------------------------------------------------------------- */

  listEl?.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element
        ? event.target
        : null;

    const item = target?.closest(".palette-item");

    if (item?.dataset.index !== undefined) {
      execute(Number(item.dataset.index));
    }
  });

  /* -------------------------------------------------------------- */
  /* Mouse hover                                                      */
  /* -------------------------------------------------------------- */

  listEl?.addEventListener("mouseover", (event) => {
    const target =
      event.target instanceof Element
        ? event.target
        : null;

    const item = target?.closest(".palette-item");

    if (item?.dataset.index !== undefined) {
      setSelected(Number(item.dataset.index));
    }
  });
}