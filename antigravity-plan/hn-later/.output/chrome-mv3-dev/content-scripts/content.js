var content = (function() {
  "use strict";
  function defineContentScript(definition2) {
    return definition2;
  }
  const browser$1 = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  async function saveItem(item) {
    const response = await browser.runtime.sendMessage({ type: "SAVE_ITEM", item });
    if (!response.success) throw new Error(response.error);
  }
  async function removeItem(storyId) {
    const response = await browser.runtime.sendMessage({ type: "REMOVE_ITEM", storyId });
    if (!response.success) throw new Error(response.error);
  }
  async function getItem(storyId) {
    const response = await browser.runtime.sendMessage({ type: "GET_ITEM", storyId });
    if (!response.success) throw new Error(response.error);
    return response.item;
  }
  async function isItemSaved(storyId) {
    const response = await browser.runtime.sendMessage({ type: "IS_SAVED", storyId });
    if (!response.success) throw new Error(response.error);
    return response.saved;
  }
  async function updateCheckpoint(storyId, checkpointCommentId, totalComments) {
    const response = await browser.runtime.sendMessage({
      type: "UPDATE_CHECKPOINT",
      storyId,
      checkpointCommentId,
      totalComments
    });
    if (!response.success) throw new Error(response.error);
  }
  async function getProgress(storyId) {
    const response = await browser.runtime.sendMessage({ type: "GET_PROGRESS", storyId });
    if (!response.success) throw new Error(response.error);
    return response.progress;
  }
  const definition = defineContentScript({
    matches: ["*://news.ycombinator.com/*"],
    main() {
      const isItemPage = window.location.pathname === "/item";
      const storyId = new URLSearchParams(window.location.search).get("id");
      if (isItemPage && storyId) {
        initItemPage(storyId);
        initKeyboardShortcuts(storyId);
      }
      if (isItemPage) {
        document.body.classList.add("hn-later-item-page");
        initCollapseButtons();
      }
      initSaveLinks();
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
          refreshSaveLinkStates();
        }
      });
    }
  });
  async function initSaveLinks() {
    const storyRows = document.querySelectorAll("tr.athing:not(.comtr)");
    const storyId = new URLSearchParams(window.location.search).get("id");
    const isItemPage = window.location.pathname === "/item";
    for (const row of storyRows) {
      const id = row.id;
      if (!id) continue;
      if (isItemPage && id === storyId) continue;
      const subtextRow = row.nextElementSibling;
      const subtext = subtextRow?.querySelector("td.subtext");
      if (!subtext) continue;
      const links = subtext.querySelectorAll("a");
      const commentsLink = Array.from(links).find((a) => a.href.includes("item?id="));
      if (!commentsLink) continue;
      const saveLink = document.createElement("a");
      saveLink.href = "#";
      saveLink.className = "hn-later-save-link";
      saveLink.dataset.storyId = id;
      const isSaved = await isItemSaved(id);
      updateSaveLinkState(saveLink, isSaved);
      saveLink.addEventListener("click", async (e) => {
        e.preventDefault();
        await toggleSaveFromListing(saveLink, row);
      });
      const container = document.createElement("span");
      container.className = "hn-later-save-container";
      container.innerHTML = " | ";
      container.appendChild(saveLink);
      subtext.appendChild(container);
    }
  }
  function updateSaveLinkState(link, isSaved) {
    link.textContent = isSaved ? "saved ✓" : "save";
    link.classList.toggle("saved", isSaved);
  }
  async function refreshSaveLinkStates() {
    const saveLinks = document.querySelectorAll(".hn-later-save-link");
    for (const link of saveLinks) {
      const storyId = link.dataset.storyId;
      if (!storyId) continue;
      const isSaved = await isItemSaved(storyId);
      updateSaveLinkState(link, isSaved);
    }
  }
  async function toggleSaveFromListing(link, row) {
    const storyId = link.dataset.storyId;
    const isSaved = link.classList.contains("saved");
    if (isSaved) {
      await removeItem(storyId);
      updateSaveLinkState(link, false);
    } else {
      const titleCell = row.querySelector("td.title:last-child");
      const titleLink = titleCell?.querySelector("a.titleline > a, span.titleline > a");
      if (!titleLink) return;
      const title = titleLink.textContent || "Untitled";
      const url = titleLink.href;
      const hnUrl = `https://news.ycombinator.com/item?id=${storyId}`;
      const subtextRow = row.nextElementSibling;
      const commentLink = subtextRow?.querySelector('a[href*="item?id="]');
      const commentText = commentLink?.textContent || "";
      const commentMatch = commentText.match(/(\d+)\s*comment/);
      const totalComments = commentMatch ? parseInt(commentMatch[1], 10) : 0;
      await saveItem({
        id: storyId,
        title,
        url,
        hnUrl,
        totalComments
      });
      updateSaveLinkState(link, true);
    }
  }
  async function initItemPage(storyId) {
    await addItemPageSaveLink(storyId);
    const storyData = await getItem(storyId);
    if (storyData) {
      initCommentTracking(storyId, storyData.checkpointTimestamp);
    }
  }
  async function addItemPageSaveLink(storyId) {
    const subtext = document.querySelector("td.subtext");
    if (!subtext) return;
    const links = subtext.querySelectorAll("a");
    const lastLink = links[links.length - 1];
    if (!lastLink) return;
    const saveLink = document.createElement("a");
    saveLink.href = "#";
    saveLink.className = "hn-later-save-link";
    saveLink.dataset.storyId = storyId;
    const isSaved = await isItemSaved(storyId);
    updateSaveLinkState(saveLink, isSaved);
    saveLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await toggleSaveFromItemPage(saveLink, storyId);
    });
    const separator = document.createTextNode(" | ");
    lastLink.after(separator, saveLink);
  }
  async function toggleSaveFromItemPage(link, storyId) {
    const isSaved = link.classList.contains("saved");
    if (isSaved) {
      await removeItem(storyId);
      updateSaveLinkState(link, false);
      removeTrackingUI();
    } else {
      const titleEl = document.querySelector(".titleline > a, .storylink");
      const title = titleEl?.textContent || "Untitled";
      const url = titleEl?.href || window.location.href;
      const hnUrl = window.location.href;
      const comments = document.querySelectorAll("tr.athing.comtr");
      const totalComments = comments.length;
      await saveItem({
        id: storyId,
        title,
        url,
        hnUrl,
        totalComments
      });
      updateSaveLinkState(link, true);
      initCommentTracking(storyId, null);
    }
  }
  function removeTrackingUI() {
    document.querySelector(".hn-later-scrollbar")?.remove();
    document.querySelector(".hn-later-buttons")?.remove();
    document.querySelectorAll(".hn-later-new-label").forEach((el) => el.remove());
  }
  async function initCommentTracking(storyId, checkpointTimestamp) {
    const comments = document.querySelectorAll("tr.athing.comtr");
    if (comments.length === 0) return;
    const progress = await getProgress(storyId);
    const checkpointId = progress?.checkpointCommentId ?? null;
    if (checkpointTimestamp) {
      markNewComments(comments, checkpointTimestamp);
    }
    createScrollbarMarkers(comments, checkpointId);
    createFloatingButtons(storyId, comments);
    if (window.location.hash === "#hn-later-continue" && checkpointId) {
      const checkpointEl = document.getElementById(checkpointId);
      if (checkpointEl) {
        checkpointEl.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }
  function markNewComments(comments, checkpointTimestamp) {
    console.log("[HN-Later] markNewComments called with checkpointTimestamp:", checkpointTimestamp, new Date(checkpointTimestamp).toISOString());
    let newCount = 0;
    comments.forEach((comment, index) => {
      const ageSpan = comment.querySelector(".age");
      const ageLink = comment.querySelector(".age a");
      if (!ageSpan && !ageLink) {
        if (index < 3) console.log(`[HN-Later] Comment ${comment.id}: No .age or .age a found`);
        return;
      }
      let titleAttr = ageSpan?.getAttribute("title") || ageLink?.getAttribute("title");
      const timeEl = comment.querySelector(".age time");
      if (!titleAttr && timeEl) {
        titleAttr = timeEl.getAttribute("title") || timeEl.getAttribute("datetime");
      }
      if (index < 5) {
        console.log(`[HN-Later] Comment ${comment.id}: ageSpan=${!!ageSpan}, ageLink=${!!ageLink}, titleAttr="${titleAttr}"`);
      }
      if (!titleAttr) return;
      const isoDateStr = titleAttr.split(" ")[0];
      const commentTime = new Date(isoDateStr).getTime();
      if (isNaN(commentTime)) {
        if (index < 3) console.log(`[HN-Later] Comment ${comment.id}: Failed to parse timestamp "${isoDateStr}" from "${titleAttr}"`);
        return;
      }
      if (index < 5) {
        console.log(`[HN-Later] Comment ${comment.id}: commentTime=${commentTime} (${new Date(commentTime).toISOString()}), isNew=${commentTime > checkpointTimestamp}`);
      }
      if (commentTime > checkpointTimestamp) {
        newCount++;
        const label = document.createElement("span");
        label.className = "hn-later-new-label";
        label.textContent = "[NEW]";
        const insertAfter = ageLink || ageSpan;
        insertAfter?.parentElement?.insertBefore(label, insertAfter.nextSibling);
        comment.classList.add("hn-later-new");
      }
    });
    console.log(`[HN-Later] Total new comments found: ${newCount}`);
  }
  let markersContainer = null;
  const markerMap = /* @__PURE__ */ new Map();
  function createScrollbarMarkers(comments, checkpointId) {
    markersContainer = document.createElement("div");
    markersContainer.className = "hn-later-scrollbar";
    const viewport = document.createElement("div");
    viewport.className = "hn-later-viewport";
    markersContainer.appendChild(viewport);
    const docHeight = document.documentElement.scrollHeight;
    let foundCheckpoint = checkpointId === null;
    comments.forEach((comment) => {
      const commentId = comment.id;
      const rect = comment.getBoundingClientRect();
      const top = (rect.top + window.scrollY) / docHeight;
      const marker = document.createElement("div");
      marker.className = "hn-later-marker";
      marker.dataset.commentId = commentId;
      if (comment.classList.contains("hn-later-new")) {
        marker.classList.add("new");
      } else if (!foundCheckpoint) {
        marker.classList.add("read");
      } else {
        marker.classList.add("unread");
      }
      if (commentId === checkpointId) {
        foundCheckpoint = true;
      }
      marker.style.top = `${top * 100}%`;
      marker.addEventListener("click", () => {
        comment.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      markersContainer.appendChild(marker);
      markerMap.set(commentId, marker);
    });
    document.body.appendChild(markersContainer);
    const updateViewport = () => {
      const scrollTop = window.scrollY;
      const viewportHeight = window.innerHeight;
      const docHeight2 = document.documentElement.scrollHeight;
      viewport.style.top = `${scrollTop / docHeight2 * 100}%`;
      viewport.style.height = `${viewportHeight / docHeight2 * 100}%`;
    };
    window.addEventListener("scroll", updateViewport, { passive: true });
    updateViewport();
  }
  function createFloatingButtons(storyId, comments) {
    const container = document.createElement("div");
    container.className = "hn-later-buttons";
    const checkpointBtn = document.createElement("button");
    checkpointBtn.className = "hn-later-btn checkpoint";
    checkpointBtn.innerHTML = "📍 Checkpoint";
    checkpointBtn.title = "Save reading position";
    checkpointBtn.addEventListener("click", () => setCheckpoint(storyId, comments));
    const nextTopicBtn = document.createElement("button");
    nextTopicBtn.className = "hn-later-btn next-topic";
    nextTopicBtn.innerHTML = "⏭️ Next Topic";
    nextTopicBtn.title = "Jump to next top-level comment";
    nextTopicBtn.addEventListener("click", () => scrollToNextTopic(comments));
    container.appendChild(checkpointBtn);
    container.appendChild(nextTopicBtn);
    document.body.appendChild(container);
  }
  let collapseOverlay = null;
  const collapseBtnMap = /* @__PURE__ */ new Map();
  function initCollapseButtons() {
    const comments = document.querySelectorAll("tr.athing.comtr");
    if (comments.length === 0) return;
    collapseOverlay = document.createElement("div");
    collapseOverlay.className = "hn-later-collapse-overlay";
    document.body.appendChild(collapseOverlay);
    comments.forEach((comment) => {
      const commentId = comment.id;
      if (!commentId) return;
      const collapseBtn = document.createElement("button");
      collapseBtn.className = "hn-later-collapse-btn";
      collapseBtn.textContent = "▼";
      collapseBtn.title = "Collapse thread";
      collapseBtn.dataset.commentId = commentId;
      collapseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const toggleLink = comment.querySelector(".togg");
        if (toggleLink) {
          toggleLink.click();
          const isCollapsed = toggleLink.textContent?.includes("+");
          collapseBtn.textContent = isCollapsed ? "▲" : "▼";
          requestAnimationFrame(() => updateCollapseButtonPositions());
        }
      });
      collapseOverlay.appendChild(collapseBtn);
      collapseBtnMap.set(commentId, collapseBtn);
    });
    updateCollapseButtonPositions();
    window.addEventListener("scroll", updateCollapseButtonPositions, { passive: true });
    window.addEventListener("resize", updateCollapseButtonPositions, { passive: true });
  }
  function updateCollapseButtonPositions() {
    if (!collapseOverlay) return;
    const viewportHeight = window.innerHeight;
    const mainTable = document.querySelector("#hnmain") || document.querySelector('table[width="85%"]');
    const contentRight = mainTable ? mainTable.getBoundingClientRect().right : window.innerWidth - 100;
    collapseBtnMap.forEach((btn, commentId) => {
      const comment = document.getElementById(commentId);
      if (!comment) {
        btn.style.display = "none";
        return;
      }
      const rect = comment.getBoundingClientRect();
      const isAboveViewport = rect.bottom < 0;
      const isBelowViewport = rect.top > viewportHeight;
      const inHeaderArea = rect.top < 50;
      if (isAboveViewport || isBelowViewport || inHeaderArea) {
        btn.style.display = "none";
      } else {
        btn.style.display = "flex";
        btn.style.top = `${rect.top}px`;
        btn.style.left = `${contentRight + 8}px`;
        btn.style.right = "auto";
      }
    });
  }
  async function setCheckpoint(storyId, comments) {
    let topComment = null;
    for (const comment of comments) {
      const rect = comment.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
        topComment = comment;
        break;
      }
    }
    if (!topComment) {
      for (const comment of comments) {
        const rect = comment.getBoundingClientRect();
        if (rect.bottom > 0) {
          topComment = comment;
          break;
        }
      }
    }
    if (topComment) {
      await updateCheckpoint(storyId, topComment.id, comments.length);
      showToast("📍 Checkpoint saved!");
      let foundCheckpoint = false;
      comments.forEach((comment) => {
        const marker = markerMap.get(comment.id);
        if (marker && !marker.classList.contains("new")) {
          if (!foundCheckpoint) {
            marker.classList.remove("unread");
            marker.classList.add("read");
          } else {
            marker.classList.remove("read");
            marker.classList.add("unread");
          }
        }
        if (comment.id === topComment.id) {
          foundCheckpoint = true;
        }
      });
    }
  }
  function scrollToNextTopic(comments) {
    const currentScrollTop = window.scrollY;
    for (const comment of comments) {
      const indent = comment.querySelector(".ind img");
      const indentWidth = indent ? parseInt(indent.getAttribute("width") || "0", 10) : 0;
      if (indentWidth === 0) {
        const rect = comment.getBoundingClientRect();
        if (rect.top + window.scrollY > currentScrollTop + 100) {
          comment.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        }
      }
    }
  }
  function showToast(message) {
    let toast = document.querySelector(".hn-later-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "hn-later-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast?.classList.remove("show"), 2e3);
  }
  function initKeyboardShortcuts(storyId) {
    document.addEventListener("keydown", async (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        const isSaved = await isItemSaved(storyId);
        if (isSaved) {
          await removeItem(storyId);
          showToast("📚 Removed from saved");
          const saveLink = document.querySelector(".hn-later-save-link");
          if (saveLink) {
            saveLink.textContent = "save";
            saveLink.classList.remove("saved");
          }
          document.querySelector(".hn-later-scrollbar")?.remove();
          document.querySelector(".hn-later-buttons")?.remove();
        } else {
          const titleEl = document.querySelector(".titleline > a, .storylink");
          const title = titleEl?.textContent || "Untitled";
          const url = titleEl?.href || window.location.href;
          const hnUrl = window.location.href;
          const comments = document.querySelectorAll("tr.athing.comtr");
          await saveItem({
            id: storyId,
            title,
            url,
            hnUrl,
            totalComments: comments.length
          });
          showToast("📌 Saved for later (Cmd+Shift+S)");
          const saveLink = document.querySelector(".hn-later-save-link");
          if (saveLink) {
            saveLink.textContent = "saved ✓";
            saveLink.classList.add("saved");
          }
          const storyData = await getItem(storyId);
          if (storyData && !document.querySelector(".hn-later-scrollbar")) {
            window.location.reload();
          }
        }
      }
    });
  }
  function print$1(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger$1 = {
    debug: (...args) => print$1(console.debug, ...args),
    log: (...args) => print$1(console.log, ...args),
    warn: (...args) => print$1(console.warn, ...args),
    error: (...args) => print$1(console.error, ...args)
  };
  class WxtLocationChangeEvent extends Event {
    constructor(newUrl, oldUrl) {
      super(WxtLocationChangeEvent.EVENT_NAME, {});
      this.newUrl = newUrl;
      this.oldUrl = oldUrl;
    }
    static EVENT_NAME = getUniqueEventName("wxt:locationchange");
  }
  function getUniqueEventName(eventName) {
    return `${browser?.runtime?.id}:${"content"}:${eventName}`;
  }
  function createLocationWatcher(ctx) {
    let interval;
    let oldUrl;
    return {
      /**
       * Ensure the location watcher is actively looking for URL changes. If it's already watching,
       * this is a noop.
       */
      run() {
        if (interval != null) return;
        oldUrl = new URL(location.href);
        interval = ctx.setInterval(() => {
          let newUrl = new URL(location.href);
          if (newUrl.href !== oldUrl.href) {
            window.dispatchEvent(new WxtLocationChangeEvent(newUrl, oldUrl));
            oldUrl = newUrl;
          }
        }, 1e3);
      }
    };
  }
  class ContentScriptContext {
    constructor(contentScriptName, options) {
      this.contentScriptName = contentScriptName;
      this.options = options;
      this.abortController = new AbortController();
      if (this.isTopFrame) {
        this.listenForNewerScripts({ ignoreFirstEvent: true });
        this.stopOldScripts();
      } else {
        this.listenForNewerScripts();
      }
    }
    static SCRIPT_STARTED_MESSAGE_TYPE = getUniqueEventName(
      "wxt:content-script-started"
    );
    isTopFrame = window.self === window.top;
    abortController;
    locationWatcher = createLocationWatcher(this);
    receivedMessageIds = /* @__PURE__ */ new Set();
    get signal() {
      return this.abortController.signal;
    }
    abort(reason) {
      return this.abortController.abort(reason);
    }
    get isInvalid() {
      if (browser.runtime.id == null) {
        this.notifyInvalidated();
      }
      return this.signal.aborted;
    }
    get isValid() {
      return !this.isInvalid;
    }
    /**
     * Add a listener that is called when the content script's context is invalidated.
     *
     * @returns A function to remove the listener.
     *
     * @example
     * browser.runtime.onMessage.addListener(cb);
     * const removeInvalidatedListener = ctx.onInvalidated(() => {
     *   browser.runtime.onMessage.removeListener(cb);
     * })
     * // ...
     * removeInvalidatedListener();
     */
    onInvalidated(cb) {
      this.signal.addEventListener("abort", cb);
      return () => this.signal.removeEventListener("abort", cb);
    }
    /**
     * Return a promise that never resolves. Useful if you have an async function that shouldn't run
     * after the context is expired.
     *
     * @example
     * const getValueFromStorage = async () => {
     *   if (ctx.isInvalid) return ctx.block();
     *
     *   // ...
     * }
     */
    block() {
      return new Promise(() => {
      });
    }
    /**
     * Wrapper around `window.setInterval` that automatically clears the interval when invalidated.
     *
     * Intervals can be cleared by calling the normal `clearInterval` function.
     */
    setInterval(handler, timeout) {
      const id = setInterval(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearInterval(id));
      return id;
    }
    /**
     * Wrapper around `window.setTimeout` that automatically clears the interval when invalidated.
     *
     * Timeouts can be cleared by calling the normal `setTimeout` function.
     */
    setTimeout(handler, timeout) {
      const id = setTimeout(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearTimeout(id));
      return id;
    }
    /**
     * Wrapper around `window.requestAnimationFrame` that automatically cancels the request when
     * invalidated.
     *
     * Callbacks can be canceled by calling the normal `cancelAnimationFrame` function.
     */
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame((...args) => {
        if (this.isValid) callback(...args);
      });
      this.onInvalidated(() => cancelAnimationFrame(id));
      return id;
    }
    /**
     * Wrapper around `window.requestIdleCallback` that automatically cancels the request when
     * invalidated.
     *
     * Callbacks can be canceled by calling the normal `cancelIdleCallback` function.
     */
    requestIdleCallback(callback, options) {
      const id = requestIdleCallback((...args) => {
        if (!this.signal.aborted) callback(...args);
      }, options);
      this.onInvalidated(() => cancelIdleCallback(id));
      return id;
    }
    addEventListener(target, type, handler, options) {
      if (type === "wxt:locationchange") {
        if (this.isValid) this.locationWatcher.run();
      }
      target.addEventListener?.(
        type.startsWith("wxt:") ? getUniqueEventName(type) : type,
        handler,
        {
          ...options,
          signal: this.signal
        }
      );
    }
    /**
     * @internal
     * Abort the abort controller and execute all `onInvalidated` listeners.
     */
    notifyInvalidated() {
      this.abort("Content script context invalidated");
      logger$1.debug(
        `Content script "${this.contentScriptName}" context invalidated`
      );
    }
    stopOldScripts() {
      window.postMessage(
        {
          type: ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
          contentScriptName: this.contentScriptName,
          messageId: Math.random().toString(36).slice(2)
        },
        "*"
      );
    }
    verifyScriptStartedEvent(event) {
      const isScriptStartedEvent = event.data?.type === ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE;
      const isSameContentScript = event.data?.contentScriptName === this.contentScriptName;
      const isNotDuplicate = !this.receivedMessageIds.has(event.data?.messageId);
      return isScriptStartedEvent && isSameContentScript && isNotDuplicate;
    }
    listenForNewerScripts(options) {
      let isFirst = true;
      const cb = (event) => {
        if (this.verifyScriptStartedEvent(event)) {
          this.receivedMessageIds.add(event.data.messageId);
          const wasFirst = isFirst;
          isFirst = false;
          if (wasFirst && options?.ignoreFirstEvent) return;
          this.notifyInvalidated();
        }
      };
      addEventListener("message", cb);
      this.onInvalidated(() => removeEventListener("message", cb));
    }
  }
  function initPlugins() {
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  const result = (async () => {
    try {
      initPlugins();
      const { main, ...options } = definition;
      const ctx = new ContentScriptContext("content", options);
      return await main(ctx);
    } catch (err) {
      logger.error(
        `The content script "${"content"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vLi4vbGliL3N0b3JhZ2VBcGkudHMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvY29udGVudC1zY3JpcHQtY29udGV4dC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNvbnRlbnRTY3JpcHQoZGVmaW5pdGlvbikge1xuICByZXR1cm4gZGVmaW5pdGlvbjtcbn1cbiIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgX2Jyb3dzZXIgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBfYnJvd3NlcjtcbmV4cG9ydCB7fTtcbiIsIi8vIFN0b3JhZ2UgQVBJIHdyYXBwZXIgLSBzZW5kcyBtZXNzYWdlcyB0byBiYWNrZ3JvdW5kIHNjcmlwdFxuLy8gVXNlIHRoaXMgZnJvbSBjb250ZW50IHNjcmlwdHMgYW5kIHBvcHVwIGluc3RlYWQgb2YgZGlyZWN0IHN0b3JhZ2UgYWNjZXNzXG5cbmltcG9ydCB0eXBlIHsgU2F2ZWRTdG9yeSB9IGZyb20gJy4vc3RvcmFnZSc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlSXRlbShpdGVtOiBPbWl0PFNhdmVkU3RvcnksICdzYXZlZEF0JyB8ICdsYXN0VmlzaXQnIHwgJ2NoZWNrcG9pbnRDb21tZW50SWQnIHwgJ2NoZWNrcG9pbnRUaW1lc3RhbXAnPik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdTQVZFX0lURU0nLCBpdGVtIH0pO1xuICBpZiAoIXJlc3BvbnNlLnN1Y2Nlc3MpIHRocm93IG5ldyBFcnJvcihyZXNwb25zZS5lcnJvcik7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZW1vdmVJdGVtKHN0b3J5SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdSRU1PVkVfSVRFTScsIHN0b3J5SWQgfSk7XG4gIGlmICghcmVzcG9uc2Uuc3VjY2VzcykgdGhyb3cgbmV3IEVycm9yKHJlc3BvbnNlLmVycm9yKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEl0ZW1zKCk6IFByb21pc2U8U2F2ZWRTdG9yeVtdPiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ0dFVF9JVEVNUycgfSk7XG4gIGlmICghcmVzcG9uc2Uuc3VjY2VzcykgdGhyb3cgbmV3IEVycm9yKHJlc3BvbnNlLmVycm9yKTtcbiAgcmV0dXJuIHJlc3BvbnNlLml0ZW1zO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0SXRlbShzdG9yeUlkOiBzdHJpbmcpOiBQcm9taXNlPFNhdmVkU3RvcnkgfCB1bmRlZmluZWQ+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBicm93c2VyLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyB0eXBlOiAnR0VUX0lURU0nLCBzdG9yeUlkIH0pO1xuICBpZiAoIXJlc3BvbnNlLnN1Y2Nlc3MpIHRocm93IG5ldyBFcnJvcihyZXNwb25zZS5lcnJvcik7XG4gIHJldHVybiByZXNwb25zZS5pdGVtO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaXNJdGVtU2F2ZWQoc3RvcnlJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ0lTX1NBVkVEJywgc3RvcnlJZCB9KTtcbiAgaWYgKCFyZXNwb25zZS5zdWNjZXNzKSB0aHJvdyBuZXcgRXJyb3IocmVzcG9uc2UuZXJyb3IpO1xuICByZXR1cm4gcmVzcG9uc2Uuc2F2ZWQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVDaGVja3BvaW50KFxuICBzdG9yeUlkOiBzdHJpbmcsXG4gIGNoZWNrcG9pbnRDb21tZW50SWQ6IHN0cmluZyxcbiAgdG90YWxDb21tZW50czogbnVtYmVyXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBicm93c2VyLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyBcbiAgICB0eXBlOiAnVVBEQVRFX0NIRUNLUE9JTlQnLCBcbiAgICBzdG9yeUlkLCBcbiAgICBjaGVja3BvaW50Q29tbWVudElkLCBcbiAgICB0b3RhbENvbW1lbnRzIFxuICB9KTtcbiAgaWYgKCFyZXNwb25zZS5zdWNjZXNzKSB0aHJvdyBuZXcgRXJyb3IocmVzcG9uc2UuZXJyb3IpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0UHJvZ3Jlc3Moc3RvcnlJZDogc3RyaW5nKTogUHJvbWlzZTx7XG4gIGNoZWNrcG9pbnRDb21tZW50SWQ6IHN0cmluZyB8IG51bGw7XG4gIGNoZWNrcG9pbnRUaW1lc3RhbXA6IG51bWJlciB8IG51bGw7XG4gIHRvdGFsQ29tbWVudHM6IG51bWJlcjtcbn0gfCBudWxsPiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ0dFVF9QUk9HUkVTUycsIHN0b3J5SWQgfSk7XG4gIGlmICghcmVzcG9uc2Uuc3VjY2VzcykgdGhyb3cgbmV3IEVycm9yKHJlc3BvbnNlLmVycm9yKTtcbiAgcmV0dXJuIHJlc3BvbnNlLnByb2dyZXNzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhwb3J0RGF0YSgpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGJyb3dzZXIucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdFWFBPUlRfREFUQScgfSk7XG4gIGlmICghcmVzcG9uc2Uuc3VjY2VzcykgdGhyb3cgbmV3IEVycm9yKHJlc3BvbnNlLmVycm9yKTtcbiAgcmV0dXJuIHJlc3BvbnNlLmRhdGE7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbXBvcnREYXRhKGpzb246IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYnJvd3Nlci5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ0lNUE9SVF9EQVRBJywganNvbiB9KTtcbiAgaWYgKCFyZXNwb25zZS5zdWNjZXNzKSB0aHJvdyBuZXcgRXJyb3IocmVzcG9uc2UuZXJyb3IpO1xuICByZXR1cm4gcmVzcG9uc2UuY291bnQ7XG59XG5cbmV4cG9ydCB0eXBlIHsgU2F2ZWRTdG9yeSB9O1xuIiwiaW1wb3J0IHsgc2F2ZUl0ZW0sIHJlbW92ZUl0ZW0sIGlzSXRlbVNhdmVkLCBnZXRJdGVtLCB1cGRhdGVDaGVja3BvaW50LCBnZXRQcm9ncmVzcyB9IGZyb20gJ0AvbGliL3N0b3JhZ2VBcGknO1xuaW1wb3J0ICcuL2NvbnRlbnQtc3R5bGVzLmNzcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbnRlbnRTY3JpcHQoe1xuICBtYXRjaGVzOiBbJyo6Ly9uZXdzLnljb21iaW5hdG9yLmNvbS8qJ10sXG4gIG1haW4oKSB7XG4gICAgY29uc3QgaXNJdGVtUGFnZSA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSA9PT0gJy9pdGVtJztcbiAgICBjb25zdCBzdG9yeUlkID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ2lkJyk7XG5cbiAgICBpZiAoaXNJdGVtUGFnZSAmJiBzdG9yeUlkKSB7XG4gICAgICBpbml0SXRlbVBhZ2Uoc3RvcnlJZCk7XG4gICAgICBpbml0S2V5Ym9hcmRTaG9ydGN1dHMoc3RvcnlJZCk7XG4gICAgfVxuXG4gICAgLy8gQWRkIGNvbGxhcHNlIGJ1dHRvbnMgdG8gYWxsIGNvbW1lbnRzIG9uIGFueSBpdGVtIHBhZ2VcbiAgICBpZiAoaXNJdGVtUGFnZSkge1xuICAgICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdobi1sYXRlci1pdGVtLXBhZ2UnKTtcbiAgICAgIGluaXRDb2xsYXBzZUJ1dHRvbnMoKTtcbiAgICB9XG5cbiAgICBpbml0U2F2ZUxpbmtzKCk7XG5cbiAgICAvLyBIYW5kbGUgYmFjay9mb3J3YXJkIG5hdmlnYXRpb24gKGJmY2FjaGUgcmVzdG9yYXRpb24pXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BhZ2VzaG93JywgKGV2ZW50KSA9PiB7XG4gICAgICBpZiAoZXZlbnQucGVyc2lzdGVkKSB7XG4gICAgICAgIC8vIFBhZ2Ugd2FzIHJlc3RvcmVkIGZyb20gYmZjYWNoZSAtIHJlZnJlc2ggc2F2ZSBsaW5rIHN0YXRlc1xuICAgICAgICByZWZyZXNoU2F2ZUxpbmtTdGF0ZXMoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU0FWRSBMSU5LUyAoSE4gbmF0aXZlIHN0eWxlKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuYXN5bmMgZnVuY3Rpb24gaW5pdFNhdmVMaW5rcygpIHtcbiAgLy8gRmluZCBhbGwgc3Rvcnkgcm93cyBvbiB0aGUgcGFnZSAobGlzdGluZyBwYWdlcylcbiAgY29uc3Qgc3RvcnlSb3dzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MVGFibGVSb3dFbGVtZW50PigndHIuYXRoaW5nOm5vdCguY29tdHIpJyk7XG5cbiAgY29uc3Qgc3RvcnlJZCA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdpZCcpO1xuICBjb25zdCBpc0l0ZW1QYWdlID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lID09PSAnL2l0ZW0nO1xuXG4gIGZvciAoY29uc3Qgcm93IG9mIHN0b3J5Um93cykge1xuICAgIGNvbnN0IGlkID0gcm93LmlkO1xuICAgIGlmICghaWQpIGNvbnRpbnVlO1xuXG4gICAgLy8gU2tpcCB0aGUgbWFpbiBzdG9yeSBvbiBhbiBpdGVtIHBhZ2UgYmVjYXVzZSBpbml0SXRlbVBhZ2UgaGFuZGxlcyBpdCBzcGVjaWZpY2FsbHlcbiAgICBpZiAoaXNJdGVtUGFnZSAmJiBpZCA9PT0gc3RvcnlJZCkgY29udGludWU7XG5cbiAgICBjb25zdCBzdWJ0ZXh0Um93ID0gcm93Lm5leHRFbGVtZW50U2libGluZztcbiAgICBjb25zdCBzdWJ0ZXh0ID0gc3VidGV4dFJvdz8ucXVlcnlTZWxlY3RvcigndGQuc3VidGV4dCcpO1xuICAgIGlmICghc3VidGV4dCkgY29udGludWU7XG5cbiAgICAvLyBGaW5kIHRoZSBjb21tZW50cyBsaW5rXG4gICAgY29uc3QgbGlua3MgPSBzdWJ0ZXh0LnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKTtcbiAgICBjb25zdCBjb21tZW50c0xpbmsgPSBBcnJheS5mcm9tKGxpbmtzKS5maW5kKGEgPT4gYS5ocmVmLmluY2x1ZGVzKCdpdGVtP2lkPScpKTtcbiAgICBpZiAoIWNvbW1lbnRzTGluaykgY29udGludWU7XG5cbiAgICAvLyBDcmVhdGUgc2F2ZSBsaW5rXG4gICAgY29uc3Qgc2F2ZUxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gICAgc2F2ZUxpbmsuaHJlZiA9ICcjJztcbiAgICBzYXZlTGluay5jbGFzc05hbWUgPSAnaG4tbGF0ZXItc2F2ZS1saW5rJztcbiAgICBzYXZlTGluay5kYXRhc2V0LnN0b3J5SWQgPSBpZDtcblxuICAgIGNvbnN0IGlzU2F2ZWQgPSBhd2FpdCBpc0l0ZW1TYXZlZChpZCk7XG4gICAgdXBkYXRlU2F2ZUxpbmtTdGF0ZShzYXZlTGluaywgaXNTYXZlZCk7XG5cbiAgICBzYXZlTGluay5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBhd2FpdCB0b2dnbGVTYXZlRnJvbUxpc3Rpbmcoc2F2ZUxpbmssIHJvdyk7XG4gICAgfSk7XG5cbiAgICAvLyBXcmFwIGluIGEgY29udGFpbmVyIHNvIHNlcGFyYXRvciArIGxpbmsgY2FuIGJlIGhpZGRlbi9zaG93biB0b2dldGhlclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICBjb250YWluZXIuY2xhc3NOYW1lID0gJ2huLWxhdGVyLXNhdmUtY29udGFpbmVyJztcbiAgICBjb250YWluZXIuaW5uZXJIVE1MID0gJyB8ICc7XG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHNhdmVMaW5rKTtcbiAgICBzdWJ0ZXh0LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlU2F2ZUxpbmtTdGF0ZShsaW5rOiBIVE1MQW5jaG9yRWxlbWVudCwgaXNTYXZlZDogYm9vbGVhbikge1xuICBsaW5rLnRleHRDb250ZW50ID0gaXNTYXZlZCA/ICdzYXZlZCDinJMnIDogJ3NhdmUnO1xuICBsaW5rLmNsYXNzTGlzdC50b2dnbGUoJ3NhdmVkJywgaXNTYXZlZCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hTYXZlTGlua1N0YXRlcygpIHtcbiAgLy8gRmluZCBhbGwgc2F2ZSBsaW5rcyBhbmQgdXBkYXRlIHRoZWlyIHN0YXRlc1xuICBjb25zdCBzYXZlTGlua3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxBbmNob3JFbGVtZW50PignLmhuLWxhdGVyLXNhdmUtbGluaycpO1xuICBcbiAgZm9yIChjb25zdCBsaW5rIG9mIHNhdmVMaW5rcykge1xuICAgIGNvbnN0IHN0b3J5SWQgPSBsaW5rLmRhdGFzZXQuc3RvcnlJZDtcbiAgICBpZiAoIXN0b3J5SWQpIGNvbnRpbnVlO1xuICAgIFxuICAgIGNvbnN0IGlzU2F2ZWQgPSBhd2FpdCBpc0l0ZW1TYXZlZChzdG9yeUlkKTtcbiAgICB1cGRhdGVTYXZlTGlua1N0YXRlKGxpbmssIGlzU2F2ZWQpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRvZ2dsZVNhdmVGcm9tTGlzdGluZyhsaW5rOiBIVE1MQW5jaG9yRWxlbWVudCwgcm93OiBIVE1MVGFibGVSb3dFbGVtZW50KSB7XG4gIGNvbnN0IHN0b3J5SWQgPSBsaW5rLmRhdGFzZXQuc3RvcnlJZCE7XG4gIGNvbnN0IGlzU2F2ZWQgPSBsaW5rLmNsYXNzTGlzdC5jb250YWlucygnc2F2ZWQnKTtcblxuICBpZiAoaXNTYXZlZCkge1xuICAgIGF3YWl0IHJlbW92ZUl0ZW0oc3RvcnlJZCk7XG4gICAgdXBkYXRlU2F2ZUxpbmtTdGF0ZShsaW5rLCBmYWxzZSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgdGl0bGVDZWxsID0gcm93LnF1ZXJ5U2VsZWN0b3IoJ3RkLnRpdGxlOmxhc3QtY2hpbGQnKTtcbiAgICBjb25zdCB0aXRsZUxpbmsgPSB0aXRsZUNlbGw/LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhLnRpdGxlbGluZSA+IGEsIHNwYW4udGl0bGVsaW5lID4gYScpO1xuICAgIGlmICghdGl0bGVMaW5rKSByZXR1cm47XG5cbiAgICBjb25zdCB0aXRsZSA9IHRpdGxlTGluay50ZXh0Q29udGVudCB8fCAnVW50aXRsZWQnO1xuICAgIGNvbnN0IHVybCA9IHRpdGxlTGluay5ocmVmO1xuICAgIGNvbnN0IGhuVXJsID0gYGh0dHBzOi8vbmV3cy55Y29tYmluYXRvci5jb20vaXRlbT9pZD0ke3N0b3J5SWR9YDtcblxuICAgIC8vIEdldCBjb21tZW50IGNvdW50IGZyb20gc3VidGV4dFxuICAgIGNvbnN0IHN1YnRleHRSb3cgPSByb3cubmV4dEVsZW1lbnRTaWJsaW5nO1xuICAgIGNvbnN0IGNvbW1lbnRMaW5rID0gc3VidGV4dFJvdz8ucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJ2FbaHJlZio9XCJpdGVtP2lkPVwiXScpO1xuICAgIGNvbnN0IGNvbW1lbnRUZXh0ID0gY29tbWVudExpbms/LnRleHRDb250ZW50IHx8ICcnO1xuICAgIGNvbnN0IGNvbW1lbnRNYXRjaCA9IGNvbW1lbnRUZXh0Lm1hdGNoKC8oXFxkKylcXHMqY29tbWVudC8pO1xuICAgIGNvbnN0IHRvdGFsQ29tbWVudHMgPSBjb21tZW50TWF0Y2ggPyBwYXJzZUludChjb21tZW50TWF0Y2hbMV0sIDEwKSA6IDA7XG5cbiAgICBhd2FpdCBzYXZlSXRlbSh7XG4gICAgICBpZDogc3RvcnlJZCxcbiAgICAgIHRpdGxlLFxuICAgICAgdXJsLFxuICAgICAgaG5VcmwsXG4gICAgICB0b3RhbENvbW1lbnRzLFxuICAgIH0pO1xuICAgIHVwZGF0ZVNhdmVMaW5rU3RhdGUobGluaywgdHJ1ZSk7XG4gIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIElURU0gUEFHRSAoY29tbWVudHMgcGFnZSlcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmFzeW5jIGZ1bmN0aW9uIGluaXRJdGVtUGFnZShzdG9yeUlkOiBzdHJpbmcpIHtcbiAgLy8gQWRkIHNhdmUgbGluayB0byBpdGVtIHBhZ2VcbiAgYXdhaXQgYWRkSXRlbVBhZ2VTYXZlTGluayhzdG9yeUlkKTtcblxuICAvLyBDaGVjayBpZiB0aGlzIHN0b3J5IGlzIHNhdmVkXG4gIGNvbnN0IHN0b3J5RGF0YSA9IGF3YWl0IGdldEl0ZW0oc3RvcnlJZCk7XG4gIGlmIChzdG9yeURhdGEpIHtcbiAgICBpbml0Q29tbWVudFRyYWNraW5nKHN0b3J5SWQsIHN0b3J5RGF0YS5jaGVja3BvaW50VGltZXN0YW1wKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBhZGRJdGVtUGFnZVNhdmVMaW5rKHN0b3J5SWQ6IHN0cmluZykge1xuICBjb25zdCBzdWJ0ZXh0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcigndGQuc3VidGV4dCcpO1xuICBpZiAoIXN1YnRleHQpIHJldHVybjtcblxuICBjb25zdCBsaW5rcyA9IHN1YnRleHQucXVlcnlTZWxlY3RvckFsbCgnYScpO1xuICBjb25zdCBsYXN0TGluayA9IGxpbmtzW2xpbmtzLmxlbmd0aCAtIDFdO1xuICBpZiAoIWxhc3RMaW5rKSByZXR1cm47XG5cbiAgY29uc3Qgc2F2ZUxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG4gIHNhdmVMaW5rLmhyZWYgPSAnIyc7XG4gIHNhdmVMaW5rLmNsYXNzTmFtZSA9ICdobi1sYXRlci1zYXZlLWxpbmsnO1xuICBzYXZlTGluay5kYXRhc2V0LnN0b3J5SWQgPSBzdG9yeUlkO1xuXG4gIGNvbnN0IGlzU2F2ZWQgPSBhd2FpdCBpc0l0ZW1TYXZlZChzdG9yeUlkKTtcbiAgdXBkYXRlU2F2ZUxpbmtTdGF0ZShzYXZlTGluaywgaXNTYXZlZCk7XG5cbiAgc2F2ZUxpbmsuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBhd2FpdCB0b2dnbGVTYXZlRnJvbUl0ZW1QYWdlKHNhdmVMaW5rLCBzdG9yeUlkKTtcbiAgfSk7XG5cbiAgY29uc3Qgc2VwYXJhdG9yID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyB8ICcpO1xuICBsYXN0TGluay5hZnRlcihzZXBhcmF0b3IsIHNhdmVMaW5rKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdG9nZ2xlU2F2ZUZyb21JdGVtUGFnZShsaW5rOiBIVE1MQW5jaG9yRWxlbWVudCwgc3RvcnlJZDogc3RyaW5nKSB7XG4gIGNvbnN0IGlzU2F2ZWQgPSBsaW5rLmNsYXNzTGlzdC5jb250YWlucygnc2F2ZWQnKTtcblxuICBpZiAoaXNTYXZlZCkge1xuICAgIGF3YWl0IHJlbW92ZUl0ZW0oc3RvcnlJZCk7XG4gICAgdXBkYXRlU2F2ZUxpbmtTdGF0ZShsaW5rLCBmYWxzZSk7XG4gICAgcmVtb3ZlVHJhY2tpbmdVSSgpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHRpdGxlRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcudGl0bGVsaW5lID4gYSwgLnN0b3J5bGluaycpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuICAgIGNvbnN0IHRpdGxlID0gdGl0bGVFbD8udGV4dENvbnRlbnQgfHwgJ1VudGl0bGVkJztcbiAgICBjb25zdCB1cmwgPSB0aXRsZUVsPy5ocmVmIHx8IHdpbmRvdy5sb2NhdGlvbi5ocmVmO1xuICAgIGNvbnN0IGhuVXJsID0gd2luZG93LmxvY2F0aW9uLmhyZWY7XG5cbiAgICBjb25zdCBjb21tZW50cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTFRhYmxlUm93RWxlbWVudD4oJ3RyLmF0aGluZy5jb210cicpO1xuICAgIGNvbnN0IHRvdGFsQ29tbWVudHMgPSBjb21tZW50cy5sZW5ndGg7XG5cbiAgICBhd2FpdCBzYXZlSXRlbSh7XG4gICAgICBpZDogc3RvcnlJZCxcbiAgICAgIHRpdGxlLFxuICAgICAgdXJsLFxuICAgICAgaG5VcmwsXG4gICAgICB0b3RhbENvbW1lbnRzLFxuICAgIH0pO1xuICAgIHVwZGF0ZVNhdmVMaW5rU3RhdGUobGluaywgdHJ1ZSk7XG5cbiAgICAvLyBTdGFydCB0cmFja2luZyBpbW1lZGlhdGVseSAobm8gcmVmcmVzaCBuZWVkZWQpXG4gICAgaW5pdENvbW1lbnRUcmFja2luZyhzdG9yeUlkLCBudWxsKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZW1vdmVUcmFja2luZ1VJKCkge1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuaG4tbGF0ZXItc2Nyb2xsYmFyJyk/LnJlbW92ZSgpO1xuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuaG4tbGF0ZXItYnV0dG9ucycpPy5yZW1vdmUoKTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmhuLWxhdGVyLW5ldy1sYWJlbCcpLmZvckVhY2goZWwgPT4gZWwucmVtb3ZlKCkpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ09NTUVOVCBUUkFDS0lOR1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuYXN5bmMgZnVuY3Rpb24gaW5pdENvbW1lbnRUcmFja2luZyhzdG9yeUlkOiBzdHJpbmcsIGNoZWNrcG9pbnRUaW1lc3RhbXA6IG51bWJlciB8IG51bGwpIHtcbiAgY29uc3QgY29tbWVudHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxUYWJsZVJvd0VsZW1lbnQ+KCd0ci5hdGhpbmcuY29tdHInKTtcbiAgaWYgKGNvbW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIC8vIEdldCBleGlzdGluZyBwcm9ncmVzc1xuICBjb25zdCBwcm9ncmVzcyA9IGF3YWl0IGdldFByb2dyZXNzKHN0b3J5SWQpO1xuICBjb25zdCBjaGVja3BvaW50SWQgPSBwcm9ncmVzcz8uY2hlY2twb2ludENvbW1lbnRJZCA/PyBudWxsO1xuXG4gIC8vIE1hcmsgbmV3IGNvbW1lbnRzIChwb3N0ZWQgYWZ0ZXIgbGFzdCBjaGVja3BvaW50KVxuICBpZiAoY2hlY2twb2ludFRpbWVzdGFtcCkge1xuICAgIG1hcmtOZXdDb21tZW50cyhjb21tZW50cywgY2hlY2twb2ludFRpbWVzdGFtcCk7XG4gIH1cblxuICAvLyBDcmVhdGUgVUkgZWxlbWVudHNcbiAgY3JlYXRlU2Nyb2xsYmFyTWFya2Vycyhjb21tZW50cywgY2hlY2twb2ludElkKTtcbiAgY3JlYXRlRmxvYXRpbmdCdXR0b25zKHN0b3J5SWQsIGNvbW1lbnRzKTtcblxuICAvLyBIYW5kbGUgI2huLWxhdGVyLWNvbnRpbnVlIGluIFVSTCAoZnJvbSBwb3B1cCBcIkNvbnRpbnVlXCIgYnV0dG9uKVxuICBpZiAod2luZG93LmxvY2F0aW9uLmhhc2ggPT09ICcjaG4tbGF0ZXItY29udGludWUnICYmIGNoZWNrcG9pbnRJZCkge1xuICAgIGNvbnN0IGNoZWNrcG9pbnRFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNoZWNrcG9pbnRJZCk7XG4gICAgaWYgKGNoZWNrcG9pbnRFbCkge1xuICAgICAgY2hlY2twb2ludEVsLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ3N0YXJ0JyB9KTtcbiAgICAgIGhpc3RvcnkucmVwbGFjZVN0YXRlKG51bGwsICcnLCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyB3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbWFya05ld0NvbW1lbnRzKGNvbW1lbnRzOiBOb2RlTGlzdE9mPEhUTUxUYWJsZVJvd0VsZW1lbnQ+LCBjaGVja3BvaW50VGltZXN0YW1wOiBudW1iZXIpIHtcbiAgY29uc29sZS5sb2coJ1tITi1MYXRlcl0gbWFya05ld0NvbW1lbnRzIGNhbGxlZCB3aXRoIGNoZWNrcG9pbnRUaW1lc3RhbXA6JywgY2hlY2twb2ludFRpbWVzdGFtcCwgbmV3IERhdGUoY2hlY2twb2ludFRpbWVzdGFtcCkudG9JU09TdHJpbmcoKSk7XG4gIFxuICBsZXQgbmV3Q291bnQgPSAwO1xuICBjb21tZW50cy5mb3JFYWNoKChjb21tZW50LCBpbmRleCkgPT4ge1xuICAgIC8vIFRyeSBtdWx0aXBsZSBzZWxlY3RvcnMgZm9yIHRoZSBhZ2UgZWxlbWVudFxuICAgIGNvbnN0IGFnZVNwYW4gPSBjb21tZW50LnF1ZXJ5U2VsZWN0b3IoJy5hZ2UnKTtcbiAgICBjb25zdCBhZ2VMaW5rID0gY29tbWVudC5xdWVyeVNlbGVjdG9yKCcuYWdlIGEnKTtcbiAgICBcbiAgICBpZiAoIWFnZVNwYW4gJiYgIWFnZUxpbmspIHtcbiAgICAgIGlmIChpbmRleCA8IDMpIGNvbnNvbGUubG9nKGBbSE4tTGF0ZXJdIENvbW1lbnQgJHtjb21tZW50LmlkfTogTm8gLmFnZSBvciAuYWdlIGEgZm91bmRgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBUaGUgdGl0bGUgYXR0cmlidXRlIGNvdWxkIGJlIG9uOlxuICAgIC8vIDEuIFRoZSAuYWdlIHNwYW4gaXRzZWxmXG4gICAgLy8gMi4gVGhlIGEgbGluayBpbnNpZGUgLmFnZVxuICAgIC8vIDMuIEEgY2hpbGQgZWxlbWVudCBsaWtlIDx0aW1lPlxuICAgIGxldCB0aXRsZUF0dHIgPSBhZ2VTcGFuPy5nZXRBdHRyaWJ1dGUoJ3RpdGxlJykgfHwgXG4gICAgICAgICAgICAgICAgICAgIGFnZUxpbms/LmdldEF0dHJpYnV0ZSgndGl0bGUnKTtcbiAgICBcbiAgICAvLyBBbHNvIGNoZWNrIGZvciBhIDx0aW1lPiBlbGVtZW50IHdpdGggZGF0ZXRpbWUgYXR0cmlidXRlXG4gICAgY29uc3QgdGltZUVsID0gY29tbWVudC5xdWVyeVNlbGVjdG9yKCcuYWdlIHRpbWUnKTtcbiAgICBpZiAoIXRpdGxlQXR0ciAmJiB0aW1lRWwpIHtcbiAgICAgIHRpdGxlQXR0ciA9IHRpbWVFbC5nZXRBdHRyaWJ1dGUoJ3RpdGxlJykgfHwgdGltZUVsLmdldEF0dHJpYnV0ZSgnZGF0ZXRpbWUnKTtcbiAgICB9XG5cbiAgICAvLyBEZWJ1ZyBmaXJzdCA1IGNvbW1lbnRzXG4gICAgaWYgKGluZGV4IDwgNSkge1xuICAgICAgY29uc29sZS5sb2coYFtITi1MYXRlcl0gQ29tbWVudCAke2NvbW1lbnQuaWR9OiBhZ2VTcGFuPSR7ISFhZ2VTcGFufSwgYWdlTGluaz0keyEhYWdlTGlua30sIHRpdGxlQXR0cj1cIiR7dGl0bGVBdHRyfVwiYCk7XG4gICAgfVxuXG4gICAgaWYgKCF0aXRsZUF0dHIpIHJldHVybjtcblxuICAgIC8vIFBhcnNlIHRpbWVzdGFtcCAtIEhOIGZvcm1hdCBpcyBcIjIwMjUtMTItMThUMTg6MzE6MzAgMTc2NjA4MjY5MFwiIChJU08gKyBVbml4KVxuICAgIC8vIFNwbGl0IG9uIHNwYWNlIGFuZCB1c2UgdGhlIElTTyBkYXRlIHBhcnRcbiAgICBjb25zdCBpc29EYXRlU3RyID0gdGl0bGVBdHRyLnNwbGl0KCcgJylbMF07XG4gICAgY29uc3QgY29tbWVudFRpbWUgPSBuZXcgRGF0ZShpc29EYXRlU3RyKS5nZXRUaW1lKCk7XG4gICAgXG4gICAgaWYgKGlzTmFOKGNvbW1lbnRUaW1lKSkge1xuICAgICAgaWYgKGluZGV4IDwgMykgY29uc29sZS5sb2coYFtITi1MYXRlcl0gQ29tbWVudCAke2NvbW1lbnQuaWR9OiBGYWlsZWQgdG8gcGFyc2UgdGltZXN0YW1wIFwiJHtpc29EYXRlU3RyfVwiIGZyb20gXCIke3RpdGxlQXR0cn1cImApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBcbiAgICBpZiAoaW5kZXggPCA1KSB7XG4gICAgICBjb25zb2xlLmxvZyhgW0hOLUxhdGVyXSBDb21tZW50ICR7Y29tbWVudC5pZH06IGNvbW1lbnRUaW1lPSR7Y29tbWVudFRpbWV9ICgke25ldyBEYXRlKGNvbW1lbnRUaW1lKS50b0lTT1N0cmluZygpfSksIGlzTmV3PSR7Y29tbWVudFRpbWUgPiBjaGVja3BvaW50VGltZXN0YW1wfWApO1xuICAgIH1cbiAgICBcbiAgICBpZiAoY29tbWVudFRpbWUgPiBjaGVja3BvaW50VGltZXN0YW1wKSB7XG4gICAgICAvLyBUaGlzIGNvbW1lbnQgaXMgbmV3IHNpbmNlIGxhc3QgdmlzaXRcbiAgICAgIG5ld0NvdW50Kys7XG4gICAgICBjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICAgIGxhYmVsLmNsYXNzTmFtZSA9ICdobi1sYXRlci1uZXctbGFiZWwnO1xuICAgICAgbGFiZWwudGV4dENvbnRlbnQgPSAnW05FV10nO1xuICAgICAgXG4gICAgICAvLyBJbnNlcnQgYWZ0ZXIgdGhlIGFnZSBlbGVtZW50XG4gICAgICBjb25zdCBpbnNlcnRBZnRlciA9IGFnZUxpbmsgfHwgYWdlU3BhbjtcbiAgICAgIGluc2VydEFmdGVyPy5wYXJlbnRFbGVtZW50Py5pbnNlcnRCZWZvcmUobGFiZWwsIGluc2VydEFmdGVyLm5leHRTaWJsaW5nKTtcbiAgICAgIGNvbW1lbnQuY2xhc3NMaXN0LmFkZCgnaG4tbGF0ZXItbmV3Jyk7XG4gICAgfVxuICB9KTtcbiAgXG4gIGNvbnNvbGUubG9nKGBbSE4tTGF0ZXJdIFRvdGFsIG5ldyBjb21tZW50cyBmb3VuZDogJHtuZXdDb3VudH1gKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNDUk9MTEJBUiBNQVJLRVJTIChEaXNjb3Vyc2Utc3R5bGUpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5sZXQgbWFya2Vyc0NvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmNvbnN0IG1hcmtlck1hcCA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRGl2RWxlbWVudD4oKTtcblxuZnVuY3Rpb24gY3JlYXRlU2Nyb2xsYmFyTWFya2VycyhcbiAgY29tbWVudHM6IE5vZGVMaXN0T2Y8SFRNTFRhYmxlUm93RWxlbWVudD4sXG4gIGNoZWNrcG9pbnRJZDogc3RyaW5nIHwgbnVsbFxuKSB7XG4gIG1hcmtlcnNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgbWFya2Vyc0NvbnRhaW5lci5jbGFzc05hbWUgPSAnaG4tbGF0ZXItc2Nyb2xsYmFyJztcblxuICAvLyBBZGQgdmlld3BvcnQgaW5kaWNhdG9yXG4gIGNvbnN0IHZpZXdwb3J0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHZpZXdwb3J0LmNsYXNzTmFtZSA9ICdobi1sYXRlci12aWV3cG9ydCc7XG4gIG1hcmtlcnNDb250YWluZXIuYXBwZW5kQ2hpbGQodmlld3BvcnQpO1xuXG4gIGNvbnN0IGRvY0hlaWdodCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxIZWlnaHQ7XG4gIGxldCBmb3VuZENoZWNrcG9pbnQgPSBjaGVja3BvaW50SWQgPT09IG51bGw7IC8vIElmIG5vIGNoZWNrcG9pbnQsIGFsbCBhcmUgXCJ1bnJlYWRcIlxuXG4gIGNvbW1lbnRzLmZvckVhY2goKGNvbW1lbnQpID0+IHtcbiAgICBjb25zdCBjb21tZW50SWQgPSBjb21tZW50LmlkO1xuICAgIGNvbnN0IHJlY3QgPSBjb21tZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHRvcCA9IChyZWN0LnRvcCArIHdpbmRvdy5zY3JvbGxZKSAvIGRvY0hlaWdodDtcblxuICAgIGNvbnN0IG1hcmtlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1hcmtlci5jbGFzc05hbWUgPSAnaG4tbGF0ZXItbWFya2VyJztcbiAgICBtYXJrZXIuZGF0YXNldC5jb21tZW50SWQgPSBjb21tZW50SWQ7XG5cbiAgICBpZiAoY29tbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2huLWxhdGVyLW5ldycpKSB7XG4gICAgICBtYXJrZXIuY2xhc3NMaXN0LmFkZCgnbmV3Jyk7XG4gICAgfSBlbHNlIGlmICghZm91bmRDaGVja3BvaW50KSB7XG4gICAgICBtYXJrZXIuY2xhc3NMaXN0LmFkZCgncmVhZCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBtYXJrZXIuY2xhc3NMaXN0LmFkZCgndW5yZWFkJyk7XG4gICAgfVxuXG4gICAgaWYgKGNvbW1lbnRJZCA9PT0gY2hlY2twb2ludElkKSB7XG4gICAgICBmb3VuZENoZWNrcG9pbnQgPSB0cnVlO1xuICAgIH1cblxuICAgIG1hcmtlci5zdHlsZS50b3AgPSBgJHt0b3AgKiAxMDB9JWA7XG4gICAgbWFya2VyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgY29tbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuICAgIH0pO1xuXG4gICAgbWFya2Vyc0NvbnRhaW5lciEuYXBwZW5kQ2hpbGQobWFya2VyKTtcbiAgICBtYXJrZXJNYXAuc2V0KGNvbW1lbnRJZCwgbWFya2VyKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChtYXJrZXJzQ29udGFpbmVyKTtcblxuICAvLyBVcGRhdGUgdmlld3BvcnQgaW5kaWNhdG9yIG9uIHNjcm9sbFxuICBjb25zdCB1cGRhdGVWaWV3cG9ydCA9ICgpID0+IHtcbiAgICBjb25zdCBzY3JvbGxUb3AgPSB3aW5kb3cuc2Nyb2xsWTtcbiAgICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcbiAgICBjb25zdCBkb2NIZWlnaHQgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsSGVpZ2h0O1xuICAgIFxuICAgIHZpZXdwb3J0LnN0eWxlLnRvcCA9IGAkeyhzY3JvbGxUb3AgLyBkb2NIZWlnaHQpICogMTAwfSVgO1xuICAgIHZpZXdwb3J0LnN0eWxlLmhlaWdodCA9IGAkeyh2aWV3cG9ydEhlaWdodCAvIGRvY0hlaWdodCkgKiAxMDB9JWA7XG4gIH07XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Njcm9sbCcsIHVwZGF0ZVZpZXdwb3J0LCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gIHVwZGF0ZVZpZXdwb3J0KCk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGTE9BVElORyBCVVRUT05TXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBjcmVhdGVGbG9hdGluZ0J1dHRvbnMoc3RvcnlJZDogc3RyaW5nLCBjb21tZW50czogTm9kZUxpc3RPZjxIVE1MVGFibGVSb3dFbGVtZW50Pikge1xuICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgY29udGFpbmVyLmNsYXNzTmFtZSA9ICdobi1sYXRlci1idXR0b25zJztcblxuICAvLyBDaGVja3BvaW50IGJ1dHRvblxuICBjb25zdCBjaGVja3BvaW50QnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIGNoZWNrcG9pbnRCdG4uY2xhc3NOYW1lID0gJ2huLWxhdGVyLWJ0biBjaGVja3BvaW50JztcbiAgY2hlY2twb2ludEJ0bi5pbm5lckhUTUwgPSAn8J+TjSBDaGVja3BvaW50JztcbiAgY2hlY2twb2ludEJ0bi50aXRsZSA9ICdTYXZlIHJlYWRpbmcgcG9zaXRpb24nO1xuICBjaGVja3BvaW50QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc2V0Q2hlY2twb2ludChzdG9yeUlkLCBjb21tZW50cykpO1xuXG4gIC8vIE5leHQgVG9waWMgYnV0dG9uXG4gIGNvbnN0IG5leHRUb3BpY0J0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICBuZXh0VG9waWNCdG4uY2xhc3NOYW1lID0gJ2huLWxhdGVyLWJ0biBuZXh0LXRvcGljJztcbiAgbmV4dFRvcGljQnRuLmlubmVySFRNTCA9ICfij63vuI8gTmV4dCBUb3BpYyc7XG4gIG5leHRUb3BpY0J0bi50aXRsZSA9ICdKdW1wIHRvIG5leHQgdG9wLWxldmVsIGNvbW1lbnQnO1xuICBuZXh0VG9waWNCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBzY3JvbGxUb05leHRUb3BpYyhjb21tZW50cykpO1xuXG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChjaGVja3BvaW50QnRuKTtcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKG5leHRUb3BpY0J0bik7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFBFUi1DT01NRU5UIENPTExBUFNFIEJVVFRPTlMgKEZpeGVkIE92ZXJsYXkpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5sZXQgY29sbGFwc2VPdmVybGF5OiBIVE1MRGl2RWxlbWVudCB8IG51bGwgPSBudWxsO1xuY29uc3QgY29sbGFwc2VCdG5NYXAgPSBuZXcgTWFwPHN0cmluZywgSFRNTEJ1dHRvbkVsZW1lbnQ+KCk7XG5cbmZ1bmN0aW9uIGluaXRDb2xsYXBzZUJ1dHRvbnMoKSB7XG4gIGNvbnN0IGNvbW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MVGFibGVSb3dFbGVtZW50PigndHIuYXRoaW5nLmNvbXRyJyk7XG4gIGlmIChjb21tZW50cy5sZW5ndGggPT09IDApIHJldHVybjtcbiAgXG4gIC8vIENyZWF0ZSBmaXhlZCBvdmVybGF5IGNvbnRhaW5lciAocG9pbnRlci1ldmVudHM6IG5vbmUgc28gaXQgZG9lc24ndCBibG9jayBjbGlja3MpXG4gIGNvbGxhcHNlT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBjb2xsYXBzZU92ZXJsYXkuY2xhc3NOYW1lID0gJ2huLWxhdGVyLWNvbGxhcHNlLW92ZXJsYXknO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbGxhcHNlT3ZlcmxheSk7XG4gIFxuICBjb21tZW50cy5mb3JFYWNoKChjb21tZW50KSA9PiB7XG4gICAgY29uc3QgY29tbWVudElkID0gY29tbWVudC5pZDtcbiAgICBpZiAoIWNvbW1lbnRJZCkgcmV0dXJuO1xuICAgIFxuICAgIC8vIENyZWF0ZSBjb2xsYXBzZSBidXR0b25cbiAgICBjb25zdCBjb2xsYXBzZUJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGNvbGxhcHNlQnRuLmNsYXNzTmFtZSA9ICdobi1sYXRlci1jb2xsYXBzZS1idG4nO1xuICAgIGNvbGxhcHNlQnRuLnRleHRDb250ZW50ID0gJ+KWvCc7XG4gICAgY29sbGFwc2VCdG4udGl0bGUgPSAnQ29sbGFwc2UgdGhyZWFkJztcbiAgICBjb2xsYXBzZUJ0bi5kYXRhc2V0LmNvbW1lbnRJZCA9IGNvbW1lbnRJZDtcbiAgICBcbiAgICBjb2xsYXBzZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgXG4gICAgICAvLyBGaW5kIGFuZCBjbGljayBITidzIG5hdGl2ZSB0b2dnbGVcbiAgICAgIGNvbnN0IHRvZ2dsZUxpbmsgPSBjb21tZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCcudG9nZycpO1xuICAgICAgaWYgKHRvZ2dsZUxpbmspIHtcbiAgICAgICAgdG9nZ2xlTGluay5jbGljaygpO1xuICAgICAgICAvLyBVcGRhdGUgYnV0dG9uIGljb24gYmFzZWQgb24gY29sbGFwc2VkIHN0YXRlXG4gICAgICAgIGNvbnN0IGlzQ29sbGFwc2VkID0gdG9nZ2xlTGluay50ZXh0Q29udGVudD8uaW5jbHVkZXMoJysnKTtcbiAgICAgICAgY29sbGFwc2VCdG4udGV4dENvbnRlbnQgPSBpc0NvbGxhcHNlZCA/ICfilrInIDogJ+KWvCc7XG4gICAgICAgIFxuICAgICAgICAvLyBJbW1lZGlhdGVseSB1cGRhdGUgYWxsIGJ1dHRvbiBwb3NpdGlvbnMgYWZ0ZXIgY29sbGFwc2UvZXhwYW5kXG4gICAgICAgIC8vIFVzZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgdG8gZW5zdXJlIERPTSBoYXMgdXBkYXRlZFxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gdXBkYXRlQ29sbGFwc2VCdXR0b25Qb3NpdGlvbnMoKSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgY29sbGFwc2VPdmVybGF5IS5hcHBlbmRDaGlsZChjb2xsYXBzZUJ0bik7XG4gICAgY29sbGFwc2VCdG5NYXAuc2V0KGNvbW1lbnRJZCwgY29sbGFwc2VCdG4pO1xuICB9KTtcbiAgXG4gIC8vIFBvc2l0aW9uIGJ1dHRvbnMgYW5kIHVwZGF0ZSBvbiBzY3JvbGwvcmVzaXplXG4gIHVwZGF0ZUNvbGxhcHNlQnV0dG9uUG9zaXRpb25zKCk7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzY3JvbGwnLCB1cGRhdGVDb2xsYXBzZUJ1dHRvblBvc2l0aW9ucywgeyBwYXNzaXZlOiB0cnVlIH0pO1xuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdXBkYXRlQ29sbGFwc2VCdXR0b25Qb3NpdGlvbnMsIHsgcGFzc2l2ZTogdHJ1ZSB9KTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ29sbGFwc2VCdXR0b25Qb3NpdGlvbnMoKSB7XG4gIGlmICghY29sbGFwc2VPdmVybGF5KSByZXR1cm47XG4gIFxuICBjb25zdCB2aWV3cG9ydEhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcbiAgXG4gIC8vIEZpbmQgc3RhYmxlIHJlZmVyZW5jZTogSE4ncyBtYWluIGNvbnRlbnQgdGFibGUgKGRvZXNuJ3QgY2hhbmdlIHdpZHRoIHdoZW4gY29sbGFwc2luZylcbiAgY29uc3QgbWFpblRhYmxlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MVGFibGVFbGVtZW50PignI2hubWFpbicpIHx8IFxuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxUYWJsZUVsZW1lbnQ+KCd0YWJsZVt3aWR0aD1cIjg1JVwiXScpO1xuICBjb25zdCBjb250ZW50UmlnaHQgPSBtYWluVGFibGUgPyBtYWluVGFibGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkucmlnaHQgOiB3aW5kb3cuaW5uZXJXaWR0aCAtIDEwMDtcbiAgXG4gIGNvbGxhcHNlQnRuTWFwLmZvckVhY2goKGJ0biwgY29tbWVudElkKSA9PiB7XG4gICAgY29uc3QgY29tbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNvbW1lbnRJZCk7XG4gICAgaWYgKCFjb21tZW50KSB7XG4gICAgICBidG4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgcmVjdCA9IGNvbW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgXG4gICAgLy8gT25seSBzaG93IGJ1dHRvbnMgZm9yIGNvbW1lbnRzIGN1cnJlbnRseSB2aXNpYmxlIGluIHRoZSB2aWV3cG9ydFxuICAgIC8vIEhpZGUgaWY6IGFib3ZlIHZpZXdwb3J0LCBiZWxvdyB2aWV3cG9ydCwgb3Igd291bGQgYXBwZWFyIGluIHRoZSBoZWFkZXIgYXJlYVxuICAgIGNvbnN0IGlzQWJvdmVWaWV3cG9ydCA9IHJlY3QuYm90dG9tIDwgMDtcbiAgICBjb25zdCBpc0JlbG93Vmlld3BvcnQgPSByZWN0LnRvcCA+IHZpZXdwb3J0SGVpZ2h0O1xuICAgIGNvbnN0IGluSGVhZGVyQXJlYSA9IHJlY3QudG9wIDwgNTA7IC8vIERvbid0IHNob3cgYnV0dG9ucyBpbiB0aGUgdG9wIGhlYWRlciBhcmVhXG4gICAgXG4gICAgaWYgKGlzQWJvdmVWaWV3cG9ydCB8fCBpc0JlbG93Vmlld3BvcnQgfHwgaW5IZWFkZXJBcmVhKSB7XG4gICAgICBidG4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICB9IGVsc2Uge1xuICAgICAgYnRuLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgICBidG4uc3R5bGUudG9wID0gYCR7cmVjdC50b3B9cHhgO1xuICAgICAgLy8gUG9zaXRpb24ganVzdCB0byB0aGUgcmlnaHQgb2YgdGhlIG1haW4gY29udGVudCB0YWJsZSAoc3RhYmxlLCBkb2Vzbid0IHNoaWZ0KVxuICAgICAgYnRuLnN0eWxlLmxlZnQgPSBgJHtjb250ZW50UmlnaHQgKyA4fXB4YDtcbiAgICAgIGJ0bi5zdHlsZS5yaWdodCA9ICdhdXRvJztcbiAgICB9XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBzZXRDaGVja3BvaW50KHN0b3J5SWQ6IHN0cmluZywgY29tbWVudHM6IE5vZGVMaXN0T2Y8SFRNTFRhYmxlUm93RWxlbWVudD4pIHtcbiAgLy8gRmluZCB0aGUgY29tbWVudCBjdXJyZW50bHkgYXQgdG9wIG9mIHZpZXdwb3J0XG4gIGxldCB0b3BDb21tZW50OiBIVE1MVGFibGVSb3dFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIFxuICBmb3IgKGNvbnN0IGNvbW1lbnQgb2YgY29tbWVudHMpIHtcbiAgICBjb25zdCByZWN0ID0gY29tbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBpZiAocmVjdC50b3AgPj0gMCAmJiByZWN0LnRvcCA8IHdpbmRvdy5pbm5lckhlaWdodCAvIDIpIHtcbiAgICAgIHRvcENvbW1lbnQgPSBjb21tZW50O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKCF0b3BDb21tZW50KSB7XG4gICAgLy8gRmFsbGJhY2sgdG8gZmlyc3QgdmlzaWJsZVxuICAgIGZvciAoY29uc3QgY29tbWVudCBvZiBjb21tZW50cykge1xuICAgICAgY29uc3QgcmVjdCA9IGNvbW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAocmVjdC5ib3R0b20gPiAwKSB7XG4gICAgICAgIHRvcENvbW1lbnQgPSBjb21tZW50O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAodG9wQ29tbWVudCkge1xuICAgIGF3YWl0IHVwZGF0ZUNoZWNrcG9pbnQoc3RvcnlJZCwgdG9wQ29tbWVudC5pZCwgY29tbWVudHMubGVuZ3RoKTtcbiAgICBcbiAgICAvLyBTaG93IGNvbmZpcm1hdGlvblxuICAgIHNob3dUb2FzdCgn8J+TjSBDaGVja3BvaW50IHNhdmVkIScpO1xuICAgIFxuICAgIC8vIFVwZGF0ZSBtYXJrZXJzIHRvIHNob3cgcmVhZC91bnJlYWQgc3BsaXRcbiAgICBsZXQgZm91bmRDaGVja3BvaW50ID0gZmFsc2U7XG4gICAgY29tbWVudHMuZm9yRWFjaCgoY29tbWVudCkgPT4ge1xuICAgICAgY29uc3QgbWFya2VyID0gbWFya2VyTWFwLmdldChjb21tZW50LmlkKTtcbiAgICAgIGlmIChtYXJrZXIgJiYgIW1hcmtlci5jbGFzc0xpc3QuY29udGFpbnMoJ25ldycpKSB7XG4gICAgICAgIGlmICghZm91bmRDaGVja3BvaW50KSB7XG4gICAgICAgICAgbWFya2VyLmNsYXNzTGlzdC5yZW1vdmUoJ3VucmVhZCcpO1xuICAgICAgICAgIG1hcmtlci5jbGFzc0xpc3QuYWRkKCdyZWFkJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWFya2VyLmNsYXNzTGlzdC5yZW1vdmUoJ3JlYWQnKTtcbiAgICAgICAgICBtYXJrZXIuY2xhc3NMaXN0LmFkZCgndW5yZWFkJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChjb21tZW50LmlkID09PSB0b3BDb21tZW50IS5pZCkge1xuICAgICAgICBmb3VuZENoZWNrcG9pbnQgPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNjcm9sbFRvTmV4dFRvcGljKGNvbW1lbnRzOiBOb2RlTGlzdE9mPEhUTUxUYWJsZVJvd0VsZW1lbnQ+KSB7XG4gIGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSB3aW5kb3cuc2Nyb2xsWTtcblxuICBmb3IgKGNvbnN0IGNvbW1lbnQgb2YgY29tbWVudHMpIHtcbiAgICAvLyBDaGVjayBpZiBpdCdzIGEgdG9wLWxldmVsIGNvbW1lbnQgKGluZGVudCA9IDApXG4gICAgY29uc3QgaW5kZW50ID0gY29tbWVudC5xdWVyeVNlbGVjdG9yKCcuaW5kIGltZycpO1xuICAgIGNvbnN0IGluZGVudFdpZHRoID0gaW5kZW50ID8gcGFyc2VJbnQoaW5kZW50LmdldEF0dHJpYnV0ZSgnd2lkdGgnKSB8fCAnMCcsIDEwKSA6IDA7XG4gICAgXG4gICAgaWYgKGluZGVudFdpZHRoID09PSAwKSB7XG4gICAgICBjb25zdCByZWN0ID0gY29tbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIC8vIEZpbmQgb25lIHRoYXQncyBiZWxvdyBjdXJyZW50IHZpZXdwb3J0IHBvc2l0aW9uXG4gICAgICBpZiAocmVjdC50b3AgKyB3aW5kb3cuc2Nyb2xsWSA+IGN1cnJlbnRTY3JvbGxUb3AgKyAxMDApIHtcbiAgICAgICAgY29tbWVudC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdzdGFydCcgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzaG93VG9hc3QobWVzc2FnZTogc3RyaW5nKSB7XG4gIGxldCB0b2FzdCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTERpdkVsZW1lbnQ+KCcuaG4tbGF0ZXItdG9hc3QnKTtcbiAgaWYgKCF0b2FzdCkge1xuICAgIHRvYXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgdG9hc3QuY2xhc3NOYW1lID0gJ2huLWxhdGVyLXRvYXN0JztcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRvYXN0KTtcbiAgfVxuICB0b2FzdC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIHRvYXN0LmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTtcbiAgc2V0VGltZW91dCgoKSA9PiB0b2FzdD8uY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpLCAyMDAwKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEtFWUJPQVJEIFNIT1JUQ1VUU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gaW5pdEtleWJvYXJkU2hvcnRjdXRzKHN0b3J5SWQ6IHN0cmluZykge1xuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgYXN5bmMgKGUpID0+IHtcbiAgICAvLyBDbWQvQ3RybCArIFNoaWZ0ICsgUyB0byBzYXZlL3Vuc2F2ZVxuICAgIGlmICgoZS5tZXRhS2V5IHx8IGUuY3RybEtleSkgJiYgZS5zaGlmdEtleSAmJiBlLmtleS50b0xvd2VyQ2FzZSgpID09PSAncycpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICBcbiAgICAgIGNvbnN0IGlzU2F2ZWQgPSBhd2FpdCBpc0l0ZW1TYXZlZChzdG9yeUlkKTtcbiAgICAgIFxuICAgICAgaWYgKGlzU2F2ZWQpIHtcbiAgICAgICAgYXdhaXQgcmVtb3ZlSXRlbShzdG9yeUlkKTtcbiAgICAgICAgc2hvd1RvYXN0KCfwn5OaIFJlbW92ZWQgZnJvbSBzYXZlZCcpO1xuICAgICAgICBcbiAgICAgICAgLy8gVXBkYXRlIHNhdmUgbGluayBpZiBwcmVzZW50XG4gICAgICAgIGNvbnN0IHNhdmVMaW5rID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJy5obi1sYXRlci1zYXZlLWxpbmsnKTtcbiAgICAgICAgaWYgKHNhdmVMaW5rKSB7XG4gICAgICAgICAgc2F2ZUxpbmsudGV4dENvbnRlbnQgPSAnc2F2ZSc7XG4gICAgICAgICAgc2F2ZUxpbmsuY2xhc3NMaXN0LnJlbW92ZSgnc2F2ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gUmVtb3ZlIHRyYWNraW5nIFVJXG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5obi1sYXRlci1zY3JvbGxiYXInKT8ucmVtb3ZlKCk7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5obi1sYXRlci1idXR0b25zJyk/LnJlbW92ZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgdGl0bGVFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy50aXRsZWxpbmUgPiBhLCAuc3RvcnlsaW5rJykgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IHRpdGxlID0gdGl0bGVFbD8udGV4dENvbnRlbnQgfHwgJ1VudGl0bGVkJztcbiAgICAgICAgY29uc3QgdXJsID0gdGl0bGVFbD8uaHJlZiB8fCB3aW5kb3cubG9jYXRpb24uaHJlZjtcbiAgICAgICAgY29uc3QgaG5VcmwgPSB3aW5kb3cubG9jYXRpb24uaHJlZjtcbiAgICAgICAgY29uc3QgY29tbWVudHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxUYWJsZVJvd0VsZW1lbnQ+KCd0ci5hdGhpbmcuY29tdHInKTtcbiAgICAgICAgXG4gICAgICAgIGF3YWl0IHNhdmVJdGVtKHtcbiAgICAgICAgICBpZDogc3RvcnlJZCxcbiAgICAgICAgICB0aXRsZSxcbiAgICAgICAgICB1cmwsXG4gICAgICAgICAgaG5VcmwsXG4gICAgICAgICAgdG90YWxDb21tZW50czogY29tbWVudHMubGVuZ3RoLFxuICAgICAgICB9KTtcbiAgICAgICAgc2hvd1RvYXN0KCfwn5OMIFNhdmVkIGZvciBsYXRlciAoQ21kK1NoaWZ0K1MpJyk7XG4gICAgICAgIFxuICAgICAgICAvLyBVcGRhdGUgc2F2ZSBsaW5rIGlmIHByZXNlbnRcbiAgICAgICAgY29uc3Qgc2F2ZUxpbmsgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignLmhuLWxhdGVyLXNhdmUtbGluaycpO1xuICAgICAgICBpZiAoc2F2ZUxpbmspIHtcbiAgICAgICAgICBzYXZlTGluay50ZXh0Q29udGVudCA9ICdzYXZlZCDinJMnO1xuICAgICAgICAgIHNhdmVMaW5rLmNsYXNzTGlzdC5hZGQoJ3NhdmVkJyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFN0YXJ0IHRyYWNraW5nIGlmIG5vdCBhbHJlYWR5XG4gICAgICAgIGNvbnN0IHN0b3J5RGF0YSA9IGF3YWl0IGdldEl0ZW0oc3RvcnlJZCk7XG4gICAgICAgIGlmIChzdG9yeURhdGEgJiYgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5obi1sYXRlci1zY3JvbGxiYXInKSkge1xuICAgICAgICAgIC8vIFJlbG9hZCB0byBpbml0aWFsaXplIHRyYWNraW5nIFVJXG4gICAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cbiIsImZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuICBpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG4gIGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBhcmdzLnNoaWZ0KCk7XG4gICAgbWV0aG9kKGBbd3h0XSAke21lc3NhZ2V9YCwgLi4uYXJncyk7XG4gIH0gZWxzZSB7XG4gICAgbWV0aG9kKFwiW3d4dF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cbmV4cG9ydCBjb25zdCBsb2dnZXIgPSB7XG4gIGRlYnVnOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5kZWJ1ZywgLi4uYXJncyksXG4gIGxvZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUubG9nLCAuLi5hcmdzKSxcbiAgd2FybjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUud2FybiwgLi4uYXJncyksXG4gIGVycm9yOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5lcnJvciwgLi4uYXJncylcbn07XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5leHBvcnQgY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcbiAgY29uc3RydWN0b3IobmV3VXJsLCBvbGRVcmwpIHtcbiAgICBzdXBlcihXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LkVWRU5UX05BTUUsIHt9KTtcbiAgICB0aGlzLm5ld1VybCA9IG5ld1VybDtcbiAgICB0aGlzLm9sZFVybCA9IG9sZFVybDtcbiAgfVxuICBzdGF0aWMgRVZFTlRfTkFNRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpsb2NhdGlvbmNoYW5nZVwiKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG4gIHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cbiIsImltcG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcbiAgbGV0IGludGVydmFsO1xuICBsZXQgb2xkVXJsO1xuICByZXR1cm4ge1xuICAgIC8qKlxuICAgICAqIEVuc3VyZSB0aGUgbG9jYXRpb24gd2F0Y2hlciBpcyBhY3RpdmVseSBsb29raW5nIGZvciBVUkwgY2hhbmdlcy4gSWYgaXQncyBhbHJlYWR5IHdhdGNoaW5nLFxuICAgICAqIHRoaXMgaXMgYSBub29wLlxuICAgICAqL1xuICAgIHJ1bigpIHtcbiAgICAgIGlmIChpbnRlcnZhbCAhPSBudWxsKSByZXR1cm47XG4gICAgICBvbGRVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuICAgICAgaW50ZXJ2YWwgPSBjdHguc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBsZXQgbmV3VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgICAgaWYgKG5ld1VybC5ocmVmICE9PSBvbGRVcmwuaHJlZikge1xuICAgICAgICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgb2xkVXJsKSk7XG4gICAgICAgICAgb2xkVXJsID0gbmV3VXJsO1xuICAgICAgICB9XG4gICAgICB9LCAxZTMpO1xuICAgIH1cbiAgfTtcbn1cbiIsImltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuLi91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzXCI7XG5pbXBvcnQge1xuICBnZXRVbmlxdWVFdmVudE5hbWVcbn0gZnJvbSBcIi4vaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanNcIjtcbmltcG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9IGZyb20gXCIuL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzXCI7XG5leHBvcnQgY2xhc3MgQ29udGVudFNjcmlwdENvbnRleHQge1xuICBjb25zdHJ1Y3Rvcihjb250ZW50U2NyaXB0TmFtZSwgb3B0aW9ucykge1xuICAgIHRoaXMuY29udGVudFNjcmlwdE5hbWUgPSBjb250ZW50U2NyaXB0TmFtZTtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICAgIHRoaXMuYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGlmICh0aGlzLmlzVG9wRnJhbWUpIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKHsgaWdub3JlRmlyc3RFdmVudDogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuc3RvcE9sZFNjcmlwdHMoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5saXN0ZW5Gb3JOZXdlclNjcmlwdHMoKTtcbiAgICB9XG4gIH1cbiAgc3RhdGljIFNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcbiAgICBcInd4dDpjb250ZW50LXNjcmlwdC1zdGFydGVkXCJcbiAgKTtcbiAgaXNUb3BGcmFtZSA9IHdpbmRvdy5zZWxmID09PSB3aW5kb3cudG9wO1xuICBhYm9ydENvbnRyb2xsZXI7XG4gIGxvY2F0aW9uV2F0Y2hlciA9IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcih0aGlzKTtcbiAgcmVjZWl2ZWRNZXNzYWdlSWRzID0gLyogQF9fUFVSRV9fICovIG5ldyBTZXQoKTtcbiAgZ2V0IHNpZ25hbCgpIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuICB9XG4gIGFib3J0KHJlYXNvbikge1xuICAgIHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5hYm9ydChyZWFzb24pO1xuICB9XG4gIGdldCBpc0ludmFsaWQoKSB7XG4gICAgaWYgKGJyb3dzZXIucnVudGltZS5pZCA9PSBudWxsKSB7XG4gICAgICB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNpZ25hbC5hYm9ydGVkO1xuICB9XG4gIGdldCBpc1ZhbGlkKCkge1xuICAgIHJldHVybiAhdGhpcy5pc0ludmFsaWQ7XG4gIH1cbiAgLyoqXG4gICAqIEFkZCBhIGxpc3RlbmVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gdGhlIGNvbnRlbnQgc2NyaXB0J3MgY29udGV4dCBpcyBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQHJldHVybnMgQSBmdW5jdGlvbiB0byByZW1vdmUgdGhlIGxpc3RlbmVyLlxuICAgKlxuICAgKiBAZXhhbXBsZVxuICAgKiBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGNiKTtcbiAgICogY29uc3QgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lciA9IGN0eC5vbkludmFsaWRhdGVkKCgpID0+IHtcbiAgICogICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcbiAgICogfSlcbiAgICogLy8gLi4uXG4gICAqIHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIoKTtcbiAgICovXG4gIG9uSW52YWxpZGF0ZWQoY2IpIHtcbiAgICB0aGlzLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICAgIHJldHVybiAoKSA9PiB0aGlzLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuICB9XG4gIC8qKlxuICAgKiBSZXR1cm4gYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuIFVzZWZ1bCBpZiB5b3UgaGF2ZSBhbiBhc3luYyBmdW5jdGlvbiB0aGF0IHNob3VsZG4ndCBydW5cbiAgICogYWZ0ZXIgdGhlIGNvbnRleHQgaXMgZXhwaXJlZC5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcbiAgICogICBpZiAoY3R4LmlzSW52YWxpZCkgcmV0dXJuIGN0eC5ibG9jaygpO1xuICAgKlxuICAgKiAgIC8vIC4uLlxuICAgKiB9XG4gICAqL1xuICBibG9jaygpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKCkgPT4ge1xuICAgIH0pO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldEludGVydmFsYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKlxuICAgKiBJbnRlcnZhbHMgY2FuIGJlIGNsZWFyZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjbGVhckludGVydmFsYCBmdW5jdGlvbi5cbiAgICovXG4gIHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcbiAgICBjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuICAgKlxuICAgKiBUaW1lb3V0cyBjYW4gYmUgY2xlYXJlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYHNldFRpbWVvdXRgIGZ1bmN0aW9uLlxuICAgKi9cbiAgc2V0VGltZW91dChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcbiAgICB9LCB0aW1lb3V0KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJUaW1lb3V0KGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbEFuaW1hdGlvbkZyYW1lYCBmdW5jdGlvbi5cbiAgICovXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9KTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuICAgKiBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbElkbGVDYWxsYmFja2AgZnVuY3Rpb24uXG4gICAqL1xuICByZXF1ZXN0SWRsZUNhbGxiYWNrKGNhbGxiYWNrLCBvcHRpb25zKSB7XG4gICAgY29uc3QgaWQgPSByZXF1ZXN0SWRsZUNhbGxiYWNrKCguLi5hcmdzKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuc2lnbmFsLmFib3J0ZWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgIH0sIG9wdGlvbnMpO1xuICAgIHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxJZGxlQ2FsbGJhY2soaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgYWRkRXZlbnRMaXN0ZW5lcih0YXJnZXQsIHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMpIHtcbiAgICBpZiAodHlwZSA9PT0gXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIikge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgdGhpcy5sb2NhdGlvbldhdGNoZXIucnVuKCk7XG4gICAgfVxuICAgIHRhcmdldC5hZGRFdmVudExpc3RlbmVyPy4oXG4gICAgICB0eXBlLnN0YXJ0c1dpdGgoXCJ3eHQ6XCIpID8gZ2V0VW5pcXVlRXZlbnROYW1lKHR5cGUpIDogdHlwZSxcbiAgICAgIGhhbmRsZXIsXG4gICAgICB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIHNpZ25hbDogdGhpcy5zaWduYWxcbiAgICAgIH1cbiAgICApO1xuICB9XG4gIC8qKlxuICAgKiBAaW50ZXJuYWxcbiAgICogQWJvcnQgdGhlIGFib3J0IGNvbnRyb2xsZXIgYW5kIGV4ZWN1dGUgYWxsIGBvbkludmFsaWRhdGVkYCBsaXN0ZW5lcnMuXG4gICAqL1xuICBub3RpZnlJbnZhbGlkYXRlZCgpIHtcbiAgICB0aGlzLmFib3J0KFwiQ29udGVudCBzY3JpcHQgY29udGV4dCBpbnZhbGlkYXRlZFwiKTtcbiAgICBsb2dnZXIuZGVidWcoXG4gICAgICBgQ29udGVudCBzY3JpcHQgXCIke3RoaXMuY29udGVudFNjcmlwdE5hbWV9XCIgY29udGV4dCBpbnZhbGlkYXRlZGBcbiAgICApO1xuICB9XG4gIHN0b3BPbGRTY3JpcHRzKCkge1xuICAgIHdpbmRvdy5wb3N0TWVzc2FnZShcbiAgICAgIHtcbiAgICAgICAgdHlwZTogQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLFxuICAgICAgICBjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcbiAgICAgICAgbWVzc2FnZUlkOiBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKVxuICAgICAgfSxcbiAgICAgIFwiKlwiXG4gICAgKTtcbiAgfVxuICB2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcbiAgICBjb25zdCBpc1NjcmlwdFN0YXJ0ZWRFdmVudCA9IGV2ZW50LmRhdGE/LnR5cGUgPT09IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRTtcbiAgICBjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGF0YT8uY29udGVudFNjcmlwdE5hbWUgPT09IHRoaXMuY29udGVudFNjcmlwdE5hbWU7XG4gICAgY29uc3QgaXNOb3REdXBsaWNhdGUgPSAhdGhpcy5yZWNlaXZlZE1lc3NhZ2VJZHMuaGFzKGV2ZW50LmRhdGE/Lm1lc3NhZ2VJZCk7XG4gICAgcmV0dXJuIGlzU2NyaXB0U3RhcnRlZEV2ZW50ICYmIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgaXNOb3REdXBsaWNhdGU7XG4gIH1cbiAgbGlzdGVuRm9yTmV3ZXJTY3JpcHRzKG9wdGlvbnMpIHtcbiAgICBsZXQgaXNGaXJzdCA9IHRydWU7XG4gICAgY29uc3QgY2IgPSAoZXZlbnQpID0+IHtcbiAgICAgIGlmICh0aGlzLnZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkpIHtcbiAgICAgICAgdGhpcy5yZWNlaXZlZE1lc3NhZ2VJZHMuYWRkKGV2ZW50LmRhdGEubWVzc2FnZUlkKTtcbiAgICAgICAgY29uc3Qgd2FzRmlyc3QgPSBpc0ZpcnN0O1xuICAgICAgICBpc0ZpcnN0ID0gZmFsc2U7XG4gICAgICAgIGlmICh3YXNGaXJzdCAmJiBvcHRpb25zPy5pZ25vcmVGaXJzdEV2ZW50KSByZXR1cm47XG4gICAgICAgIHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIGFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIGNiKTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gcmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1lc3NhZ2VcIiwgY2IpKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbImRlZmluaXRpb24iLCJicm93c2VyIiwiX2Jyb3dzZXIiLCJwcmludCIsImxvZ2dlciJdLCJtYXBwaW5ncyI6Ijs7QUFBTyxXQUFTLG9CQUFvQkEsYUFBWTtBQUM5QyxXQUFPQTtBQUFBLEVBQ1Q7QUNETyxRQUFNQyxZQUFVLFdBQVcsU0FBUyxTQUFTLEtBQ2hELFdBQVcsVUFDWCxXQUFXO0FDRlIsUUFBTSxVQUFVQztBQ0l2QixpQkFBQSxTQUFBLE1BQUE7QUFDRSxVQUFBLFdBQUEsTUFBQSxRQUFBLFFBQUEsWUFBQSxFQUFBLE1BQUEsYUFBQSxNQUFBO0FBQ0EsUUFBQSxDQUFBLFNBQUEsUUFBQSxPQUFBLElBQUEsTUFBQSxTQUFBLEtBQUE7QUFBQSxFQUNGO0FBRUEsaUJBQUEsV0FBQSxTQUFBO0FBQ0UsVUFBQSxXQUFBLE1BQUEsUUFBQSxRQUFBLFlB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QSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0EsQ0FBQTtBQUVGLDBCQUFBLE1BQUEsSUFBQTtBQUFBLElBQThCO0FBQUEsRUFFbEM7QUFNQSxpQkFBQSxhQUFBLFNBQUE7QUFFRSxVQUFBLG9CQUFBLE9BQUE7QUFHQSxVQUFBLFlBQUEsTUFBQSxRQUFBLE9BQUE7QUFDQSxRQUFBLFdBQUE7QUFDRSwwQkFBQSxTQUFBLFVBQUEsbUJBQUE7QUFBQSxJQUEwRDtBQUFBLEVBRTlEO0FBRUEsaUJBQUEsb0JBQUEsU0FBQTtBQUNFLFVBQUEsVUFBQSxTQUFBLGNBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxRQUFBO0FBRUEsVUFBQSxRQUFBLFFBQUEsaUJBQUEsR0FBQTtBQUNBLFVBQUEsV0FBQSxNQUFBLE1BQUEsU0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLFNBQUE7QUFFQSxVQUFBLFdBQUEsU0FBQSxjQUFBLEdBQUE7QUFDQSxhQUFBLE9BQUE7QUFDQSxhQUFBLFlBQUE7QUFDQSxhQUFBLFFBQUEsVUFBQTtBQUVBLFVBQUEsVUFBQSxNQUFBLFlBQUEsT0FBQTtBQUNBLHdCQUFBLFVBQUEsT0FBQTtBQUVBLGFBQUEsaUJBQUEsU0FBQSxPQUFBLE1BQUE7QUFDRSxRQUFBLGVBQUE7QUFDQSxZQUFBLHVCQUFBLFVBQUEsT0FBQTtBQUFBLElBQThDLENBQUE7QUFHaEQsVUFBQSxZQUFBLFNBQUEsZUFBQSxLQUFBO0FBQ0EsYUFBQSxNQUFBLFdBQUEsUUFBQTtBQUFBLEVBQ0Y7QUFFQSxpQkFBQSx1QkFBQSxNQUFBLFNBQUE7QUFDRSxVQUFBLFVBQUEsS0FBQSxVQUFBLFNBQUEsT0FBQTtBQUVBLFFBQUEsU0FBQTtBQUNFLFlBQUEsV0FBQSxPQUFBO0FBQ0EsMEJBQUEsTUFBQSxLQUFBO0FBQ0EsdUJBQUE7QUFBQSxJQUFpQixPQUFBO0FBRWpCLFlBQUEsVUFBQSxTQUFBLGNBQUEsNEJBQUE7QUFDQSxZQUFBLFFBQUEsU0FBQSxlQUFBO0FBQ0EsWUFBQSxNQUFBLFNBQUEsUUFBQSxPQUFBLFNBQUE7QUFDQSxZQUFB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
content;