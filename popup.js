(() => {
  const contentEl = document.getElementById("content");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const storage = window.hnLaterStorage;

  function formatPct(pct) {
    if (!Number.isFinite(pct)) return "0%";
    return `${Math.max(0, Math.min(100, Math.round(pct)))}%`;
  }

  function getResumeUrl(url) {
    try {
      const u = new URL(url);
      u.searchParams.set("hnlater", "resume");
      return u.toString();
    } catch {
      return url;
    }
  }

  async function loadSavedThreads() {
    const ids = await storage.getSavedThreadIds();
    if (ids.length === 0) return [];

    const keys = ids.map((id) => storage.getThreadKey(id));
    const data = await storage.storageGet(keys);

    const threads = ids
      .map((id) => data[storage.getThreadKey(id)])
      .filter(Boolean)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return threads;
  }

  function renderEmpty() {
    contentEl.innerHTML =
      '<div class="empty">No saved threads yet.<br/>Use the “Save” button on an HN thread.</div>';
  }

  function renderThreadCard(thread) {
    const pct = formatPct(thread.progressPct || 0);
    const readCount = Number(thread.readCount || 0);
    const total = Number(thread.totalComments || 0);
    const meta = `${readCount}/${total} read`;

    const card = document.createElement("article");
    card.className = "card";

    const titleLink = document.createElement("a");
    titleLink.className = "card__title";
    titleLink.href = thread.url;
    titleLink.target = "_blank";
    titleLink.rel = "noreferrer";
    titleLink.textContent = thread.title || thread.url;

    const row = document.createElement("div");
    row.className = "row";

    const pctEl = document.createElement("div");
    pctEl.textContent = pct;

    const metaEl = document.createElement("div");
    metaEl.textContent = meta;

    row.append(pctEl, metaEl);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "bar__fill";
    fill.style.width = `${Math.max(0, Math.min(100, thread.progressPct || 0))}%`;
    bar.append(fill);

    const actions = document.createElement("div");
    actions.className = "actions";

    const resumeBtn = document.createElement("button");
    resumeBtn.className = "btn btn--primary";
    resumeBtn.type = "button";
    resumeBtn.textContent = "Resume";
    resumeBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: getResumeUrl(thread.url) });
    });

    const openBtn = document.createElement("button");
    openBtn.className = "btn";
    openBtn.type = "button";
    openBtn.textContent = "Open";
    openBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: thread.url });
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn--danger";
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      await unsaveThread(thread.threadId);
      await render();
    });

    actions.append(resumeBtn, openBtn, removeBtn);

    card.append(titleLink, row, bar, actions);
    return card;
  }

  async function unsaveThread(threadId) {
    await storage.removeSavedThreadId(threadId);

    const key = storage.getThreadKey(threadId);
    const data = await storage.storageGet([key]);
    const thread = data[key];
    if (thread) {
      await storage.storageSet({ [key]: { ...thread, saved: false } });
    }
  }

  async function clearAll() {
    await storage.clearAllData();
  }

  async function render() {
    const threads = await loadSavedThreads();
    contentEl.innerHTML = "";

    if (threads.length === 0) {
      renderEmpty();
      return;
    }

    for (const thread of threads) {
      contentEl.append(renderThreadCard(thread));
    }
  }

  clearAllBtn.addEventListener("click", async () => {
    const ok = confirm("Clear all saved threads and progress?");
    if (!ok) return;
    await clearAll();
    await render();
  });

  render();
})();
