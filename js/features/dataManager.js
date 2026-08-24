/**
 * Data management UI — Export / Import / Restore.
 *
 * Flow: pick file → read → parse → validate+migrate (dataTransfer) →
 * preview dialog (Merge or Replace) → apply → persist ONCE → reload state.
 * Validation errors abort BEFORE any state change (atomic failure).
 */

import { getState, setState } from "../state/store.js";
import { saveData } from "../services/storage.js";
import {
  buildExportEnvelope, serializeBackup, backupFileName,
  readBackupFile, parseImportPayload, applyReplace, applyMerge, ImportError,
} from "../services/dataTransfer.js";
import { createModalController } from "../utils/focusTrap.js";
import { byId, qs } from "../utils/dom.js";
import { showToast } from "../components/toast.js";

let fileInput = null;
let importModal = null;
let importController = null;
let pendingImport = null;

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function exportData() {
  const envelope = buildExportEnvelope(getState());
  const blob = new Blob([serializeBackup(envelope)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName(envelope.exportedAt);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Backup exported", "success");
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

async function onFileChosen(event) {
  const file = event.target.files?.[0];
  event.target.value = ""; // allow re-picking the same file later
  if (!file || !importController) return;

  let imported;
  try {
    imported = parseImportPayload(await readBackupFile(file));
  } catch (error) {
    const message =
      error instanceof ImportError ? error.message : "This backup could not be imported.";
    showToast(message, "danger");
    return;
  }

  // Preview / confirmation — nothing has been modified yet.
  pendingImport = imported;
  const summary = qs("#importModalSummary", importModal);
  const warning = qs("#importModalWarning", importModal);
  if (summary) {
    summary.textContent =
      `"${file.name}" contains ${imported.notes.length} note(s), ` +
      `${imported.categories.length} category(ies), and settings.`;
  }
  if (warning) {
    warning.textContent =
      "Merge keeps your current data and adds/updates the backup's notes. " +
      "Replace permanently overwrites ALL current Pine Notes data with the backup.";
  }
  importController.open({ initialFocus: qs("#importCancelBtn", importModal) });
}

/**
 * Commit the pending import atomically: apply strategy → persist ONCE →
 * only then adopt the new slices into state (all subscribers re-render).
 * On persistence failure state is left untouched.
 */
function commitImport(strategy) {
  if (!pendingImport || !importController) return;
  const imported = pendingImport;
  pendingImport = null;

  const current = getState();
  const next =
    strategy === "replace"
      ? applyReplace(current, imported)
      : applyMerge(current, imported);

  importController.close(); // restore focus to the trigger first

  const saved = saveData(next);
  if (!saved) {
    showToast("Could not save the imported data — storage unavailable.", "danger");
    return;
  }

  // Clean reload of all persisted slices; UI-only state (view/search/
  // filter/editing) is reset to safe defaults so every view re-derives.
  setState({
    notes: next.notes,
    categories: next.categories,
    settings: next.settings,
    streak: next.streak,
    view: "active",
    categoryFilter: null,
    search: "",
    editingId: null,
    saveFailed: false,
  });

  showToast(strategy === "replace" ? "Backup restored" : "Backup merged", "success");
}

export function initDataManager() {
  fileInput = byId("importFileInput");
  importModal = byId("importModal");
  if (importModal) {
    importController = createModalController(importModal);
    qs("#importCancelBtn", importModal)?.addEventListener("click", () => {
      pendingImport = null;
      importController.close();
    });
    qs("#importMergeBtn", importModal)?.addEventListener("click", () => commitImport("merge"));
    qs("#importReplaceBtn", importModal)?.addEventListener("click", () => commitImport("replace"));
  }

  byId("exportDataBtn")?.addEventListener("click", exportData);
  byId("importDataBtn")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", onFileChosen);
}

