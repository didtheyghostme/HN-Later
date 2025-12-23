import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";

import {
  getThread,
  listThreads,
  removeThread,
  setCachedStats,
  setLastReadCommentId,
  setVisitInfo,
  upsertThread,
  type ThreadRecord,
  type ThreadStats,
} from "../utils/hnStorage";

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

    tr.hn-later-new td.default { outline: 2px solid rgba(255, 165, 0, 0.55); outline-offset: 2px; }
    tr.hn-later-highlight td.default { outline: 3px solid rgba(0, 128, 255, 0.6); outline-offset: 2px; }

    .hn-later-mark { margin-left: 6px; font-size: 10px; opacity: 0.85; }
    .hn-later-mark:hover { opacity: 1; }

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

function clearNewHighlights(rows: HTMLTableRowElement[]) {
  for (const row of rows) row.classList.remove("hn-later-new");
}

function applyNewHighlights(
  rows: HTMLTableRowElement[],
  previousMaxSeen: number | undefined,
): { newCount: number; firstNewRow: HTMLTableRowElement | undefined } {
  clearNewHighlights(rows);

  if (previousMaxSeen == null) return { newCount: 0, firstNewRow: undefined };

  let newCount = 0;
  let firstNewRow: HTMLTableRowElement | undefined;

  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    if (id > previousMaxSeen) {
      row.classList.add("hn-later-new");
      newCount += 1;
      if (!firstNewRow) firstNewRow = row;
    }
  }

  return { newCount, firstNewRow };
}

function computeStats(input: {
  commentIds: number[];
  lastReadCommentId: number | undefined;
  newCount?: number;
}): ThreadStats {
  const totalComments = input.commentIds.length;
  const idx = input.lastReadCommentId ? input.commentIds.indexOf(input.lastReadCommentId) : -1;
  const readCount = idx >= 0 ? idx + 1 : 0;
  const percent = totalComments === 0 ? 0 : Math.round((readCount / totalComments) * 100);

  return {
    totalComments,
    readCount,
    percent,
    newCount: input.newCount,
  };
}

function scrollToRow(row: HTMLTableRowElement) {
  row.scrollIntoView({ behavior: "smooth", block: "center" });
}

function highlightRow(row: HTMLTableRowElement, className: string) {
  row.classList.add(className);
  window.setTimeout(() => row.classList.remove(className), 2000);
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

// Index in DOM order for the currently selected "new comment" within this page's filtered list.
let currentNewIdx: number | undefined;

let messageListenerRegistered = false;
function registerMessageListener() {
  if (messageListenerRegistered) return;
  messageListenerRegistered = true;

  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const message = raw as { type?: string; storyId?: string };
    if (!message?.type) return;

    if (message.type !== "hnLater/continue" && message.type !== "hnLater/jumpToNew") return;

    (async () => {
      try {
        const url = new URL(window.location.href);
        if (!isItemPage(url)) {
          sendResponse({ ok: true });
          return;
        }

        const currentStoryId = getStoryIdFromItemUrl(url);
        if (!currentStoryId || !message.storyId || currentStoryId !== message.storyId) {
          sendResponse({ ok: true });
          return;
        }

        const commentRows = getCommentRows();
        const commentIds = getCommentIdsInDomOrder(commentRows);

        if (message.type === "hnLater/continue") {
          const thread = await getThread(currentStoryId);
          const lastRead = thread?.lastReadCommentId;

          const idx = lastRead ? commentIds.indexOf(lastRead) : -1;
          const target = idx >= 0 ? commentRows[idx] : commentRows[0];
          if (target) {
            scrollToRow(target);
            highlightRow(target, "hn-later-highlight");
          }
        }

        if (message.type === "hnLater/jumpToNew") {
          const thread = await getThread(currentStoryId);
          const { newCount, firstNewRow } = applyNewHighlights(
            commentRows,
            thread?.maxSeenCommentId,
          );
          if (firstNewRow) {
            currentNewIdx = 0;
            scrollToRow(firstNewRow);
            highlightRow(firstNewRow, "hn-later-highlight");

            // Best-effort sync for the floating new-nav label (it may not be mounted yet).
            const label = document.getElementById("hn-later-floating-new-label");
            if (label) label.textContent = `New 1/${newCount}`;
          }
        }

        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();

    return true;
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

      await upsertThread({ id: storyId, title, url: itemUrl });
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

  const commentRows = getCommentRows();
  const commentIds = getCommentIdsInDomOrder(commentRows);
  const firstCommentRow = commentRows[0];
  if (!firstCommentRow) return;

  // Determine saved state.
  let thread: ThreadRecord | undefined = await getThread(storyIdStr);

  // Inject per-comment mark-to-here controls.
  for (const row of commentRows) {
    const commentId = Number(row.id);
    if (!Number.isFinite(commentId)) continue;

    const comhead = row.querySelector("span.comhead");
    if (!comhead) continue;
    if (comhead.querySelector(`a[data-hn-later-mark="${commentId}"]`)) continue;

    const mark = document.createElement("a");
    mark.href = "#";
    mark.className = "hn-later-mark";
    mark.dataset.hnLaterMark = String(commentId);
    mark.textContent = "mark-to-here";
    mark.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Marking progress implies you care about returning: auto-save the thread.
      thread = await upsertThread({ id: storyIdStr, title, url: itemUrl });
      await setLastReadCommentId(storyIdStr, commentId);
      thread = { ...thread, lastReadCommentId: commentId };

      const stats = computeStats({
        commentIds,
        lastReadCommentId: commentId,
        newCount: thread.cachedStats?.newCount,
      });
      await setCachedStats({ storyId: storyIdStr, stats });
      thread = { ...thread, cachedStats: stats };

      // Update toolbar display if present.
      renderToolbar();
    });

    comhead.appendChild(mark);
  }

  const toolbar = createToolbarContainer();
  mountToolbarNearFirstComment(toolbar, firstCommentRow);

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

  function jumpToNewIndex(idx: number) {
    const newRows = getNewRows();
    if (newRows.length === 0) return;
    if (idx < 0 || idx >= newRows.length) return;

    const target = newRows[idx];
    currentNewIdx = idx;
    scrollToRow(target);
    highlightRow(target, "hn-later-highlight");
    renderFloatingNewNav();
  }

  function jumpToNextNew() {
    const newRows = getNewRows();
    if (newRows.length === 0) return;

    const nextIdx = currentNewIdx == null ? 0 : (currentNewIdx + 1) % newRows.length;
    jumpToNewIndex(nextIdx);
  }

  function jumpToPrevNew() {
    const newRows = getNewRows();
    if (newRows.length === 0) return;

    const prevIdx =
      currentNewIdx == null
        ? newRows.length - 1
        : (currentNewIdx - 1 + newRows.length) % newRows.length;
    jumpToNewIndex(prevIdx);
  }

  async function markNewAsSeen() {
    if (!thread) return;

    const currentMax = commentIds.length ? Math.max(...commentIds) : undefined;
    await setVisitInfo({ storyId: storyIdStr, maxSeenCommentId: currentMax });

    clearNewHighlights(commentRows);
    currentNewIdx = undefined;

    const stats = computeStats({
      commentIds,
      lastReadCommentId: thread?.lastReadCommentId,
      newCount: 0,
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    thread = await getThread(storyIdStr);
    renderToolbar();
  }

  function renderFloatingNewNav() {
    const saved = !!thread;
    const newRows = getNewRows();
    const newCount = newRows.length;

    if (!saved || newCount === 0) {
      floatingNewNav.style.display = "none";
      return;
    }

    if (currentNewIdx != null && (currentNewIdx < 0 || currentNewIdx >= newCount)) {
      currentNewIdx = undefined;
    }

    floatingNewNav.style.display = "flex";
    floatingNewNav.replaceChildren();

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "↑ new";
    prevBtn.title = "Previous new comment";
    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToPrevNew();
    });

    const label = document.createElement("span");
    label.id = "hn-later-floating-new-label";
    label.className = "hn-later-floating-label";
    label.textContent =
      currentNewIdx == null ? `New ${newCount}` : `New ${currentNewIdx + 1}/${newCount}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "↓ new";
    nextBtn.title = "Next new comment";
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToNextNew();
    });

    const seenBtn = document.createElement("button");
    seenBtn.type = "button";
    seenBtn.className = "hn-later-floating-seen";
    seenBtn.textContent = "✓ seen";
    seenBtn.title = "Mark new comments as seen";
    seenBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void markNewAsSeen();
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
      currentNewIdx = undefined;
      renderToolbar();
      return;
    }

    thread = await upsertThread({ id: storyIdStr, title, url: itemUrl });

    // First time saving: establish baseline as "seen".
    const currentMax = commentIds.length ? Math.max(...commentIds) : undefined;
    await setVisitInfo({ storyId: storyIdStr, maxSeenCommentId: currentMax });

    const stats = computeStats({
      commentIds,
      lastReadCommentId: thread.lastReadCommentId,
      newCount: 0,
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    thread = await getThread(storyIdStr);
    renderToolbar();
  }

  function renderToolbar() {
    toolbar.replaceChildren();

    const saved = !!thread;
    const lastRead = thread?.lastReadCommentId;
    const newCount = getNewRows().length;
    const canNavNew = saved && newCount > 0;

    const stats = saved
      ? computeStats({
          commentIds,
          lastReadCommentId: lastRead,
          newCount: thread?.cachedStats?.newCount,
        })
      : undefined;

    const left = document.createElement("span");
    left.className = "hn-later-pill";
    left.textContent = saved
      ? `Progress: ${stats?.readCount ?? 0}/${stats?.totalComments ?? 0} (${stats?.percent ?? 0}%)`
      : "Not saved — save to track progress";

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

    const jumpNewLink = document.createElement("a");
    jumpNewLink.href = "#";
    jumpNewLink.textContent = saved ? `Jump to new (${newCount})` : "Jump to new";
    jumpNewLink.style.opacity = canNavNew ? "1" : "0.4";
    jumpNewLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (!canNavNew) return;
      jumpToNewIndex(0);
    });

    const markNewSeenLink = document.createElement("a");
    markNewSeenLink.href = "#";
    markNewSeenLink.textContent = "Mark new as seen";
    markNewSeenLink.style.opacity = saved ? "1" : "0.4";
    markNewSeenLink.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!saved) return;
      await markNewAsSeen();
    });

    toolbar.appendChild(left);
    toolbar.appendChild(saveLink);
    toolbar.appendChild(continueLink);
    toolbar.appendChild(jumpNewLink);
    toolbar.appendChild(markNewSeenLink);
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
        lastReadCommentId: thread.lastReadCommentId,
        newCount: 0,
      });
      await setCachedStats({ storyId: storyIdStr, stats });

      // Refresh local thread copy for UI labels.
      thread = await getThread(storyIdStr);
      renderToolbar();
      return;
    }

    const { newCount } = applyNewHighlights(commentRows, thread.maxSeenCommentId);

    const stats = computeStats({
      commentIds,
      lastReadCommentId: thread.lastReadCommentId,
      newCount,
    });
    await setCachedStats({ storyId: storyIdStr, stats });

    // Refresh local thread copy for UI labels.
    thread = await getThread(storyIdStr);
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
