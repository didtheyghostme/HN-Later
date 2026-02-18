import { defineContentScript } from "wxt/utils/define-content-script";

import {
  addReadCommentIds,
  addSeenNewCommentIds,
  getThread,
  listThreads,
  removeThread,
  setReadCommentIds,
  unarchiveThread,
  setCachedStats,
  setDismissNewAboveUntilId,
  setFrozenProgress,
  setLastReadCommentId,
  setThreadStatus,
  setVisitInfo,
  upsertThread,
  type ThreadRecord,
} from "../utils/hnStorage";

import { hnLaterMessenger } from "../utils/hnLaterMessaging";
import { computeStats } from "../utils/threadStats";
import { ensureBaselineMaxSeen } from "../utils/ensureBaseline";
import { planSeenNewCommentUpdate } from "../utils/seenNewCommentUpdate";
import {
  getStarredCommentsById,
  removeStarredComment,
  setStarredCommentNote,
  upsertStarredComment,
  type StarredCommentRecord,
} from "../utils/hnCommentStars";

const ITEM_BASE_URL = "https://news.ycombinator.com/item?id=";

function isItemPage(url: URL) {
  return url.pathname === "/item" && !!url.searchParams.get("id");
}

function getStoryIdFromItemUrl(url: URL): string | undefined {
  const id = url.searchParams.get("id");
  return id ?? undefined;
}

function getItemUrl(storyId: string) {
  return `${ITEM_BASE_URL}${encodeURIComponent(storyId)}`;
}

function getItemTitleFromDom(): string {
  const fromTitleLine = document
    .querySelector<HTMLAnchorElement>("span.titleline a")
    ?.textContent?.trim();
  if (fromTitleLine) return fromTitleLine;

  const fromDocTitle = document.title.replace(/\s*\|\s*Hacker News\s*$/i, "").trim();
  return fromDocTitle || "Hacker News";
}

function parseHnTitleTimestampToMs(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;

  // HN typically emits an ISO-like string without timezone (e.g. "2026-01-11T04:12:33").
  // Treat no-timezone values as UTC to avoid local-time ambiguity.
  const hasTimezone = /([zZ]|[+-]\d\d:\d\d)$/.test(s);
  const iso = hasTimezone ? s : `${s}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

function getStoryPostedAtFromListingSubtext(subtextTd: HTMLTableCellElement): number | undefined {
  const ageTitle = subtextTd.querySelector<HTMLElement>("span.age")?.getAttribute("title");
  return parseHnTitleTimestampToMs(ageTitle);
}

function getStoryPostedAtFromItemDom(): number | undefined {
  // Story subtext lives near the top. Avoid comment ages (those are under span.comhead).
  const ageTitle = document
    .querySelector<HTMLTableCellElement>("td.subtext")
    ?.querySelector<HTMLElement>("span.age")
    ?.getAttribute("title");
  return parseHnTitleTimestampToMs(ageTitle);
}

function ensureStyles() {
  const id = "hn-later-style";
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .hn-later-link { font-size: 10px; opacity: 0.85; }
    .hn-later-link:hover { opacity: 1; }

    .hn-later-toolbar {
      margin: 6px 0 10px 0;
      padding: 6px 8px;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 6px;
      background: rgba(0,0,0,0.03);
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .hn-later-toolbar a {
      cursor: pointer;
      text-decoration: underline;
    }
    .hn-later-toolbar .hn-later-pill {
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(0,0,0,0.07);
    }

    tr.hn-later-unread td.default {
      box-shadow: inset 4px 0 0 rgba(0, 102, 255, 0.22);
    }

    tr.hn-later-highlight td.default {
      outline: 3px solid rgba(0, 102, 255, 0.85);
      outline-offset: 2px;
    }

    .hn-later-chip {
      display: inline-block;
      margin-left: 6px;
      color: rgb(255, 255, 255);
      font-size: 9px;
      font-weight: 700;
      vertical-align: middle;
      padding: 1px 4px;
      background: rgb(0, 102, 255);
      border-radius: 3px;
    }

    .hn-later-checkpoint-chip {
      background: rgb(255, 102, 0);
    }

    .hn-later-star { margin-left: 6px; font-size: 12px; opacity: 0.9; text-decoration: none; }
    .hn-later-star:hover { opacity: 1; }
    .hn-later-star-error { margin-left: 6px; font-size: 10px; color: rgba(180, 0, 0, 0.9); }

    .hn-later-mark { margin-left: 6px; font-size: 10px; opacity: 0.85; }
    .hn-later-mark:hover { opacity: 1; }

    .hn-later-note {
      margin-top: 6px;
      padding: 6px 8px;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 6px;
      background: rgba(0,0,0,0.03);
      font-size: 12px;
    }
    .hn-later-note .hn-later-note-header { display: flex; align-items: center; gap: 8px; }
    .hn-later-note .hn-later-note-label { font-weight: 700; opacity: 0.75; }
    .hn-later-note .hn-later-note-actions { margin-left: auto; display: flex; gap: 8px; }
    .hn-later-note .hn-later-note-actions a { cursor: pointer; text-decoration: underline; }
    .hn-later-note textarea {
      width: 100%;
      box-sizing: border-box;
      margin-top: 6px;
      font-size: 12px;
      padding: 6px;
      border-radius: 6px;
      border: 1px solid rgba(0,0,0,0.18);
    }
    .hn-later-note button {
      cursor: pointer;
      border: none;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      background: rgba(0,0,0,0.07);
    }
    .hn-later-note button:hover { background: rgba(0,0,0,0.12); }
    .hn-later-note .hn-later-note-text { margin-top: 6px; white-space: pre-wrap; }

    #hn-later-floating-new-nav {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 999px;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(6px);
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
      font-size: 12px;
      color: #000;
    }
    #hn-later-floating-new-nav button {
      cursor: pointer;
      border: none;
      background: rgba(0,0,0,0.07);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
    }
    #hn-later-floating-new-nav button:hover { background: rgba(0,0,0,0.12); }
    #hn-later-floating-new-nav button.hn-later-floating-seen { background: rgba(0, 128, 0, 0.14); }
    #hn-later-floating-new-nav button.hn-later-floating-seen:hover { background: rgba(0, 128, 0, 0.2); }
    #hn-later-floating-new-nav .hn-later-floating-label { opacity: 0.8; font-variant-numeric: tabular-nums; }
  `;
  document.head.appendChild(style);
}

function getCommentRows(): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>("tr.athing.comtr"));
}

function getCommentIdsInDomOrder(rows: HTMLTableRowElement[]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    const n = Number(row.id);
    if (Number.isFinite(n)) ids.push(n);
  }
  return ids;
}

function ensureNewChip(row: HTMLTableRowElement) {
  const comhead = row.querySelector("span.comhead");
  if (!comhead) return;
  if (comhead.querySelector(`[data-hn-later-chip="new"]`)) return;

  const chip = document.createElement("span");
  chip.dataset.hnLaterChip = "new";
  chip.className = "hn-later-chip";
  chip.textContent = "[NEW]";

  // Prefer placing right after the "age" element (e.g., "3 hours ago") for fast scanning.
  const age = comhead.querySelector<HTMLElement>("span.age");
  if (age) {
    age.insertAdjacentElement("afterend", chip);
    return;
  }

  const markLink = comhead.querySelector<HTMLElement>("a.hn-later-mark");
  if (markLink) {
    comhead.insertBefore(chip, markLink);
    return;
  }

  comhead.appendChild(chip);
}

function ensureCheckpointChip(row: HTMLTableRowElement) {
  const comhead = row.querySelector("span.comhead");
  if (!comhead) return;
  if (comhead.querySelector(`[data-hn-later-chip="checkpoint"]`)) return;

  const chip = document.createElement("span");
  chip.dataset.hnLaterChip = "checkpoint";
  chip.className = "hn-later-chip hn-later-checkpoint-chip";
  chip.textContent = "[HERE]";
  chip.title = "Last read checkpoint (mark-to-here)";

  // Prefer placing right after the "age" element (e.g., "3 hours ago") for fast scanning.
  // If there are existing chips (e.g. [NEW]) after age, place this after them.
  const age = comhead.querySelector<HTMLElement>("span.age");
  if (age) {
    let anchor: Element = age;
    while (anchor.nextElementSibling?.hasAttribute("data-hn-later-chip")) {
      anchor = anchor.nextElementSibling;
    }
    anchor.insertAdjacentElement("afterend", chip);
    return;
  }

  const markLink = comhead.querySelector<HTMLElement>("a.hn-later-mark");
  if (markLink) {
    comhead.insertBefore(chip, markLink);
    return;
  }

  comhead.appendChild(chip);
}

function removeNewChips(row: HTMLTableRowElement) {
  const comhead = row.querySelector("span.comhead");
  if (!comhead) return;
  for (const el of Array.from(comhead.querySelectorAll(`[data-hn-later-chip="new"]`))) el.remove();
}

function removeCheckpointChips(row: HTMLTableRowElement) {
  const comhead = row.querySelector("span.comhead");
  if (!comhead) return;
  for (const el of Array.from(comhead.querySelectorAll(`[data-hn-later-chip="checkpoint"]`)))
    el.remove();
}

function clearNewHighlights(rows: HTMLTableRowElement[]) {
  for (const row of rows) {
    row.classList.remove("hn-later-new");
    removeNewChips(row);
  }
}

function clearCheckpointChips(rows: HTMLTableRowElement[]) {
  for (const row of rows) removeCheckpointChips(row);
}

function applyCheckpointChip(
  rows: HTMLTableRowElement[],
  lastReadCommentId: number | undefined,
): void {
  clearCheckpointChips(rows);
  if (lastReadCommentId == null) return;

  const row = rows.find((r) => Number(r.id) === lastReadCommentId);
  if (!row) return;

  ensureCheckpointChip(row);
}

function applyNewHighlights(
  rows: HTMLTableRowElement[],
  previousMaxSeen: number | undefined,
  options?: {
    lastReadCommentId?: number;
    dismissNewAboveUntilId?: number;
    seenNewCommentIds?: number[];
  },
): { newCount: number; firstNewRow: HTMLTableRowElement | undefined } {
  clearNewHighlights(rows);

  if (previousMaxSeen == null) return { newCount: 0, firstNewRow: undefined };

  const markerId = options?.lastReadCommentId;
  const dismissUntil = options?.dismissNewAboveUntilId;
  const seenNewIds = new Set(options?.seenNewCommentIds ?? []);
  const markerRowIndex = markerId != null ? rows.findIndex((r) => Number(r.id) === markerId) : -1;

  let newCount = 0;
  let firstNewRow: HTMLTableRowElement | undefined;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;

    if (id <= previousMaxSeen) continue;

    // Skip if this new comment has been individually acknowledged
    if (seenNewIds.has(id)) continue;

    // If a dismissal watermark is set, suppress "new" ABOVE (and including) the marker row,
    // unless the comment id is greater than the watermark (i.e., it arrived after the dismissal).
    if (dismissUntil != null && markerRowIndex >= 0 && i <= markerRowIndex && id <= dismissUntil) {
      continue;
    }

    row.classList.add("hn-later-new");
    ensureNewChip(row);
    newCount += 1;
    if (!firstNewRow) firstNewRow = row;
  }

  return { newCount, firstNewRow };
}

function clearUnreadGutters(rows: HTMLTableRowElement[]) {
  for (const row of rows) row.classList.remove("hn-later-unread");
}

function applyUnreadGutters(rows: HTMLTableRowElement[], readCommentIds: number[] | undefined) {
  clearUnreadGutters(rows);

  const readSet = new Set(readCommentIds ?? []);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;

    // Always treat "new" as unread, even if it appears above the checkpoint.
    if (row.classList.contains("hn-later-new")) {
      row.classList.add("hn-later-unread");
      continue;
    }

    if (readSet.has(id)) continue;

    row.classList.add("hn-later-unread");
  }
}

function scrollToRow(row: HTMLTableRowElement) {
  row.scrollIntoView({ behavior: "smooth", block: "center" });
}

let focusedRow: HTMLTableRowElement | undefined;
function highlightRow(row: HTMLTableRowElement, className: string) {
  if (focusedRow && focusedRow !== row) focusedRow.classList.remove(className);
  focusedRow = row;
  row.classList.add(className);
}

function createToolbarContainer(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "hn-later-toolbar";
  return el;
}

function mountToolbarNearFirstComment(toolbar: HTMLElement, firstCommentRow: HTMLTableRowElement) {
  // Insert a full-width row right before the first comment.
  if (firstCommentRow.previousElementSibling?.classList.contains("hn-later-toolbar-row")) return;

  const tr = document.createElement("tr");
  tr.className = "hn-later-toolbar-row";
  const td = document.createElement("td");
  td.colSpan = 3;
  td.appendChild(toolbar);
  tr.appendChild(td);
  firstCommentRow.parentElement?.insertBefore(tr, firstCommentRow);
}

function mountToolbarInCommentTree(toolbar: HTMLElement) {
  const table = document.querySelector<HTMLTableElement>("table.comment-tree");
  if (!table) return;

  // Idempotent: don't insert a second toolbar row.
  if (table.querySelector("tr.hn-later-toolbar-row")) return;

  const tr = document.createElement("tr");
  tr.className = "hn-later-toolbar-row";
  const td = document.createElement("td");
  td.colSpan = 3;
  td.appendChild(toolbar);
  tr.appendChild(td);

  const tbody = table.tBodies[0] ?? table.createTBody();
  const firstRow = tbody.querySelector("tr");
  if (firstRow) {
    tbody.insertBefore(tr, firstRow);
  } else {
    tbody.appendChild(tr);
  }
}

// Index in DOM order for the currently selected "new comment" within this page's filtered list.
let currentNewIdx: number | undefined;

let finishActiveThread: (() => Promise<void>) | undefined;

let messageListenerRegistered = false;
function registerMessageListener() {
  if (messageListenerRegistered) return;
  messageListenerRegistered = true;

  hnLaterMessenger.onMessage("hnLater/content/continue", async ({ data }) => {
    const url = new URL(window.location.href);
    if (!isItemPage(url)) return { ok: true };

    const currentStoryId = getStoryIdFromItemUrl(url);
    if (!currentStoryId || currentStoryId !== data.storyId) return { ok: true };

    const commentRows = getCommentRows();
    const commentIds = getCommentIdsInDomOrder(commentRows);

    const thread = await getThread(currentStoryId);
    const lastRead = thread?.lastReadCommentId;

    const idx = lastRead ? commentIds.indexOf(lastRead) : -1;
    const target = idx >= 0 ? commentRows[idx] : commentRows[0];
    if (target) {
      scrollToRow(target);
      highlightRow(target, "hn-later-highlight");
    }

    return { ok: true };
  });

  hnLaterMessenger.onMessage("hnLater/content/jumpToComment", async ({ data }) => {
    const url = new URL(window.location.href);
    if (!isItemPage(url)) return { ok: true };

    const currentStoryId = getStoryIdFromItemUrl(url);
    if (!currentStoryId || currentStoryId !== data.storyId) return { ok: true };

    const el = document.getElementById(String(data.commentId));
    const row =
      el instanceof HTMLTableRowElement
        ? el
        : el?.closest?.("tr.athing.comtr") instanceof HTMLTableRowElement
          ? (el.closest("tr.athing.comtr") as HTMLTableRowElement)
          : null;

    if (row) {
      scrollToRow(row);
      highlightRow(row, "hn-later-highlight");
    }

    return { ok: true };
  });

  hnLaterMessenger.onMessage("hnLater/content/finish", async ({ data }) => {
    const url = new URL(window.location.href);
    if (!isItemPage(url)) return { ok: true };

    const currentStoryId = getStoryIdFromItemUrl(url);
    if (!currentStoryId || currentStoryId !== data.storyId) return { ok: true };

    if (finishActiveThread) {
      await finishActiveThread();
    }

    return { ok: true };
  });
}

async function initListingPage() {
  ensureStyles();

  const threads = await listThreads();
  const savedIds = new Set(threads.map((t) => t.id));

  const storyRows = Array.from(document.querySelectorAll<HTMLTableRowElement>("tr.athing"));
  for (const row of storyRows) {
    const storyId = row.id?.trim();
    if (!storyId) continue;

    // Subtext is usually in the next row.
    const subtextTd = row.nextElementSibling?.querySelector<HTMLTableCellElement>("td.subtext");
    if (!subtextTd) continue;
    if (subtextTd.querySelector(`a[data-hn-later-story-id="${storyId}"]`)) continue;

    const title =
      row.querySelector<HTMLAnchorElement>("span.titleline a")?.textContent?.trim() ??
      `HN item ${storyId}`;
    const itemUrl = getItemUrl(storyId);

    const sep = document.createTextNode(" | ");
    const link = document.createElement("a");
    link.href = "#";
    link.className = "hn-later-link";
    link.dataset.hnLaterStoryId = storyId;
    link.textContent = savedIds.has(storyId) ? "saved" : "later";
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (savedIds.has(storyId)) {
        await removeThread(storyId);
        savedIds.delete(storyId);
        link.textContent = "later";
        return;
      }

      const hnPostedAt = getStoryPostedAtFromListingSubtext(subtextTd);
      await upsertThread({ id: storyId, title, url: itemUrl, hnPostedAt });
      savedIds.add(storyId);
      link.textContent = "saved";
    });

    subtextTd.appendChild(sep);
    subtextTd.appendChild(link);
  }
}

async function initItemPage(url: URL) {
  ensureStyles();

  const storyId = getStoryIdFromItemUrl(url);
  if (!storyId) return;

  // Snapshot as definite string for use in closures (TS doesn't carry narrowing into callbacks)
  const storyIdStr: string = storyId;

  const itemUrl = getItemUrl(storyIdStr);
  const title = getItemTitleFromDom();
  const hnPostedAt = getStoryPostedAtFromItemDom();

  const commentRows = getCommentRows();
  const commentIds = getCommentIdsInDomOrder(commentRows);
  const firstCommentRow = commentRows[0];

  function getForcedUnreadCommentIdsForStats(): number[] {
    // In this UI, comments currently marked as "new" are always treated as unread (see applyUnreadGutters).
    const ids: number[] = [];
    for (const row of commentRows) {
      if (!row.classList.contains("hn-later-new")) continue;
      const id = Number(row.id);
      if (Number.isFinite(id)) ids.push(id);
    }
    return ids;
  }

  // Determine saved state.
  let thread: ThreadRecord | undefined = await getThread(storyIdStr);

  // Starred comments are stored independently from saved threads.
  let starsById: Record<string, StarredCommentRecord> = await getStarredCommentsById();

  function commentIdKey(commentId: number): string | undefined {
    if (!Number.isFinite(commentId)) return undefined;
    const n = Math.trunc(commentId);
    if (!Number.isSafeInteger(n)) return undefined;
    if (n <= 0) return undefined;
    return String(n);
  }

  function extractCommentAuthor(row: HTMLTableRowElement): string | undefined {
    const s = row.querySelector<HTMLAnchorElement>("span.comhead a.hnuser")?.textContent?.trim();
    return s || undefined;
  }

  function getCommTextEl(row: HTMLTableRowElement): HTMLElement | null {
    // HN uses <div class="commtext c00">...</div> (not a span).
    return row.querySelector<HTMLElement>(".commtext");
  }

  function extractCommentText(row: HTMLTableRowElement): string | undefined {
    const el = getCommTextEl(row);
    if (!el) return undefined;

    // Prefer textContent (works even if the comment is collapsed/hidden).
    const fromTextContent = el.textContent?.trim();
    if (fromTextContent) return fromTextContent;

    // Fallback to innerText (visible rendering).
    const fromInnerText = el.innerText?.trim();
    return fromInnerText || undefined;
  }

  function flashStarError(comhead: HTMLElement, commentId: number, message: string) {
    const id = `hn-later-star-error-${commentId}`;
    const existing = comhead.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (existing) existing.remove();

    const span = document.createElement("span");
    span.id = id;
    span.className = "hn-later-star-error";
    span.textContent = message;
    comhead.appendChild(span);
    setTimeout(() => span.remove(), 2500);
  }

  function ensureInlineNoteContainer(
    row: HTMLTableRowElement,
    commentId: number,
  ): HTMLDivElement | undefined {
    const cell = row.querySelector<HTMLTableCellElement>("td.default");
    if (!cell) return undefined;
    const existing = cell.querySelector<HTMLDivElement>(
      `div[data-hn-later-note-for="${commentId}"]`,
    );
    if (existing) return existing;

    const el = document.createElement("div");
    el.dataset.hnLaterNoteFor = String(commentId);
    el.className = "hn-later-note";
    cell.appendChild(el);
    return el;
  }

  function removeInlineNoteContainer(row: HTMLTableRowElement, commentId: number) {
    row.querySelector<HTMLElement>(`div[data-hn-later-note-for="${commentId}"]`)?.remove();
  }

  function renderInlineNote(
    row: HTMLTableRowElement,
    commentId: number,
    opts: { startEditing?: boolean } = {},
  ) {
    const key = commentIdKey(commentId);
    if (!key) return;

    const record = starsById[key];
    if (!record) {
      removeInlineNoteContainer(row, commentId);
      return;
    }

    const container = ensureInlineNoteContainer(row, commentId);
    if (!container) return;

    const shouldEdit =
      opts.startEditing === true || container.dataset.hnLaterNoteEditing === "1" || false;
    container.dataset.hnLaterNoteEditing = shouldEdit ? "1" : "0";

    container.replaceChildren();

    const header = document.createElement("div");
    header.className = "hn-later-note-header";

    const label = document.createElement("span");
    label.className = "hn-later-note-label";
    label.textContent = "Note";

    const actions = document.createElement("span");
    actions.className = "hn-later-note-actions";

    header.appendChild(label);
    header.appendChild(actions);

    if (!shouldEdit) {
      const editLink = document.createElement("a");
      editLink.href = "#";
      editLink.textContent = record.note ? "Edit" : "Add note";
      editLink.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.dataset.hnLaterNoteEditing = "1";
        renderInlineNote(row, commentId, { startEditing: true });
      });
      actions.appendChild(editLink);

      if (record.note) {
        const clearLink = document.createElement("a");
        clearLink.href = "#";
        clearLink.textContent = "Clear";
        clearLink.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await setStarredCommentNote(commentId, "");
          starsById[key] = { ...record, note: undefined, noteUpdatedAt: undefined };
          container.dataset.hnLaterNoteEditing = "0";
          renderInlineNote(row, commentId);
        });
        actions.appendChild(clearLink);
      }

      container.appendChild(header);

      if (record.note) {
        const text = document.createElement("div");
        text.className = "hn-later-note-text";
        text.textContent = record.note;
        container.appendChild(text);
      }

      return;
    }

    container.appendChild(header);

    const textarea = document.createElement("textarea");
    textarea.value = record.note ?? "";
    textarea.rows = 3;

    const btnRow = document.createElement("div");
    btnRow.style.marginTop = "6px";
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Save";

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.textContent = "Done";

    const save = async () => {
      const now = Date.now();
      const next = textarea.value;
      await setStarredCommentNote(commentId, next);
      const trimmed = next.trim();
      starsById[key] = {
        ...record,
        note: trimmed.length ? trimmed : undefined,
        noteUpdatedAt: trimmed.length ? now : undefined,
      };
      container.dataset.hnLaterNoteEditing = "0";
      renderInlineNote(row, commentId);
    };

    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await save();
    });

    doneBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.dataset.hnLaterNoteEditing = "0";
      renderInlineNote(row, commentId);
    });

    textarea.addEventListener("keydown", async (e) => {
      if (!((e.metaKey || e.ctrlKey) && e.key === "Enter")) return;
      e.preventDefault();
      e.stopPropagation();
      await save();
    });

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(doneBtn);

    container.appendChild(textarea);
    container.appendChild(btnRow);

    // Focus when explicitly requested (e.g., just starred).
    if (opts.startEditing) {
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.value.length;
        textarea.selectionEnd = textarea.value.length;
      }, 0);
    }
  }

  function ensureStarLink(row: HTMLTableRowElement, comhead: HTMLElement, commentId: number) {
    const key = commentIdKey(commentId);
    if (!key) return;

    const existingStar = comhead.querySelector<HTMLAnchorElement>(
      `a[data-hn-later-star="${commentId}"]`,
    );
    const starEl = existingStar ?? document.createElement("a");

    if (!existingStar) {
      starEl.href = "#";
      starEl.className = "hn-later-star";
      starEl.dataset.hnLaterStar = String(commentId);
      starEl.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const currentKey = commentIdKey(commentId);
        if (!currentKey) return;
        const existing = starsById[currentKey];

        if (existing) {
          await removeStarredComment(commentId);
          delete starsById[currentKey];
          starEl.textContent = "☆";
          starEl.title = "Star this comment for later";
          renderInlineNote(row, commentId);
          return;
        }

        const author = extractCommentAuthor(row);
        const commentText = extractCommentText(row);
        if (!author || !commentText) {
          flashStarError(comhead, commentId, "Couldn’t capture comment (expand and retry)");
          return;
        }

        const record: StarredCommentRecord = {
          commentId: Math.trunc(commentId),
          storyId: storyIdStr,
          storyTitle: title,
          storyUrl: itemUrl,
          author,
          commentText,
          starredAt: Date.now(),
        };

        await upsertStarredComment(record);
        starsById[currentKey] = record;
        starEl.textContent = "★";
        starEl.title = "Starred comment";
        renderInlineNote(row, commentId, { startEditing: true });
      });

      const markLink = comhead.querySelector<HTMLElement>(`a[data-hn-later-mark="${commentId}"]`);
      if (markLink) {
        comhead.insertBefore(starEl, markLink);
      } else {
        comhead.appendChild(starEl);
      }
    }

    const starred = !!starsById[key];
    starEl.textContent = starred ? "★" : "☆";
    starEl.title = starred ? "Starred comment" : "Star this comment for later";
  }

  // Helper to check if a comment is "new" (id > maxSeenCommentId and not individually acknowledged)
  function isNewComment(commentId: number): boolean {
    if (thread?.maxSeenCommentId == null) return false;
    if (commentId <= thread.maxSeenCommentId) return false;
    // Check if individually acknowledged
    if (thread.seenNewCommentIds?.includes(commentId)) return false;
    return true;
  }

  // Handler for "seen" click on NEW comments - acknowledges a range of new comments up to this one.
  async function handleSeenNewComment(commentId: number) {
    // "Seen" should behave like "mark-to-here" for reading progress: advance the checkpoint to at least
    // this row in DOM order (never move backwards).
    const plan = planSeenNewCommentUpdate({
      commentIds,
      lastReadCommentId: thread?.lastReadCommentId,
      clickedCommentId: commentId,
      currentlyNewCommentIds: getForcedUnreadCommentIdsForStats(),
    });
    if (!plan) return;

    // Ensure thread exists, then record acknowledgements.
    thread = await upsertThread({ id: storyIdStr, title, url: itemUrl, hnPostedAt });
    thread = await ensureBaselineMaxSeen({
      thread,
      storyId: storyIdStr,
      commentIds,
      setVisitInfo,
    });
    if (!thread) return;

    // Persist the advanced checkpoint (never move backwards).
    if (
      plan.shouldUpdateLastReadCommentId &&
      plan.nextLastReadCommentId != null &&
      plan.nextLastReadCommentId !== thread.lastReadCommentId
    ) {
      await setLastReadCommentId(storyIdStr, plan.nextLastReadCommentId);
      thread = { ...thread, lastReadCommentId: plan.nextLastReadCommentId };
    }

    // Read progress is read-set based:
    // - If the checkpoint advances, snapshot everything up to the clicked row (mark-to-here semantics).
    // - If the checkpoint does NOT advance (clicked above existing checkpoint), only mark the
    //   acknowledged new comments as read (avoid widening the read-set to unrelated still-new comments).
    await addReadCommentIds(storyIdStr, plan.readCommentIdsToAdd);

    await addSeenNewCommentIds(storyIdStr, plan.seenNewCommentIdsToAdd);

    // Refresh thread to get updated seenNewCommentIds
    thread = await getThread(storyIdStr);

    // Reapply new highlights with updated state
    const { newCount } = applyNewHighlights(commentRows, thread?.maxSeenCommentId, {
      lastReadCommentId: thread?.lastReadCommentId,
      dismissNewAboveUntilId: thread?.dismissNewAboveUntilId,
      seenNewCommentIds: thread?.seenNewCommentIds,
    });
    applyUnreadGutters(commentRows, thread?.readCommentIds);

    // Auto-cleanup: if there are no remaining new comments, graduate the baseline to current max.
    const maxSeen = thread?.maxSeenCommentId;
    if (maxSeen != null && newCount === 0 && commentIds.length) {
      const currentMax = Math.max(...commentIds);
      if (currentMax > maxSeen) {
        await setVisitInfo({ storyId: storyIdStr, maxSeenCommentId: currentMax });
        thread = await getThread(storyIdStr);
      }
    }

    const stats = computeStats({
      commentIds,
      readCommentIds: thread?.readCommentIds,
      newCount,
      forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    // Archived threads freeze progress for display; explicit progress actions should update the
    // frozen snapshot to match the new state (while still preventing passive backsliding).
    if (thread?.status === "archived") {
      await setFrozenProgress(storyIdStr, {
        totalComments: stats.totalComments,
        readCount: stats.readCount,
        percent: stats.percent,
      });
    }

    // Finished threads keep a frozen 100% snapshot; if there are no remaining new comments, roll it
    // forward to the latest totals (still 100%).
    if (thread?.status === "finished" && newCount === 0) {
      const total = commentIds.length;
      await setFrozenProgress(storyIdStr, {
        totalComments: total,
        readCount: total,
        percent: total === 0 ? 0 : 100,
      });
    }

    thread = await getThread(storyIdStr);
    updateMarkLabels();
    applyCheckpointChip(commentRows, thread?.lastReadCommentId);
    renderToolbar();
  }

  // Handler for "mark-to-here" click on OLD comments
  async function handleMarkToHere(commentId: number) {
    // Marking progress implies you care about returning: auto-save the thread.
    thread = await upsertThread({ id: storyIdStr, title, url: itemUrl, hnPostedAt });
    thread = await ensureBaselineMaxSeen({
      thread,
      storyId: storyIdStr,
      commentIds,
      setVisitInfo,
    });
    if (!thread) return;
    await setLastReadCommentId(storyIdStr, commentId);
    thread = { ...thread, lastReadCommentId: commentId };

    // Snapshot IDs up to (and including) the marker in DOM order.
    const markerIdx = commentIds.indexOf(commentId);
    if (markerIdx >= 0) {
      await addReadCommentIds(storyIdStr, commentIds.slice(0, markerIdx + 1));
    }

    // Dismiss existing "new" comments ABOVE (and including) this checkpoint.
    // We store a watermark so future replies (with larger ids) can still be considered new.
    const dismissUntil =
      markerIdx >= 0 ? Math.max(...commentIds.slice(0, markerIdx + 1)) : undefined;
    await setDismissNewAboveUntilId(storyIdStr, dismissUntil);
    thread = { ...thread, dismissNewAboveUntilId: dismissUntil };

    const { newCount } = applyNewHighlights(commentRows, thread.maxSeenCommentId, {
      lastReadCommentId: commentId,
      dismissNewAboveUntilId: dismissUntil,
      seenNewCommentIds: thread.seenNewCommentIds,
    });
    thread = await getThread(storyIdStr);
    if (!thread) return;
    applyUnreadGutters(commentRows, thread?.readCommentIds);
    applyCheckpointChip(commentRows, commentId);

    const stats = computeStats({
      commentIds,
      readCommentIds: thread?.readCommentIds,
      newCount,
      forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
    });
    await setCachedStats({ storyId: storyIdStr, stats });
    const nextThread: ThreadRecord = { ...thread, cachedStats: stats };

    // Archived threads: update frozen snapshot on explicit progress changes (mark-to-here).
    if (thread.status === "archived") {
      const frozen = {
        totalComments: stats.totalComments,
        readCount: stats.readCount,
        percent: stats.percent,
      };
      await setFrozenProgress(storyIdStr, frozen);
      thread = { ...nextThread, frozenProgress: frozen };
    } else {
      thread = nextThread;
    }

    // Update toolbar display if present.
    renderToolbar();
  }

  // Update mark link labels based on whether comment is new or old
  function updateMarkLabels() {
    for (const row of commentRows) {
      const commentId = Number(row.id);
      if (!Number.isFinite(commentId)) continue;

      const comhead = row.querySelector("span.comhead");
      if (!comhead) continue;

      const mark = comhead.querySelector<HTMLAnchorElement>(`a[data-hn-later-mark="${commentId}"]`);
      if (!mark) continue;

      const isNew = isNewComment(commentId);
      mark.textContent = isNew ? "seen" : "mark-to-here";
    }
  }

  // Inject per-comment star + mark-to-here/seen controls.
  for (const row of commentRows) {
    const commentId = Number(row.id);
    if (!Number.isFinite(commentId)) continue;

    const comhead = row.querySelector<HTMLElement>("span.comhead");
    if (!comhead) continue;

    ensureStarLink(row, comhead, commentId);

    if (!comhead.querySelector(`a[data-hn-later-mark="${commentId}"]`)) {
      const isNew = isNewComment(commentId);

      const mark = document.createElement("a");
      mark.href = "#";
      mark.className = "hn-later-mark";
      mark.dataset.hnLaterMark = String(commentId);
      mark.textContent = isNew ? "seen" : "mark-to-here";
      mark.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Check current state (may have changed since page load)
        const currentlyNew = isNewComment(commentId);

        if (currentlyNew) {
          // NEW comment: acknowledge THIS specific new comment
          await handleSeenNewComment(commentId);
        } else {
          // OLD comment: mark reading progress to here
          await handleMarkToHere(commentId);
        }
      });

      comhead.appendChild(mark);
    }

    const key = commentIdKey(commentId);
    if (key && starsById[key]) {
      renderInlineNote(row, commentId);
    }
  }

  const toolbar = createToolbarContainer();
  if (firstCommentRow) {
    mountToolbarNearFirstComment(toolbar, firstCommentRow);
  } else {
    mountToolbarInCommentTree(toolbar);
  }

  function ensureFloatingNewNavContainer(): HTMLDivElement {
    const existing = document.getElementById("hn-later-floating-new-nav");
    if (existing) return existing as HTMLDivElement;

    const el = document.createElement("div");
    el.id = "hn-later-floating-new-nav";
    // Hidden by default until we determine there are new comments.
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  }

  const floatingNewNav = ensureFloatingNewNavContainer();

  function getNewRows(): HTMLTableRowElement[] {
    return commentRows.filter((r) => r.classList.contains("hn-later-new"));
  }

  function getUnreadRows(): HTMLTableRowElement[] {
    return commentRows.filter((r) => r.classList.contains("hn-later-unread"));
  }

  function jumpToUnreadIndex(idx: number) {
    const unreadRows = getUnreadRows();
    if (unreadRows.length === 0) return;
    if (idx < 0 || idx >= unreadRows.length) return;

    const target = unreadRows[idx];
    currentNewIdx = idx;
    scrollToRow(target);
    highlightRow(target, "hn-later-highlight");
    renderFloatingNewNav();
  }

  function jumpToNextUnread() {
    const unreadRows = getUnreadRows();
    if (unreadRows.length === 0) return;

    const nextIdx = currentNewIdx == null ? 0 : (currentNewIdx + 1) % unreadRows.length;
    jumpToUnreadIndex(nextIdx);
  }

  function jumpToPrevUnread() {
    const unreadRows = getUnreadRows();
    if (unreadRows.length === 0) return;

    const prevIdx =
      currentNewIdx == null
        ? unreadRows.length - 1
        : (currentNewIdx - 1 + unreadRows.length) % unreadRows.length;
    jumpToUnreadIndex(prevIdx);
  }

  async function markUnreadAsSeen() {
    if (!thread) return;
    if (commentIds.length === 0) return;

    // Mark the LAST comment in DOM order as read so everything is marked as seen.
    // IMPORTANT:
    // - Reading progress ("unread") is read-set based (see applyUnreadGutters).
    // - HN comment IDs are roughly time-ordered, but the newest ID can appear anywhere in the DOM
    //   (e.g. a late reply under an early parent).
    // So for "mark all unread as seen", advance the read checkpoint to the bottom of the page in
    // DOM order (never by max numeric ID).

    const lastCommentId = commentIds[commentIds.length - 1];

    await setLastReadCommentId(storyIdStr, lastCommentId);
    thread = { ...thread, lastReadCommentId: lastCommentId };

    await setReadCommentIds(storyIdStr, commentIds);

    // Also mark all new comments as seen
    const maxSeenCommentId = Math.max(...commentIds);
    await setVisitInfo({ storyId: storyIdStr, maxSeenCommentId: maxSeenCommentId });
    await setDismissNewAboveUntilId(storyIdStr, undefined);

    clearNewHighlights(commentRows);
    currentNewIdx = undefined;
    thread = await getThread(storyIdStr);
    if (!thread) return;
    applyUnreadGutters(commentRows, thread.readCommentIds);
    applyCheckpointChip(commentRows, lastCommentId);

    const stats = computeStats({
      commentIds,
      readCommentIds: thread.readCommentIds,
      newCount: 0,
      forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    // Archived threads: update frozen snapshot on explicit progress changes (✓ seen).
    if (thread.status === "archived") {
      await setFrozenProgress(storyIdStr, {
        totalComments: stats.totalComments,
        readCount: stats.readCount,
        percent: stats.percent,
      });
    }

    // If this is a Finished thread, rolling new back to 0 means we're caught up again; update the
    // frozen snapshot to reflect the latest total (still 100%).
    if (thread.status === "finished") {
      const total = commentIds.length;
      await setFrozenProgress(storyIdStr, {
        totalComments: total,
        readCount: total,
        percent: total === 0 ? 0 : 100,
      });
    }

    thread = await getThread(storyIdStr);
    updateMarkLabels();
    renderToolbar();
  }

  function renderFloatingNewNav() {
    const saved = !!thread;
    const unreadRows = getUnreadRows();
    const unreadCount = unreadRows.length;
    const newCount = getNewRows().length;

    if (!saved || unreadCount === 0) {
      floatingNewNav.style.display = "none";
      return;
    }

    if (currentNewIdx != null && (currentNewIdx < 0 || currentNewIdx >= unreadCount)) {
      currentNewIdx = undefined;
    }

    floatingNewNav.style.display = "flex";
    floatingNewNav.replaceChildren();

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "↑ unread";
    prevBtn.title = "Previous unread comment";
    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToPrevUnread();
    });

    const label = document.createElement("span");
    label.id = "hn-later-floating-new-label";
    label.className = "hn-later-floating-label";
    const suffix = newCount > 0 ? ` (${newCount} new)` : "";
    label.textContent =
      currentNewIdx == null
        ? `Unread ${unreadCount}${suffix}`
        : `Unread ${currentNewIdx + 1}/${unreadCount}${suffix}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "↓ unread";
    nextBtn.title = "Next unread comment";
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToNextUnread();
    });

    const seenBtn = document.createElement("button");
    seenBtn.type = "button";
    seenBtn.className = "hn-later-floating-seen";
    seenBtn.textContent = "✓ seen";
    seenBtn.title = "Mark all unread comments as seen";
    seenBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void markUnreadAsSeen();
    });

    floatingNewNav.appendChild(prevBtn);
    floatingNewNav.appendChild(label);
    floatingNewNav.appendChild(nextBtn);
    floatingNewNav.appendChild(seenBtn);
  }

  function findContinueTarget(
    lastReadCommentId: number | undefined,
  ): HTMLTableRowElement | undefined {
    if (!lastReadCommentId) return commentRows[0];
    const idx = commentIds.indexOf(lastReadCommentId);
    if (idx < 0) return commentRows[0];
    return commentRows[idx] ?? undefined;
  }

  async function onSaveToggle() {
    if (thread) {
      await removeThread(storyIdStr);
      thread = undefined;
      clearNewHighlights(commentRows);
      clearUnreadGutters(commentRows);
      clearCheckpointChips(commentRows);
      currentNewIdx = undefined;
      renderToolbar();
      return;
    }

    thread = await upsertThread({ id: storyIdStr, title, url: itemUrl, hnPostedAt });

    // First time saving: establish baseline as "seen".
    const currentMax = commentIds.length ? Math.max(...commentIds) : undefined;
    await setVisitInfo({ storyId: storyIdStr, maxSeenCommentId: currentMax });

    const stats = computeStats({
      commentIds,
      readCommentIds: thread.readCommentIds,
      newCount: 0,
      forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    thread = await getThread(storyIdStr);
    if (thread) applyUnreadGutters(commentRows, thread.readCommentIds);
    updateMarkLabels();
    applyCheckpointChip(commentRows, thread?.lastReadCommentId);
    renderToolbar();
  }

  async function onFinish() {
    if (!thread) await onSaveToggle();
    if (!thread) return;

    // Refresh highlights/gutters so unread/new counts are accurate even if user clicks immediately.
    const { newCount } = applyNewHighlights(commentRows, thread.maxSeenCommentId, {
      lastReadCommentId: thread.lastReadCommentId,
      dismissNewAboveUntilId: thread.dismissNewAboveUntilId,
      seenNewCommentIds: thread.seenNewCommentIds,
    });
    applyUnreadGutters(commentRows, thread.readCommentIds);
    applyCheckpointChip(commentRows, thread.lastReadCommentId);
    updateMarkLabels();

    const unreadCount = getUnreadRows().length;
    if (unreadCount > 0 || newCount > 0) {
      const ok = window.confirm(
        "Finish this thread?\n\nThis will mark all current unread/new comments as seen so progress becomes 100%.",
      );
      if (!ok) {
        renderToolbar();
        return;
      }
      await markUnreadAsSeen();
    }

    // Freeze at 100% (as-of now).
    const total = commentIds.length;
    await setThreadStatus(storyIdStr, "finished");
    await setFrozenProgress(storyIdStr, {
      totalComments: total,
      readCount: total,
      percent: total === 0 ? 0 : 100,
    });

    thread = await getThread(storyIdStr);
    updateMarkLabels();
    renderToolbar();
  }

  finishActiveThread = onFinish;

  async function onArchive() {
    if (!thread) await onSaveToggle();
    if (!thread) return;

    const { newCount } = applyNewHighlights(commentRows, thread.maxSeenCommentId, {
      lastReadCommentId: thread.lastReadCommentId,
      dismissNewAboveUntilId: thread.dismissNewAboveUntilId,
      seenNewCommentIds: thread.seenNewCommentIds,
    });
    applyUnreadGutters(commentRows, thread.readCommentIds);
    applyCheckpointChip(commentRows, thread.lastReadCommentId);
    updateMarkLabels();

    const stats = computeStats({
      commentIds,
      readCommentIds: thread.readCommentIds,
      newCount,
      forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    await setThreadStatus(storyIdStr, "archived");
    await setFrozenProgress(storyIdStr, {
      totalComments: stats.totalComments,
      readCount: stats.readCount,
      percent: stats.percent,
    });

    thread = await getThread(storyIdStr);
    updateMarkLabels();
    renderToolbar();
  }

  async function onUnarchive() {
    if (!thread) return;
    await unarchiveThread(storyIdStr);
    thread = await getThread(storyIdStr);
    updateMarkLabels();
    renderToolbar();
  }

  function renderToolbar() {
    toolbar.replaceChildren();

    const saved = !!thread;
    const lastRead = thread?.lastReadCommentId;
    const status = thread?.status ?? "active";

    const computedStats = saved
      ? computeStats({
          commentIds,
          readCommentIds: thread?.readCommentIds,
          newCount: thread?.cachedStats?.newCount,
          forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
        })
      : undefined;
    const progressForDisplay =
      status === "active" ? computedStats : (thread?.frozenProgress ?? computedStats);
    const liveNewCount = saved ? (thread?.cachedStats?.newCount ?? 0) : 0;

    const left = document.createElement("span");
    left.className = "hn-later-pill";
    if (!saved) {
      left.textContent = "Not saved — save to track progress";
    } else {
      const statusPrefix =
        status === "finished" ? "Finished · " : status === "archived" ? "Archived · " : "";
      const base = `Progress: ${progressForDisplay?.readCount ?? 0}/${progressForDisplay?.totalComments ?? 0} (${progressForDisplay?.percent ?? 0}%)`;
      left.textContent =
        liveNewCount > 0
          ? `${statusPrefix}${base} · ${liveNewCount} new`
          : `${statusPrefix}${base}`;
    }

    const saveLink = document.createElement("a");
    saveLink.href = "#";
    saveLink.textContent = saved ? "Unsave" : "Save";
    saveLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await onSaveToggle();
    });

    const continueLink = document.createElement("a");
    continueLink.href = "#";
    continueLink.textContent = "Continue";
    continueLink.style.opacity = saved ? "1" : "0.4";
    continueLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (!saved) return;
      const target = findContinueTarget(thread?.lastReadCommentId);
      if (!target) return;
      scrollToRow(target);
      highlightRow(target, "hn-later-highlight");
    });

    const finishLink = document.createElement("a");
    finishLink.href = "#";
    finishLink.textContent = "Finish";
    finishLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await onFinish();
    });

    const archiveLink = document.createElement("a");
    archiveLink.href = "#";
    archiveLink.textContent = "Archive";
    archiveLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await onArchive();
    });

    const unarchiveLink = document.createElement("a");
    unarchiveLink.href = "#";
    unarchiveLink.textContent = "Unarchive";
    unarchiveLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await onUnarchive();
    });

    toolbar.appendChild(left);
    toolbar.appendChild(saveLink);
    toolbar.appendChild(continueLink);
    if (saved && status !== "active") {
      toolbar.appendChild(unarchiveLink);
    } else {
      toolbar.appendChild(finishLink);
      toolbar.appendChild(archiveLink);
    }
    renderFloatingNewNav();
  }

  // Initialize toolbar immediately (before async new-count calc).
  renderToolbar();

  // If saved, compute new comments + refresh cached stats + persist visit info.
  if (thread) {
    const currentMax = commentIds.length ? Math.max(...commentIds) : undefined;

    // Touch last-visited time, but DO NOT advance the "new comments" baseline on page load.
    await setVisitInfo({ storyId: storyIdStr });

    // If this thread was saved without a baseline (eg, saved from listing page), initialize it once
    // so "new" is tracked from the first item-page visit onward.
    if (thread.maxSeenCommentId == null && currentMax != null) {
      await setVisitInfo({ storyId: storyIdStr, maxSeenCommentId: currentMax });

      clearNewHighlights(commentRows);
      const stats = computeStats({
        commentIds,
        readCommentIds: thread.readCommentIds,
        newCount: 0,
        forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
      });
      await setCachedStats({ storyId: storyIdStr, stats });

      // Refresh local thread copy for UI labels.
      thread = await getThread(storyIdStr);
      if (thread) applyUnreadGutters(commentRows, thread.readCommentIds);
      updateMarkLabels();
      applyCheckpointChip(commentRows, thread?.lastReadCommentId);
      renderToolbar();
      return;
    }

    const { newCount } = applyNewHighlights(commentRows, thread.maxSeenCommentId, {
      lastReadCommentId: thread.lastReadCommentId,
      dismissNewAboveUntilId: thread.dismissNewAboveUntilId,
      seenNewCommentIds: thread.seenNewCommentIds,
    });
    applyUnreadGutters(commentRows, thread.readCommentIds);
    applyCheckpointChip(commentRows, thread.lastReadCommentId);

    const stats = computeStats({
      commentIds,
      readCommentIds: thread.readCommentIds,
      newCount,
      forcedUnreadCommentIds: getForcedUnreadCommentIdsForStats(),
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    // If this thread is archived but missing a frozen snapshot (e.g. archived from popup before any
    // stats were computed), initialize it once from the current progress.
    if (thread.status === "archived" && thread.frozenProgress == null) {
      await setFrozenProgress(storyIdStr, {
        totalComments: stats.totalComments,
        readCount: stats.readCount,
        percent: stats.percent,
      });
    }

    // Refresh local thread copy for UI labels.
    thread = await getThread(storyIdStr);
    updateMarkLabels();
    applyCheckpointChip(commentRows, thread?.lastReadCommentId);
    renderToolbar();
  }
}

export default defineContentScript({
  matches: ["https://news.ycombinator.com/*"],
  async main() {
    registerMessageListener();

    const url = new URL(window.location.href);
    if (isItemPage(url)) {
      await initItemPage(url);
      return;
    }

    await initListingPage();
  },
});
