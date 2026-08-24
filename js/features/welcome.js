/**
 * Welcome section — greeting, dynamic summary, stats strip and streak.
 *
 * Pure rendering: every number is derived from state; the display name
 * comes from Settings and, when absent, NO name is ever shown or invented.
 */

import { getState, subscribe } from "../state/store.js";
import { byId } from "../utils/dom.js";

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function streakLabel(streak) {
  if (streak.currentStreak > 0) {
    return `🔥 ${streak.currentStreak} day streak`;
  }
  return "Start your streak today.";
}

function renderWelcome() {
  const root = byId("welcome");
  if (!root) return;

  const { notes, categories, settings, streak } = getState();
  const active = notes.filter((n) => !n.archived && !n.deletedAt);

  // Greeting (name only when the user actually set one).
  const greeting = greetingForHour(new Date().getHours());
  const name = settings.userName?.trim() ?? "";

  const heading = byId("welcomeGreeting");
  heading.textContent = name ? `${greeting}, ${name}.` : `${greeting}.`;

  const pinnedCount = active.filter((n) => n.pinned).length;
  const summaryParts = [
    `${active.length} note${active.length === 1 ? "" : "s"}`,
    `${pinnedCount} pinned`,
  ];
  byId("welcomeSummary").textContent = `Welcome back to Pine Notes. ${summaryParts.join(" · ")}`;

  // Streak chip (motivational zero-state instead of "0 day streak").
  byId("welcomeStreak").textContent = streakLabel(streak);

  // Stats strip — all derived, nothing hardcoded.
  const archivedCount = notes.filter((n) => n.archived && !n.deletedAt).length;
  let tasksDone = 0;
  let tasksTotal = 0;
  active.forEach((note) => {
    if (note.type !== "task") return;
    (note.items ?? []).forEach((item) => {
      tasksTotal += 1;
      if (item.done) tasksDone += 1;
    });
  });

  const cells = [
    [active.length, "Total Notes"],
    [pinnedCount, "Pinned"],
    [archivedCount, "Archived"],
    [categories.length, "Categories"],
    [tasksTotal > 0 ? `${tasksDone} / ${tasksTotal}` : "—", "Tasks Done"],
  ];
  const grid = byId("welcomeStats");
  grid.replaceChildren();
  cells.forEach(([value, label]) => {
    const cell = document.createElement("div");
    cell.className = "stat-cell";
    const valueEl = document.createElement("strong");
    valueEl.textContent = String(value);
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    cell.append(valueEl, labelEl);
    grid.appendChild(cell);
  });
}

export function initWelcome() {
  subscribe(renderWelcome);
  renderWelcome();
}