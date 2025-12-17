(() => {
  const storage = window.hnLaterStorage;
  if (!storage) return;

  const HN_ORIGIN = "https://news.ycombinator.com";

  function nowMs() {
    return Date.now();
  }

  function isItemPage() {
    return location.pathname === "/item" && new URLSearchParams(location.search).has("id");
  }

  function getThreadIdFromUrl() {
    const sp = new URLSearchParams(location.search);
    const id = sp.get("id");
    return id ? String(id) : null;
  }

  function getThreadUrl(threadId) {
    return `${HN_ORIGIN}/item?id=${encodeURIComponent(threadId)}`;
  }

  function getPageTitleForThread(threadId) {
    const row = document.querySelector(`tr.athing#${CSS.escape(threadId)}`);
    const titleLink = row?.querySelector(".titleline > a");
    const title = titleLink?.textContent?.trim();
    if (title) return title;

    const fallbackTitle = document.title?.trim();
    if (fallbackTitle && fallbackTitle !== "Hacker News") return fallbackTitle;
    return `HN item ${threadId}`;
  }

  function getTotalCommentsFromPage(threadId) {
    const storyRow = document.querySelector(`tr.athing#${CSS.escape(threadId)}`);
    const subtext = storyRow?.nextElementSibling?.querySelector("td.subtext");
    if (!subtext) return null;

    const links = Array.from(subtext.querySelectorAll("a"));
    const commentsLink = links.find((a) => {
      const txt = a.textContent?.trim().toLowerCase();
      if (!txt) return false;
      return txt === "discuss" || txt.includes("comment");
    });

    if (!commentsLink) return null;
    const raw = commentsLink.textContent?.trim().toLowerCase() || "";
    if (raw === "discuss") return 0;

    const match = raw.match(/(\d[\d,]*)\s+comment/);
    if (!match) return null;
    const n = Number.parseInt(match[1].replace(/,/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  function clampPct(pct) {
    if (!Number.isFinite(pct)) return 0;
    return Math.max(0, Math.min(100, pct));
  }

  function computeProgressPct(readCount, totalComments) {
    if (!Number.isFinite(readCount) || !Number.isFinite(totalComments)) return 0;
    if (totalComments <= 0) return 0;
    return clampPct((readCount / totalComments) * 100);
  }

  function createOverlay() {
    if (document.getElementById("hnlater-overlay")) return null;

    const root = document.createElement("section");
    root.id = "hnlater-overlay";
    root.setAttribute("aria-live", "polite");

    const header = document.createElement("div");
    header.className = "hnlater-overlay__header";

    const title = document.createElement("div");
    title.className = "hnlater-overlay__title";
    title.textContent = "HN Later";

    const close = document.createElement("button");
    close.className = "hnlater-overlay__close";
    close.type = "button";
    close.title = "Hide";
    close.textContent = "×";
    close.addEventListener("click", () => root.remove());

    header.append(title, close);

    const body = document.createElement("div");
    body.className = "hnlater-overlay__body";

    const progressRow = document.createElement("div");
    progressRow.className = "hnlater-overlay__progressRow";

    const progressText = document.createElement("div");
    progressText.className = "hnlater-overlay__progressText";
    progressText.textContent = "0%";

    const meta = document.createElement("div");
    meta.className = "hnlater-overlay__meta";
    meta.textContent = "0/0 read";

    progressRow.append(progressText, meta);

    const bar = document.createElement("div");
    bar.className = "hnlater-overlay__bar";
    const barFill = document.createElement("div");
    barFill.className = "hnlater-overlay__barFill";
    bar.append(barFill);

    const actions = document.createElement("div");
    actions.className = "hnlater-overlay__actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "hnlater-btn hnlater-btn--primary";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";

    const resumeBtn = document.createElement("button");
    resumeBtn.className = "hnlater-btn";
    resumeBtn.type = "button";
    resumeBtn.textContent = "Resume";

    const markAllBtn = document.createElement("button");
    markAllBtn.className = "hnlater-btn";
    markAllBtn.type = "button";
    markAllBtn.textContent = "Mark all read";

    const resetBtn = document.createElement("button");
    resetBtn.className = "hnlater-btn";
    resetBtn.type = "button";
    resetBtn.textContent = "Reset";

    actions.append(saveBtn, resumeBtn, markAllBtn, resetBtn);

    const status = document.createElement("div");
    status.className = "hnlater-overlay__status";
    status.textContent = "";

    body.append(progressRow, bar, actions, status);
    root.append(header, body);
    document.body.append(root);

    return {
      root,
      progressText,
      meta,
      barFill,
      status,
      saveBtn,
      resumeBtn,
      markAllBtn,
      resetBtn
    };
  }

  async function initThreadPage(threadId) {
    const threadUrl = getThreadUrl(threadId);
    const title = getPageTitleForThread(threadId);

    const commentRows = Array.from(document.querySelectorAll("tr.athing.comtr[id]"));
    const commentIdsInOrder = commentRows.map((row) => String(row.id)).filter(Boolean);
    const commentRowById = new Map(commentRows.map((row) => [String(row.id), row]));
    const totalComments = Math.max(
      getTotalCommentsFromPage(threadId) ?? 0,
      commentIdsInOrder.length
    );

    const overlay = createOverlay();
    if (!overlay) return;

    let threadMeta = (await storage.getThread(threadId)) || { threadId };
    const storedReadIds = await storage.getReadIds(threadId);
    const readSet = new Set(storedReadIds.map(String));

    function applyRowClasses(commentId) {
      const row = commentRowById.get(commentId);
      if (!row) return;
      if (readSet.has(commentId)) {
        row.classList.add("hnlater-read");
        row.classList.remove("hnlater-unread");
      } else {
        row.classList.add("hnlater-unread");
        row.classList.remove("hnlater-read");
      }
    }

    function applyAllRowClasses() {
      for (const id of commentIdsInOrder) applyRowClasses(id);
    }

    function updateOverlay() {
      const readCount = readSet.size;
      const pct = computeProgressPct(readCount, totalComments);
      overlay.progressText.textContent = `${Math.round(pct)}%`;
      overlay.meta.textContent = `${readCount}/${totalComments} read`;
      overlay.barFill.style.width = `${pct}%`;

      overlay.saveBtn.textContent = threadMeta.saved ? "Saved" : "Save";
      overlay.saveBtn.classList.toggle("hnlater-btn--good", Boolean(threadMeta.saved));
    }

    let flushTimeoutId = null;
    let flushChain = Promise.resolve();

    async function doFlush({ merge } = { merge: true }) {
      if (merge) {
        const merged = new Set(readSet);
        const stored = await storage.getReadIds(threadId);
        for (const id of stored.map(String)) merged.add(id);

        if (merged.size !== readSet.size) {
          readSet.clear();
          for (const id of merged) readSet.add(id);
          applyAllRowClasses();
        }
      }

      const readIds = Array.from(readSet);
      await storage.setReadIds(threadId, readIds);

      const readCount = readSet.size;
      const progressPct = computeProgressPct(readCount, totalComments);
      threadMeta = await storage.updateThread(threadId, {
        url: threadUrl,
        title,
        lastVisitedAt: nowMs(),
        totalComments,
        readCount,
        progressPct,
        lastReadCommentId: threadMeta.lastReadCommentId || null,
        lastReadAt: threadMeta.lastReadAt || null
      });

      updateOverlay();
    }

    function flushNow({ merge } = { merge: true }) {
      flushChain = flushChain
        .then(() => doFlush({ merge }))
        .catch(() => {});
      return flushChain;
    }

    function scheduleFlush() {
      if (flushTimeoutId) clearTimeout(flushTimeoutId);
      flushTimeoutId = setTimeout(() => {
        flushTimeoutId = null;
        void flushNow({ merge: true });
      }, 2000);
    }

    function flushImmediately() {
      if (flushTimeoutId) clearTimeout(flushTimeoutId);
      flushTimeoutId = null;
      void flushNow({ merge: true });
    }

    function markRead(commentId, readAtMs) {
      if (!commentId) return;
      if (readSet.has(commentId)) return;
      readSet.add(commentId);
      applyRowClasses(commentId);

      threadMeta.lastReadCommentId = commentId;
      threadMeta.lastReadAt = readAtMs;
      updateOverlay();
      scheduleFlush();
    }

    function findNextUnreadCommentId() {
      if (commentIdsInOrder.length === 0) return null;
      const last = threadMeta.lastReadCommentId ? String(threadMeta.lastReadCommentId) : null;

      const startIndex = last ? Math.max(0, commentIdsInOrder.indexOf(last) + 1) : 0;
      for (let i = startIndex; i < commentIdsInOrder.length; i += 1) {
        const id = commentIdsInOrder[i];
        if (!readSet.has(id)) return id;
      }
      for (let i = 0; i < commentIdsInOrder.length; i += 1) {
        const id = commentIdsInOrder[i];
        if (!readSet.has(id)) return id;
      }
      return null;
    }

    function resumeToNextUnread({ behavior } = { behavior: "smooth" }) {
      const targetId = findNextUnreadCommentId();
      if (!targetId) {
        overlay.status.textContent = "All caught up.";
        return;
      }

      const row = commentRowById.get(targetId);
      if (!row) return;

      overlay.status.textContent = "Resuming…";
      row.classList.add("hnlater-resume-target");
      row.scrollIntoView({ behavior: behavior || "smooth", block: "start" });
      setTimeout(() => row.classList.remove("hnlater-resume-target"), 4000);
    }

    function resetProgress() {
      if (flushTimeoutId) clearTimeout(flushTimeoutId);
      flushTimeoutId = null;
      readSet.clear();
      threadMeta.lastReadCommentId = null;
      threadMeta.lastReadAt = null;
      applyAllRowClasses();
      updateOverlay();
      void flushNow({ merge: false });
    }

    function markAllRead() {
      if (commentIdsInOrder.length === 0) return;
      const t = nowMs();
      for (const id of commentIdsInOrder) {
        if (!readSet.has(id)) readSet.add(id);
        applyRowClasses(id);
      }
      threadMeta.lastReadCommentId = commentIdsInOrder[commentIdsInOrder.length - 1] || null;
      threadMeta.lastReadAt = t;
      updateOverlay();
      scheduleFlush();
    }

    overlay.resumeBtn.addEventListener("click", () => resumeToNextUnread({ behavior: "smooth" }));
    overlay.resetBtn.addEventListener("click", () => resetProgress());
    overlay.markAllBtn.addEventListener("click", () => markAllRead());

    overlay.saveBtn.addEventListener("click", async () => {
      if (threadMeta.saved) {
        await storage.removeSavedThreadId(threadId);
        threadMeta = await storage.updateThread(threadId, { saved: false });
        overlay.status.textContent = "Removed from saved list.";
      } else {
        await storage.addSavedThreadId(threadId);
        threadMeta = await storage.updateThread(threadId, {
          saved: true,
          savedAt: threadMeta.savedAt || nowMs(),
          url: threadUrl,
          title
        });
        overlay.status.textContent = "Saved.";
      }
      updateOverlay();
    });

    applyAllRowClasses();

    threadMeta = await storage.updateThread(threadId, {
      url: threadUrl,
      title,
      lastVisitedAt: nowMs(),
      totalComments,
      readCount: readSet.size,
      progressPct: computeProgressPct(readSet.size, totalComments)
    });
    updateOverlay();
    void flushNow({ merge: true });

    const VIS_RATIO = 0.6;
    const MIN_MS = 800;
    const visible = new Set();
    const timers = new Map();

    function scheduleRead(commentId) {
      if (readSet.has(commentId)) return;
      if (timers.has(commentId)) return;
      const tid = setTimeout(() => {
        timers.delete(commentId);
        if (!visible.has(commentId)) return;
        markRead(commentId, nowMs());
      }, MIN_MS);
      timers.set(commentId, tid);
    }

    function cancelRead(commentId) {
      const tid = timers.get(commentId);
      if (tid) clearTimeout(tid);
      timers.delete(commentId);
    }

    const targetToId = new Map();
    for (const row of commentRows) {
      const id = String(row.id);
      const target = row.querySelector(".commtext") || row;
      targetToId.set(target, id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = targetToId.get(entry.target);
          if (!id) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= VIS_RATIO) {
            visible.add(id);
            scheduleRead(id);
          } else {
            visible.delete(id);
            cancelRead(id);
          }
        }
      },
      { threshold: [0, VIS_RATIO, 1] }
    );

    for (const target of targetToId.keys()) observer.observe(target);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushImmediately();
    });
    window.addEventListener("beforeunload", () => flushImmediately());

    const sp = new URLSearchParams(location.search);
    if (sp.get("hnlater") === "resume") {
      setTimeout(() => resumeToNextUnread({ behavior: "auto" }), 300);
      sp.delete("hnlater");
      const clean = new URL(location.href);
      clean.search = sp.toString();
      history.replaceState({}, "", clean.toString());
    }
  }

  async function initListingPage() {
    const storyRows = Array.from(document.querySelectorAll("tr.athing:not(.comtr)[id]"));
    if (storyRows.length === 0) return;

    const savedIds = await storage.getSavedThreadIds();
    const savedSet = new Set(savedIds);

    for (const row of storyRows) {
      const threadId = String(row.id);
      const subtext = row.nextElementSibling?.querySelector("td.subtext");
      if (!subtext) continue;
      if (subtext.querySelector(`a.hnlater-save-link[data-thread-id="${CSS.escape(threadId)}"]`))
        continue;

      const titleAnchor = row.querySelector(".titleline > a");
      const title = titleAnchor?.textContent?.trim() || `HN item ${threadId}`;
      const threadUrl = getThreadUrl(threadId);

      const sep = document.createTextNode(" | ");
      const link = document.createElement("a");
      link.className = "hnlater-save-link";
      link.dataset.threadId = threadId;
      link.textContent = savedSet.has(threadId) ? "saved" : "later";
      link.href = "#";
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        if (savedSet.has(threadId)) {
          savedSet.delete(threadId);
          await storage.removeSavedThreadId(threadId);
          await storage.updateThread(threadId, { saved: false });
          link.textContent = "later";
        } else {
          savedSet.add(threadId);
          await storage.addSavedThreadId(threadId);
          await storage.updateThread(threadId, {
            url: threadUrl,
            title,
            saved: true,
            savedAt: nowMs()
          });
          link.textContent = "saved";
        }
      });

      subtext.append(sep, link);
    }
  }

  async function init() {
    if (isItemPage()) {
      const threadId = getThreadIdFromUrl();
      if (threadId) await initThreadPage(threadId);
      return;
    }
    await initListingPage();
  }

  init();
})();
