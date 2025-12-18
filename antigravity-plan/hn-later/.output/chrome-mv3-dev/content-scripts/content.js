var content = (function() {
  "use strict";
  function defineContentScript(definition2) {
    return definition2;
  }
  const browser$1 = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  const instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
  let idbProxyableTypes;
  let cursorAdvanceMethods;
  function getIdbProxyableTypes() {
    return idbProxyableTypes || (idbProxyableTypes = [
      IDBDatabase,
      IDBObjectStore,
      IDBIndex,
      IDBCursor,
      IDBTransaction
    ]);
  }
  function getCursorAdvanceMethods() {
    return cursorAdvanceMethods || (cursorAdvanceMethods = [
      IDBCursor.prototype.advance,
      IDBCursor.prototype.continue,
      IDBCursor.prototype.continuePrimaryKey
    ]);
  }
  const transactionDoneMap = /* @__PURE__ */ new WeakMap();
  const transformCache = /* @__PURE__ */ new WeakMap();
  const reverseTransformCache = /* @__PURE__ */ new WeakMap();
  function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
      const unlisten = () => {
        request.removeEventListener("success", success);
        request.removeEventListener("error", error);
      };
      const success = () => {
        resolve(wrap(request.result));
        unlisten();
      };
      const error = () => {
        reject(request.error);
        unlisten();
      };
      request.addEventListener("success", success);
      request.addEventListener("error", error);
    });
    reverseTransformCache.set(promise, request);
    return promise;
  }
  function cacheDonePromiseForTransaction(tx) {
    if (transactionDoneMap.has(tx))
      return;
    const done = new Promise((resolve, reject) => {
      const unlisten = () => {
        tx.removeEventListener("complete", complete);
        tx.removeEventListener("error", error);
        tx.removeEventListener("abort", error);
      };
      const complete = () => {
        resolve();
        unlisten();
      };
      const error = () => {
        reject(tx.error || new DOMException("AbortError", "AbortError"));
        unlisten();
      };
      tx.addEventListener("complete", complete);
      tx.addEventListener("error", error);
      tx.addEventListener("abort", error);
    });
    transactionDoneMap.set(tx, done);
  }
  let idbProxyTraps = {
    get(target, prop, receiver) {
      if (target instanceof IDBTransaction) {
        if (prop === "done")
          return transactionDoneMap.get(target);
        if (prop === "store") {
          return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
        }
      }
      return wrap(target[prop]);
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has(target, prop) {
      if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
        return true;
      }
      return prop in target;
    }
  };
  function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
  }
  function wrapFunction(func) {
    if (getCursorAdvanceMethods().includes(func)) {
      return function(...args) {
        func.apply(unwrap(this), args);
        return wrap(this.request);
      };
    }
    return function(...args) {
      return wrap(func.apply(unwrap(this), args));
    };
  }
  function transformCachableValue(value) {
    if (typeof value === "function")
      return wrapFunction(value);
    if (value instanceof IDBTransaction)
      cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
      return new Proxy(value, idbProxyTraps);
    return value;
  }
  function wrap(value) {
    if (value instanceof IDBRequest)
      return promisifyRequest(value);
    if (transformCache.has(value))
      return transformCache.get(value);
    const newValue = transformCachableValue(value);
    if (newValue !== value) {
      transformCache.set(value, newValue);
      reverseTransformCache.set(newValue, value);
    }
    return newValue;
  }
  const unwrap = (value) => reverseTransformCache.get(value);
  function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap(request);
    if (upgrade) {
      request.addEventListener("upgradeneeded", (event) => {
        upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
      });
    }
    if (blocked) {
      request.addEventListener("blocked", (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion,
        event.newVersion,
        event
      ));
    }
    openPromise.then((db) => {
      if (terminated)
        db.addEventListener("close", () => terminated());
      if (blocking) {
        db.addEventListener("versionchange", (event) => blocking(event.oldVersion, event.newVersion, event));
      }
    }).catch(() => {
    });
    return openPromise;
  }
  const readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
  const writeMethods = ["put", "add", "delete", "clear"];
  const cachedMethods = /* @__PURE__ */ new Map();
  function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
      return;
    }
    if (cachedMethods.get(prop))
      return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, "");
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
      // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
      !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
    ) {
      return;
    }
    const method = async function(storeName, ...args) {
      const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
      let target2 = tx.store;
      if (useIndex)
        target2 = target2.index(args.shift());
      return (await Promise.all([
        target2[targetFuncName](...args),
        isWrite && tx.done
      ]))[0];
    };
    cachedMethods.set(prop, method);
    return method;
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
  }));
  const advanceMethodProps = ["continue", "continuePrimaryKey", "advance"];
  const methodMap = {};
  const advanceResults = /* @__PURE__ */ new WeakMap();
  const ittrProxiedCursorToOriginalProxy = /* @__PURE__ */ new WeakMap();
  const cursorIteratorTraps = {
    get(target, prop) {
      if (!advanceMethodProps.includes(prop))
        return target[prop];
      let cachedFunc = methodMap[prop];
      if (!cachedFunc) {
        cachedFunc = methodMap[prop] = function(...args) {
          advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
        };
      }
      return cachedFunc;
    }
  };
  async function* iterate(...args) {
    let cursor = this;
    if (!(cursor instanceof IDBCursor)) {
      cursor = await cursor.openCursor(...args);
    }
    if (!cursor)
      return;
    cursor = cursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));
    while (cursor) {
      yield proxiedCursor;
      cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
      advanceResults.delete(proxiedCursor);
    }
  }
  function isIteratorProp(target, prop) {
    return prop === Symbol.asyncIterator && instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor]) || prop === "iterate" && instanceOfAny(target, [IDBIndex, IDBObjectStore]);
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get(target, prop, receiver) {
      if (isIteratorProp(target, prop))
        return iterate;
      return oldTraps.get(target, prop, receiver);
    },
    has(target, prop) {
      return isIteratorProp(target, prop) || oldTraps.has(target, prop);
    }
  }));
  let dbPromise = null;
  function getDB() {
    if (!dbPromise) {
      dbPromise = openDB("hn-later", 1, {
        upgrade(db) {
          const store = db.createObjectStore("stories", { keyPath: "id" });
          store.createIndex("by-savedAt", "savedAt");
        }
      });
    }
    return dbPromise;
  }
  async function saveItem(item) {
    const db = await getDB();
    const existing = await db.get("stories", item.id);
    if (existing) {
      await db.put("stories", {
        ...existing,
        ...item,
        lastVisit: Date.now()
      });
    } else {
      await db.add("stories", {
        ...item,
        savedAt: Date.now(),
        lastVisit: Date.now(),
        seenComments: [],
        readComments: []
      });
    }
  }
  async function removeItem(storyId) {
    const db = await getDB();
    await db.delete("stories", storyId);
  }
  async function getItem(storyId) {
    const db = await getDB();
    return db.get("stories", storyId);
  }
  async function getItems() {
    const db = await getDB();
    const items = await db.getAllFromIndex("stories", "by-savedAt");
    return items.reverse();
  }
  async function isItemSaved(storyId) {
    const db = await getDB();
    const item = await db.get("stories", storyId);
    return !!item;
  }
  async function updateComments(storyId, seenCommentIds, readCommentIds, totalComments) {
    const db = await getDB();
    const item = await db.get("stories", storyId);
    if (!item) return;
    const seenSet = /* @__PURE__ */ new Set([...item.seenComments, ...seenCommentIds]);
    const readSet = /* @__PURE__ */ new Set([...item.readComments, ...readCommentIds]);
    await db.put("stories", {
      ...item,
      seenComments: Array.from(seenSet),
      readComments: Array.from(readSet),
      totalComments,
      lastVisit: Date.now()
    });
  }
  async function getProgress(storyId) {
    const db = await getDB();
    const item = await db.get("stories", storyId);
    if (!item) return null;
    const readProgress = item.totalComments > 0 ? Math.round(item.readComments.length / item.totalComments * 100) : 0;
    return {
      seenComments: new Set(item.seenComments),
      readComments: new Set(item.readComments),
      totalComments: item.totalComments,
      readProgress
    };
  }
  const storage = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    getItem,
    getItems,
    getProgress,
    isItemSaved,
    removeItem,
    saveItem,
    updateComments
  }, Symbol.toStringTag, { value: "Module" }));
  const definition = defineContentScript({
    matches: ["*://news.ycombinator.com/*"],
    main() {
      const isItemPage = window.location.pathname === "/item";
      const storyId = new URLSearchParams(window.location.search).get("id");
      if (isItemPage && storyId) {
        initCommentTracking(storyId);
      }
      initSaveButtons();
    }
  });
  async function initSaveButtons() {
    const storyRows = document.querySelectorAll("tr.athing:not(.comtr)");
    for (const row of storyRows) {
      const id = row.id;
      if (!id) continue;
      const titleCell = row.querySelector("td.title:last-child");
      const titleLink = titleCell?.querySelector("a.titleline > a, span.titleline > a");
      if (!titleCell || !titleLink) continue;
      const btn = document.createElement("button");
      btn.className = "hn-later-save-btn";
      btn.dataset.storyId = id;
      const isSaved = await isItemSaved(id);
      btn.classList.toggle("saved", isSaved);
      btn.textContent = isSaved ? "📌" : "📍";
      btn.title = isSaved ? "Remove from Read Later" : "Save for Later";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleSave(btn, titleLink);
      });
      titleCell.insertBefore(btn, titleCell.firstChild);
    }
  }
  async function toggleSave(btn, titleLink) {
    const storyId = btn.dataset.storyId;
    const isSaved = btn.classList.contains("saved");
    if (isSaved) {
      await removeItem(storyId);
      btn.classList.remove("saved");
      btn.textContent = "📍";
      btn.title = "Save for Later";
    } else {
      const title = titleLink.textContent || "Untitled";
      const url = titleLink.href;
      const hnUrl = `https://news.ycombinator.com/item?id=${storyId}`;
      const subtextRow = document.getElementById(storyId)?.nextElementSibling;
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
      btn.classList.add("saved");
      btn.textContent = "📌";
      btn.title = "Remove from Read Later";
    }
    const items = await (await Promise.resolve().then(() => storage)).getItems();
    await browser.storage.local.set({ itemCount: items.length });
  }
  async function initCommentTracking(storyId) {
    const storyData = await getItem(storyId);
    if (!storyData) return;
    const comments = document.querySelectorAll("tr.athing.comtr");
    if (comments.length === 0) return;
    const progress = await getProgress(storyId);
    const seenSet = progress?.seenComments || /* @__PURE__ */ new Set();
    const readSet = progress?.readComments || /* @__PURE__ */ new Set();
    comments.forEach((comment) => {
      const commentId = comment.id;
      if (readSet.has(commentId)) {
        comment.classList.add("hn-later-read");
      } else if (!seenSet.has(commentId)) {
        comment.classList.add("hn-later-new");
      }
    });
    createScrollbarMarkers(comments, seenSet, readSet);
    createJumpButton(comments, readSet);
    if (window.location.hash === "#hn-later-unread") {
      scrollToFirstUnread(comments, readSet);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const newlySeen = [];
    const newlyRead = [];
    const readTimers = /* @__PURE__ */ new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const commentId = entry.target.id;
          if (entry.isIntersecting) {
            if (!seenSet.has(commentId)) {
              seenSet.add(commentId);
              newlySeen.push(commentId);
              entry.target.classList.remove("hn-later-new");
            }
            if (!readSet.has(commentId) && !readTimers.has(commentId)) {
              const timer = window.setTimeout(() => {
                readSet.add(commentId);
                newlyRead.push(commentId);
                entry.target.classList.add("hn-later-read");
                readTimers.delete(commentId);
                updateMarker(commentId);
              }, 500);
              readTimers.set(commentId, timer);
            }
          } else {
            const timer = readTimers.get(commentId);
            if (timer) {
              clearTimeout(timer);
              readTimers.delete(commentId);
            }
          }
        });
      },
      { threshold: 0.5 }
    );
    comments.forEach((comment) => observer.observe(comment));
    window.addEventListener("beforeunload", () => {
      if (newlySeen.length > 0 || newlyRead.length > 0) {
        updateComments(storyId, newlySeen, newlyRead, comments.length);
      }
    });
    setInterval(() => {
      if (newlySeen.length > 0 || newlyRead.length > 0) {
        updateComments(storyId, [...newlySeen], [...newlyRead], comments.length);
        newlySeen.length = 0;
        newlyRead.length = 0;
      }
    }, 5e3);
  }
  let markersContainer = null;
  const markerMap = /* @__PURE__ */ new Map();
  function createScrollbarMarkers(comments, seenSet, readSet) {
    markersContainer = document.createElement("div");
    markersContainer.className = "hn-later-scrollbar";
    const docHeight = document.documentElement.scrollHeight;
    comments.forEach((comment) => {
      const commentId = comment.id;
      const rect = comment.getBoundingClientRect();
      const top = (rect.top + window.scrollY) / docHeight;
      const marker = document.createElement("div");
      marker.className = "hn-later-marker";
      marker.dataset.commentId = commentId;
      if (readSet.has(commentId)) {
        marker.classList.add("read");
      } else if (!seenSet.has(commentId)) {
        marker.classList.add("new");
      } else {
        marker.classList.add("unread");
      }
      marker.style.top = `${top * 100}%`;
      marker.addEventListener("click", () => {
        comment.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      markersContainer.appendChild(marker);
      markerMap.set(commentId, marker);
    });
    document.body.appendChild(markersContainer);
  }
  function updateMarker(commentId, status) {
    const marker = markerMap.get(commentId);
    if (marker) {
      marker.classList.remove("new", "unread");
      marker.classList.add("read");
    }
  }
  function createJumpButton(comments, readSet) {
    const btn = document.createElement("button");
    btn.className = "hn-later-jump-btn";
    btn.innerHTML = "⬇️ Next Unread";
    btn.title = "Jump to next unread comment";
    btn.addEventListener("click", () => {
      scrollToFirstUnread(comments, readSet);
    });
    document.body.appendChild(btn);
    const updateJumpButton = () => {
      const hasUnreadBelow = Array.from(comments).some((comment) => {
        if (readSet.has(comment.id)) return false;
        const rect = comment.getBoundingClientRect();
        return rect.top > window.innerHeight;
      });
      btn.style.display = hasUnreadBelow ? "block" : "none";
    };
    window.addEventListener("scroll", updateJumpButton, { passive: true });
    updateJumpButton();
  }
  function scrollToFirstUnread(comments, readSet) {
    for (const comment of comments) {
      if (!readSet.has(comment.id)) {
        const rect = comment.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.3 || rect.top < 0) {
          comment.scrollIntoView({ behavior: "smooth", block: "center" });
          comment.classList.add("hn-later-highlight");
          setTimeout(() => comment.classList.remove("hn-later-highlight"), 2e3);
          break;
        }
      }
    }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL2lkYi9idWlsZC9pbmRleC5qcyIsIi4uLy4uLy4uL2xpYi9zdG9yYWdlLnRzIiwiLi4vLi4vLi4vZW50cnlwb2ludHMvY29udGVudC50cyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQubWpzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDb250ZW50U2NyaXB0KGRlZmluaXRpb24pIHtcbiAgcmV0dXJuIGRlZmluaXRpb247XG59XG4iLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIF9icm93c2VyIH0gZnJvbSBcIkB3eHQtZGV2L2Jyb3dzZXJcIjtcbmV4cG9ydCBjb25zdCBicm93c2VyID0gX2Jyb3dzZXI7XG5leHBvcnQge307XG4iLCJjb25zdCBpbnN0YW5jZU9mQW55ID0gKG9iamVjdCwgY29uc3RydWN0b3JzKSA9PiBjb25zdHJ1Y3RvcnMuc29tZSgoYykgPT4gb2JqZWN0IGluc3RhbmNlb2YgYyk7XG5cbmxldCBpZGJQcm94eWFibGVUeXBlcztcbmxldCBjdXJzb3JBZHZhbmNlTWV0aG9kcztcbi8vIFRoaXMgaXMgYSBmdW5jdGlvbiB0byBwcmV2ZW50IGl0IHRocm93aW5nIHVwIGluIG5vZGUgZW52aXJvbm1lbnRzLlxuZnVuY3Rpb24gZ2V0SWRiUHJveHlhYmxlVHlwZXMoKSB7XG4gICAgcmV0dXJuIChpZGJQcm94eWFibGVUeXBlcyB8fFxuICAgICAgICAoaWRiUHJveHlhYmxlVHlwZXMgPSBbXG4gICAgICAgICAgICBJREJEYXRhYmFzZSxcbiAgICAgICAgICAgIElEQk9iamVjdFN0b3JlLFxuICAgICAgICAgICAgSURCSW5kZXgsXG4gICAgICAgICAgICBJREJDdXJzb3IsXG4gICAgICAgICAgICBJREJUcmFuc2FjdGlvbixcbiAgICAgICAgXSkpO1xufVxuLy8gVGhpcyBpcyBhIGZ1bmN0aW9uIHRvIHByZXZlbnQgaXQgdGhyb3dpbmcgdXAgaW4gbm9kZSBlbnZpcm9ubWVudHMuXG5mdW5jdGlvbiBnZXRDdXJzb3JBZHZhbmNlTWV0aG9kcygpIHtcbiAgICByZXR1cm4gKGN1cnNvckFkdmFuY2VNZXRob2RzIHx8XG4gICAgICAgIChjdXJzb3JBZHZhbmNlTWV0aG9kcyA9IFtcbiAgICAgICAgICAgIElEQkN1cnNvci5wcm90b3R5cGUuYWR2YW5jZSxcbiAgICAgICAgICAgIElEQkN1cnNvci5wcm90b3R5cGUuY29udGludWUsXG4gICAgICAgICAgICBJREJDdXJzb3IucHJvdG90eXBlLmNvbnRpbnVlUHJpbWFyeUtleSxcbiAgICAgICAgXSkpO1xufVxuY29uc3QgdHJhbnNhY3Rpb25Eb25lTWFwID0gbmV3IFdlYWtNYXAoKTtcbmNvbnN0IHRyYW5zZm9ybUNhY2hlID0gbmV3IFdlYWtNYXAoKTtcbmNvbnN0IHJldmVyc2VUcmFuc2Zvcm1DYWNoZSA9IG5ldyBXZWFrTWFwKCk7XG5mdW5jdGlvbiBwcm9taXNpZnlSZXF1ZXN0KHJlcXVlc3QpIHtcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCB1bmxpc3RlbiA9ICgpID0+IHtcbiAgICAgICAgICAgIHJlcXVlc3QucmVtb3ZlRXZlbnRMaXN0ZW5lcignc3VjY2VzcycsIHN1Y2Nlc3MpO1xuICAgICAgICAgICAgcmVxdWVzdC5yZW1vdmVFdmVudExpc3RlbmVyKCdlcnJvcicsIGVycm9yKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgc3VjY2VzcyA9ICgpID0+IHtcbiAgICAgICAgICAgIHJlc29sdmUod3JhcChyZXF1ZXN0LnJlc3VsdCkpO1xuICAgICAgICAgICAgdW5saXN0ZW4oKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgZXJyb3IgPSAoKSA9PiB7XG4gICAgICAgICAgICByZWplY3QocmVxdWVzdC5lcnJvcik7XG4gICAgICAgICAgICB1bmxpc3RlbigpO1xuICAgICAgICB9O1xuICAgICAgICByZXF1ZXN0LmFkZEV2ZW50TGlzdGVuZXIoJ3N1Y2Nlc3MnLCBzdWNjZXNzKTtcbiAgICAgICAgcmVxdWVzdC5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIGVycm9yKTtcbiAgICB9KTtcbiAgICAvLyBUaGlzIG1hcHBpbmcgZXhpc3RzIGluIHJldmVyc2VUcmFuc2Zvcm1DYWNoZSBidXQgZG9lc24ndCBleGlzdCBpbiB0cmFuc2Zvcm1DYWNoZS4gVGhpc1xuICAgIC8vIGlzIGJlY2F1c2Ugd2UgY3JlYXRlIG1hbnkgcHJvbWlzZXMgZnJvbSBhIHNpbmdsZSBJREJSZXF1ZXN0LlxuICAgIHJldmVyc2VUcmFuc2Zvcm1DYWNoZS5zZXQocHJvbWlzZSwgcmVxdWVzdCk7XG4gICAgcmV0dXJuIHByb21pc2U7XG59XG5mdW5jdGlvbiBjYWNoZURvbmVQcm9taXNlRm9yVHJhbnNhY3Rpb24odHgpIHtcbiAgICAvLyBFYXJseSBiYWlsIGlmIHdlJ3ZlIGFscmVhZHkgY3JlYXRlZCBhIGRvbmUgcHJvbWlzZSBmb3IgdGhpcyB0cmFuc2FjdGlvbi5cbiAgICBpZiAodHJhbnNhY3Rpb25Eb25lTWFwLmhhcyh0eCkpXG4gICAgICAgIHJldHVybjtcbiAgICBjb25zdCBkb25lID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCB1bmxpc3RlbiA9ICgpID0+IHtcbiAgICAgICAgICAgIHR4LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvbXBsZXRlJywgY29tcGxldGUpO1xuICAgICAgICAgICAgdHgucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBlcnJvcik7XG4gICAgICAgICAgICB0eC5yZW1vdmVFdmVudExpc3RlbmVyKCdhYm9ydCcsIGVycm9yKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgY29tcGxldGUgPSAoKSA9PiB7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB1bmxpc3RlbigpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBlcnJvciA9ICgpID0+IHtcbiAgICAgICAgICAgIHJlamVjdCh0eC5lcnJvciB8fCBuZXcgRE9NRXhjZXB0aW9uKCdBYm9ydEVycm9yJywgJ0Fib3J0RXJyb3InKSk7XG4gICAgICAgICAgICB1bmxpc3RlbigpO1xuICAgICAgICB9O1xuICAgICAgICB0eC5hZGRFdmVudExpc3RlbmVyKCdjb21wbGV0ZScsIGNvbXBsZXRlKTtcbiAgICAgICAgdHguYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBlcnJvcik7XG4gICAgICAgIHR4LmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgZXJyb3IpO1xuICAgIH0pO1xuICAgIC8vIENhY2hlIGl0IGZvciBsYXRlciByZXRyaWV2YWwuXG4gICAgdHJhbnNhY3Rpb25Eb25lTWFwLnNldCh0eCwgZG9uZSk7XG59XG5sZXQgaWRiUHJveHlUcmFwcyA9IHtcbiAgICBnZXQodGFyZ2V0LCBwcm9wLCByZWNlaXZlcikge1xuICAgICAgICBpZiAodGFyZ2V0IGluc3RhbmNlb2YgSURCVHJhbnNhY3Rpb24pIHtcbiAgICAgICAgICAgIC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIHRyYW5zYWN0aW9uLmRvbmUuXG4gICAgICAgICAgICBpZiAocHJvcCA9PT0gJ2RvbmUnKVxuICAgICAgICAgICAgICAgIHJldHVybiB0cmFuc2FjdGlvbkRvbmVNYXAuZ2V0KHRhcmdldCk7XG4gICAgICAgICAgICAvLyBNYWtlIHR4LnN0b3JlIHJldHVybiB0aGUgb25seSBzdG9yZSBpbiB0aGUgdHJhbnNhY3Rpb24sIG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBhcmUgbWFueS5cbiAgICAgICAgICAgIGlmIChwcm9wID09PSAnc3RvcmUnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlY2VpdmVyLm9iamVjdFN0b3JlTmFtZXNbMV1cbiAgICAgICAgICAgICAgICAgICAgPyB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgOiByZWNlaXZlci5vYmplY3RTdG9yZShyZWNlaXZlci5vYmplY3RTdG9yZU5hbWVzWzBdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBFbHNlIHRyYW5zZm9ybSB3aGF0ZXZlciB3ZSBnZXQgYmFjay5cbiAgICAgICAgcmV0dXJuIHdyYXAodGFyZ2V0W3Byb3BdKTtcbiAgICB9LFxuICAgIHNldCh0YXJnZXQsIHByb3AsIHZhbHVlKSB7XG4gICAgICAgIHRhcmdldFtwcm9wXSA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9LFxuICAgIGhhcyh0YXJnZXQsIHByb3ApIHtcbiAgICAgICAgaWYgKHRhcmdldCBpbnN0YW5jZW9mIElEQlRyYW5zYWN0aW9uICYmXG4gICAgICAgICAgICAocHJvcCA9PT0gJ2RvbmUnIHx8IHByb3AgPT09ICdzdG9yZScpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcHJvcCBpbiB0YXJnZXQ7XG4gICAgfSxcbn07XG5mdW5jdGlvbiByZXBsYWNlVHJhcHMoY2FsbGJhY2spIHtcbiAgICBpZGJQcm94eVRyYXBzID0gY2FsbGJhY2soaWRiUHJveHlUcmFwcyk7XG59XG5mdW5jdGlvbiB3cmFwRnVuY3Rpb24oZnVuYykge1xuICAgIC8vIER1ZSB0byBleHBlY3RlZCBvYmplY3QgZXF1YWxpdHkgKHdoaWNoIGlzIGVuZm9yY2VkIGJ5IHRoZSBjYWNoaW5nIGluIGB3cmFwYCksIHdlXG4gICAgLy8gb25seSBjcmVhdGUgb25lIG5ldyBmdW5jIHBlciBmdW5jLlxuICAgIC8vIEN1cnNvciBtZXRob2RzIGFyZSBzcGVjaWFsLCBhcyB0aGUgYmVoYXZpb3VyIGlzIGEgbGl0dGxlIG1vcmUgZGlmZmVyZW50IHRvIHN0YW5kYXJkIElEQi4gSW5cbiAgICAvLyBJREIsIHlvdSBhZHZhbmNlIHRoZSBjdXJzb3IgYW5kIHdhaXQgZm9yIGEgbmV3ICdzdWNjZXNzJyBvbiB0aGUgSURCUmVxdWVzdCB0aGF0IGdhdmUgeW91IHRoZVxuICAgIC8vIGN1cnNvci4gSXQncyBraW5kYSBsaWtlIGEgcHJvbWlzZSB0aGF0IGNhbiByZXNvbHZlIHdpdGggbWFueSB2YWx1ZXMuIFRoYXQgZG9lc24ndCBtYWtlIHNlbnNlXG4gICAgLy8gd2l0aCByZWFsIHByb21pc2VzLCBzbyBlYWNoIGFkdmFuY2UgbWV0aG9kcyByZXR1cm5zIGEgbmV3IHByb21pc2UgZm9yIHRoZSBjdXJzb3Igb2JqZWN0LCBvclxuICAgIC8vIHVuZGVmaW5lZCBpZiB0aGUgZW5kIG9mIHRoZSBjdXJzb3IgaGFzIGJlZW4gcmVhY2hlZC5cbiAgICBpZiAoZ2V0Q3Vyc29yQWR2YW5jZU1ldGhvZHMoKS5pbmNsdWRlcyhmdW5jKSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgICAgIC8vIENhbGxpbmcgdGhlIG9yaWdpbmFsIGZ1bmN0aW9uIHdpdGggdGhlIHByb3h5IGFzICd0aGlzJyBjYXVzZXMgSUxMRUdBTCBJTlZPQ0FUSU9OLCBzbyB3ZSB1c2VcbiAgICAgICAgICAgIC8vIHRoZSBvcmlnaW5hbCBvYmplY3QuXG4gICAgICAgICAgICBmdW5jLmFwcGx5KHVud3JhcCh0aGlzKSwgYXJncyk7XG4gICAgICAgICAgICByZXR1cm4gd3JhcCh0aGlzLnJlcXVlc3QpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgLy8gQ2FsbGluZyB0aGUgb3JpZ2luYWwgZnVuY3Rpb24gd2l0aCB0aGUgcHJveHkgYXMgJ3RoaXMnIGNhdXNlcyBJTExFR0FMIElOVk9DQVRJT04sIHNvIHdlIHVzZVxuICAgICAgICAvLyB0aGUgb3JpZ2luYWwgb2JqZWN0LlxuICAgICAgICByZXR1cm4gd3JhcChmdW5jLmFwcGx5KHVud3JhcCh0aGlzKSwgYXJncykpO1xuICAgIH07XG59XG5mdW5jdGlvbiB0cmFuc2Zvcm1DYWNoYWJsZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgcmV0dXJuIHdyYXBGdW5jdGlvbih2YWx1ZSk7XG4gICAgLy8gVGhpcyBkb2Vzbid0IHJldHVybiwgaXQganVzdCBjcmVhdGVzIGEgJ2RvbmUnIHByb21pc2UgZm9yIHRoZSB0cmFuc2FjdGlvbixcbiAgICAvLyB3aGljaCBpcyBsYXRlciByZXR1cm5lZCBmb3IgdHJhbnNhY3Rpb24uZG9uZSAoc2VlIGlkYk9iamVjdEhhbmRsZXIpLlxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIElEQlRyYW5zYWN0aW9uKVxuICAgICAgICBjYWNoZURvbmVQcm9taXNlRm9yVHJhbnNhY3Rpb24odmFsdWUpO1xuICAgIGlmIChpbnN0YW5jZU9mQW55KHZhbHVlLCBnZXRJZGJQcm94eWFibGVUeXBlcygpKSlcbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eSh2YWx1ZSwgaWRiUHJveHlUcmFwcyk7XG4gICAgLy8gUmV0dXJuIHRoZSBzYW1lIHZhbHVlIGJhY2sgaWYgd2UncmUgbm90IGdvaW5nIHRvIHRyYW5zZm9ybSBpdC5cbiAgICByZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiB3cmFwKHZhbHVlKSB7XG4gICAgLy8gV2Ugc29tZXRpbWVzIGdlbmVyYXRlIG11bHRpcGxlIHByb21pc2VzIGZyb20gYSBzaW5nbGUgSURCUmVxdWVzdCAoZWcgd2hlbiBjdXJzb3JpbmcpLCBiZWNhdXNlXG4gICAgLy8gSURCIGlzIHdlaXJkIGFuZCBhIHNpbmdsZSBJREJSZXF1ZXN0IGNhbiB5aWVsZCBtYW55IHJlc3BvbnNlcywgc28gdGhlc2UgY2FuJ3QgYmUgY2FjaGVkLlxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIElEQlJlcXVlc3QpXG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0KHZhbHVlKTtcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IHRyYW5zZm9ybWVkIHRoaXMgdmFsdWUgYmVmb3JlLCByZXVzZSB0aGUgdHJhbnNmb3JtZWQgdmFsdWUuXG4gICAgLy8gVGhpcyBpcyBmYXN0ZXIsIGJ1dCBpdCBhbHNvIHByb3ZpZGVzIG9iamVjdCBlcXVhbGl0eS5cbiAgICBpZiAodHJhbnNmb3JtQ2FjaGUuaGFzKHZhbHVlKSlcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybUNhY2hlLmdldCh2YWx1ZSk7XG4gICAgY29uc3QgbmV3VmFsdWUgPSB0cmFuc2Zvcm1DYWNoYWJsZVZhbHVlKHZhbHVlKTtcbiAgICAvLyBOb3QgYWxsIHR5cGVzIGFyZSB0cmFuc2Zvcm1lZC5cbiAgICAvLyBUaGVzZSBtYXkgYmUgcHJpbWl0aXZlIHR5cGVzLCBzbyB0aGV5IGNhbid0IGJlIFdlYWtNYXAga2V5cy5cbiAgICBpZiAobmV3VmFsdWUgIT09IHZhbHVlKSB7XG4gICAgICAgIHRyYW5zZm9ybUNhY2hlLnNldCh2YWx1ZSwgbmV3VmFsdWUpO1xuICAgICAgICByZXZlcnNlVHJhbnNmb3JtQ2FjaGUuc2V0KG5ld1ZhbHVlLCB2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiBuZXdWYWx1ZTtcbn1cbmNvbnN0IHVud3JhcCA9ICh2YWx1ZSkgPT4gcmV2ZXJzZVRyYW5zZm9ybUNhY2hlLmdldCh2YWx1ZSk7XG5cbi8qKlxuICogT3BlbiBhIGRhdGFiYXNlLlxuICpcbiAqIEBwYXJhbSBuYW1lIE5hbWUgb2YgdGhlIGRhdGFiYXNlLlxuICogQHBhcmFtIHZlcnNpb24gU2NoZW1hIHZlcnNpb24uXG4gKiBAcGFyYW0gY2FsbGJhY2tzIEFkZGl0aW9uYWwgY2FsbGJhY2tzLlxuICovXG5mdW5jdGlvbiBvcGVuREIobmFtZSwgdmVyc2lvbiwgeyBibG9ja2VkLCB1cGdyYWRlLCBibG9ja2luZywgdGVybWluYXRlZCB9ID0ge30pIHtcbiAgICBjb25zdCByZXF1ZXN0ID0gaW5kZXhlZERCLm9wZW4obmFtZSwgdmVyc2lvbik7XG4gICAgY29uc3Qgb3BlblByb21pc2UgPSB3cmFwKHJlcXVlc3QpO1xuICAgIGlmICh1cGdyYWRlKSB7XG4gICAgICAgIHJlcXVlc3QuYWRkRXZlbnRMaXN0ZW5lcigndXBncmFkZW5lZWRlZCcsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgdXBncmFkZSh3cmFwKHJlcXVlc3QucmVzdWx0KSwgZXZlbnQub2xkVmVyc2lvbiwgZXZlbnQubmV3VmVyc2lvbiwgd3JhcChyZXF1ZXN0LnRyYW5zYWN0aW9uKSwgZXZlbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKGJsb2NrZWQpIHtcbiAgICAgICAgcmVxdWVzdC5hZGRFdmVudExpc3RlbmVyKCdibG9ja2VkJywgKGV2ZW50KSA9PiBibG9ja2VkKFxuICAgICAgICAvLyBDYXN0aW5nIGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L1R5cGVTY3JpcHQtRE9NLWxpYi1nZW5lcmF0b3IvcHVsbC8xNDA1XG4gICAgICAgIGV2ZW50Lm9sZFZlcnNpb24sIGV2ZW50Lm5ld1ZlcnNpb24sIGV2ZW50KSk7XG4gICAgfVxuICAgIG9wZW5Qcm9taXNlXG4gICAgICAgIC50aGVuKChkYikgPT4ge1xuICAgICAgICBpZiAodGVybWluYXRlZClcbiAgICAgICAgICAgIGRiLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgKCkgPT4gdGVybWluYXRlZCgpKTtcbiAgICAgICAgaWYgKGJsb2NraW5nKSB7XG4gICAgICAgICAgICBkYi5hZGRFdmVudExpc3RlbmVyKCd2ZXJzaW9uY2hhbmdlJywgKGV2ZW50KSA9PiBibG9ja2luZyhldmVudC5vbGRWZXJzaW9uLCBldmVudC5uZXdWZXJzaW9uLCBldmVudCkpO1xuICAgICAgICB9XG4gICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHsgfSk7XG4gICAgcmV0dXJuIG9wZW5Qcm9taXNlO1xufVxuLyoqXG4gKiBEZWxldGUgYSBkYXRhYmFzZS5cbiAqXG4gKiBAcGFyYW0gbmFtZSBOYW1lIG9mIHRoZSBkYXRhYmFzZS5cbiAqL1xuZnVuY3Rpb24gZGVsZXRlREIobmFtZSwgeyBibG9ja2VkIH0gPSB7fSkge1xuICAgIGNvbnN0IHJlcXVlc3QgPSBpbmRleGVkREIuZGVsZXRlRGF0YWJhc2UobmFtZSk7XG4gICAgaWYgKGJsb2NrZWQpIHtcbiAgICAgICAgcmVxdWVzdC5hZGRFdmVudExpc3RlbmVyKCdibG9ja2VkJywgKGV2ZW50KSA9PiBibG9ja2VkKFxuICAgICAgICAvLyBDYXN0aW5nIGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L1R5cGVTY3JpcHQtRE9NLWxpYi1nZW5lcmF0b3IvcHVsbC8xNDA1XG4gICAgICAgIGV2ZW50Lm9sZFZlcnNpb24sIGV2ZW50KSk7XG4gICAgfVxuICAgIHJldHVybiB3cmFwKHJlcXVlc3QpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKTtcbn1cblxuY29uc3QgcmVhZE1ldGhvZHMgPSBbJ2dldCcsICdnZXRLZXknLCAnZ2V0QWxsJywgJ2dldEFsbEtleXMnLCAnY291bnQnXTtcbmNvbnN0IHdyaXRlTWV0aG9kcyA9IFsncHV0JywgJ2FkZCcsICdkZWxldGUnLCAnY2xlYXInXTtcbmNvbnN0IGNhY2hlZE1ldGhvZHMgPSBuZXcgTWFwKCk7XG5mdW5jdGlvbiBnZXRNZXRob2QodGFyZ2V0LCBwcm9wKSB7XG4gICAgaWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgSURCRGF0YWJhc2UgJiZcbiAgICAgICAgIShwcm9wIGluIHRhcmdldCkgJiZcbiAgICAgICAgdHlwZW9mIHByb3AgPT09ICdzdHJpbmcnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChjYWNoZWRNZXRob2RzLmdldChwcm9wKSlcbiAgICAgICAgcmV0dXJuIGNhY2hlZE1ldGhvZHMuZ2V0KHByb3ApO1xuICAgIGNvbnN0IHRhcmdldEZ1bmNOYW1lID0gcHJvcC5yZXBsYWNlKC9Gcm9tSW5kZXgkLywgJycpO1xuICAgIGNvbnN0IHVzZUluZGV4ID0gcHJvcCAhPT0gdGFyZ2V0RnVuY05hbWU7XG4gICAgY29uc3QgaXNXcml0ZSA9IHdyaXRlTWV0aG9kcy5pbmNsdWRlcyh0YXJnZXRGdW5jTmFtZSk7XG4gICAgaWYgKFxuICAgIC8vIEJhaWwgaWYgdGhlIHRhcmdldCBkb2Vzbid0IGV4aXN0IG9uIHRoZSB0YXJnZXQuIEVnLCBnZXRBbGwgaXNuJ3QgaW4gRWRnZS5cbiAgICAhKHRhcmdldEZ1bmNOYW1lIGluICh1c2VJbmRleCA/IElEQkluZGV4IDogSURCT2JqZWN0U3RvcmUpLnByb3RvdHlwZSkgfHxcbiAgICAgICAgIShpc1dyaXRlIHx8IHJlYWRNZXRob2RzLmluY2x1ZGVzKHRhcmdldEZ1bmNOYW1lKSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSBhc3luYyBmdW5jdGlvbiAoc3RvcmVOYW1lLCAuLi5hcmdzKSB7XG4gICAgICAgIC8vIGlzV3JpdGUgPyAncmVhZHdyaXRlJyA6IHVuZGVmaW5lZCBnemlwcHMgYmV0dGVyLCBidXQgZmFpbHMgaW4gRWRnZSA6KFxuICAgICAgICBjb25zdCB0eCA9IHRoaXMudHJhbnNhY3Rpb24oc3RvcmVOYW1lLCBpc1dyaXRlID8gJ3JlYWR3cml0ZScgOiAncmVhZG9ubHknKTtcbiAgICAgICAgbGV0IHRhcmdldCA9IHR4LnN0b3JlO1xuICAgICAgICBpZiAodXNlSW5kZXgpXG4gICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQuaW5kZXgoYXJncy5zaGlmdCgpKTtcbiAgICAgICAgLy8gTXVzdCByZWplY3QgaWYgb3AgcmVqZWN0cy5cbiAgICAgICAgLy8gSWYgaXQncyBhIHdyaXRlIG9wZXJhdGlvbiwgbXVzdCByZWplY3QgaWYgdHguZG9uZSByZWplY3RzLlxuICAgICAgICAvLyBNdXN0IHJlamVjdCB3aXRoIG9wIHJlamVjdGlvbiBmaXJzdC5cbiAgICAgICAgLy8gTXVzdCByZXNvbHZlIHdpdGggb3AgdmFsdWUuXG4gICAgICAgIC8vIE11c3QgaGFuZGxlIGJvdGggcHJvbWlzZXMgKG5vIHVuaGFuZGxlZCByZWplY3Rpb25zKVxuICAgICAgICByZXR1cm4gKGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIHRhcmdldFt0YXJnZXRGdW5jTmFtZV0oLi4uYXJncyksXG4gICAgICAgICAgICBpc1dyaXRlICYmIHR4LmRvbmUsXG4gICAgICAgIF0pKVswXTtcbiAgICB9O1xuICAgIGNhY2hlZE1ldGhvZHMuc2V0KHByb3AsIG1ldGhvZCk7XG4gICAgcmV0dXJuIG1ldGhvZDtcbn1cbnJlcGxhY2VUcmFwcygob2xkVHJhcHMpID0+ICh7XG4gICAgLi4ub2xkVHJhcHMsXG4gICAgZ2V0OiAodGFyZ2V0LCBwcm9wLCByZWNlaXZlcikgPT4gZ2V0TWV0aG9kKHRhcmdldCwgcHJvcCkgfHwgb2xkVHJhcHMuZ2V0KHRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpLFxuICAgIGhhczogKHRhcmdldCwgcHJvcCkgPT4gISFnZXRNZXRob2QodGFyZ2V0LCBwcm9wKSB8fCBvbGRUcmFwcy5oYXModGFyZ2V0LCBwcm9wKSxcbn0pKTtcblxuY29uc3QgYWR2YW5jZU1ldGhvZFByb3BzID0gWydjb250aW51ZScsICdjb250aW51ZVByaW1hcnlLZXknLCAnYWR2YW5jZSddO1xuY29uc3QgbWV0aG9kTWFwID0ge307XG5jb25zdCBhZHZhbmNlUmVzdWx0cyA9IG5ldyBXZWFrTWFwKCk7XG5jb25zdCBpdHRyUHJveGllZEN1cnNvclRvT3JpZ2luYWxQcm94eSA9IG5ldyBXZWFrTWFwKCk7XG5jb25zdCBjdXJzb3JJdGVyYXRvclRyYXBzID0ge1xuICAgIGdldCh0YXJnZXQsIHByb3ApIHtcbiAgICAgICAgaWYgKCFhZHZhbmNlTWV0aG9kUHJvcHMuaW5jbHVkZXMocHJvcCkpXG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0W3Byb3BdO1xuICAgICAgICBsZXQgY2FjaGVkRnVuYyA9IG1ldGhvZE1hcFtwcm9wXTtcbiAgICAgICAgaWYgKCFjYWNoZWRGdW5jKSB7XG4gICAgICAgICAgICBjYWNoZWRGdW5jID0gbWV0aG9kTWFwW3Byb3BdID0gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlUmVzdWx0cy5zZXQodGhpcywgaXR0clByb3hpZWRDdXJzb3JUb09yaWdpbmFsUHJveHkuZ2V0KHRoaXMpW3Byb3BdKC4uLmFyZ3MpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhY2hlZEZ1bmM7XG4gICAgfSxcbn07XG5hc3luYyBmdW5jdGlvbiogaXRlcmF0ZSguLi5hcmdzKSB7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLXRoaXMtYXNzaWdubWVudFxuICAgIGxldCBjdXJzb3IgPSB0aGlzO1xuICAgIGlmICghKGN1cnNvciBpbnN0YW5jZW9mIElEQkN1cnNvcikpIHtcbiAgICAgICAgY3Vyc29yID0gYXdhaXQgY3Vyc29yLm9wZW5DdXJzb3IoLi4uYXJncyk7XG4gICAgfVxuICAgIGlmICghY3Vyc29yKVxuICAgICAgICByZXR1cm47XG4gICAgY3Vyc29yID0gY3Vyc29yO1xuICAgIGNvbnN0IHByb3hpZWRDdXJzb3IgPSBuZXcgUHJveHkoY3Vyc29yLCBjdXJzb3JJdGVyYXRvclRyYXBzKTtcbiAgICBpdHRyUHJveGllZEN1cnNvclRvT3JpZ2luYWxQcm94eS5zZXQocHJveGllZEN1cnNvciwgY3Vyc29yKTtcbiAgICAvLyBNYXAgdGhpcyBkb3VibGUtcHJveHkgYmFjayB0byB0aGUgb3JpZ2luYWwsIHNvIG90aGVyIGN1cnNvciBtZXRob2RzIHdvcmsuXG4gICAgcmV2ZXJzZVRyYW5zZm9ybUNhY2hlLnNldChwcm94aWVkQ3Vyc29yLCB1bndyYXAoY3Vyc29yKSk7XG4gICAgd2hpbGUgKGN1cnNvcikge1xuICAgICAgICB5aWVsZCBwcm94aWVkQ3Vyc29yO1xuICAgICAgICAvLyBJZiBvbmUgb2YgdGhlIGFkdmFuY2luZyBtZXRob2RzIHdhcyBub3QgY2FsbGVkLCBjYWxsIGNvbnRpbnVlKCkuXG4gICAgICAgIGN1cnNvciA9IGF3YWl0IChhZHZhbmNlUmVzdWx0cy5nZXQocHJveGllZEN1cnNvcikgfHwgY3Vyc29yLmNvbnRpbnVlKCkpO1xuICAgICAgICBhZHZhbmNlUmVzdWx0cy5kZWxldGUocHJveGllZEN1cnNvcik7XG4gICAgfVxufVxuZnVuY3Rpb24gaXNJdGVyYXRvclByb3AodGFyZ2V0LCBwcm9wKSB7XG4gICAgcmV0dXJuICgocHJvcCA9PT0gU3ltYm9sLmFzeW5jSXRlcmF0b3IgJiZcbiAgICAgICAgaW5zdGFuY2VPZkFueSh0YXJnZXQsIFtJREJJbmRleCwgSURCT2JqZWN0U3RvcmUsIElEQkN1cnNvcl0pKSB8fFxuICAgICAgICAocHJvcCA9PT0gJ2l0ZXJhdGUnICYmIGluc3RhbmNlT2ZBbnkodGFyZ2V0LCBbSURCSW5kZXgsIElEQk9iamVjdFN0b3JlXSkpKTtcbn1cbnJlcGxhY2VUcmFwcygob2xkVHJhcHMpID0+ICh7XG4gICAgLi4ub2xkVHJhcHMsXG4gICAgZ2V0KHRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpIHtcbiAgICAgICAgaWYgKGlzSXRlcmF0b3JQcm9wKHRhcmdldCwgcHJvcCkpXG4gICAgICAgICAgICByZXR1cm4gaXRlcmF0ZTtcbiAgICAgICAgcmV0dXJuIG9sZFRyYXBzLmdldCh0YXJnZXQsIHByb3AsIHJlY2VpdmVyKTtcbiAgICB9LFxuICAgIGhhcyh0YXJnZXQsIHByb3ApIHtcbiAgICAgICAgcmV0dXJuIGlzSXRlcmF0b3JQcm9wKHRhcmdldCwgcHJvcCkgfHwgb2xkVHJhcHMuaGFzKHRhcmdldCwgcHJvcCk7XG4gICAgfSxcbn0pKTtcblxuZXhwb3J0IHsgZGVsZXRlREIsIG9wZW5EQiwgdW53cmFwLCB3cmFwIH07XG4iLCJpbXBvcnQgeyBvcGVuREIsIHR5cGUgREJTY2hlbWEsIHR5cGUgSURCUERhdGFiYXNlIH0gZnJvbSAnaWRiJztcblxuaW50ZXJmYWNlIFNhdmVkU3Rvcnkge1xuICBpZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICB1cmw6IHN0cmluZztcbiAgaG5Vcmw6IHN0cmluZztcbiAgc2F2ZWRBdDogbnVtYmVyO1xuICBsYXN0VmlzaXQ6IG51bWJlcjtcbiAgc2VlbkNvbW1lbnRzOiBzdHJpbmdbXTtcbiAgcmVhZENvbW1lbnRzOiBzdHJpbmdbXTtcbiAgdG90YWxDb21tZW50czogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSE5MYXRlckRCIGV4dGVuZHMgREJTY2hlbWEge1xuICBzdG9yaWVzOiB7XG4gICAga2V5OiBzdHJpbmc7XG4gICAgdmFsdWU6IFNhdmVkU3Rvcnk7XG4gICAgaW5kZXhlczogeyAnYnktc2F2ZWRBdCc6IG51bWJlciB9O1xuICB9O1xufVxuXG5sZXQgZGJQcm9taXNlOiBQcm9taXNlPElEQlBEYXRhYmFzZTxITkxhdGVyREI+PiB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBnZXREQigpOiBQcm9taXNlPElEQlBEYXRhYmFzZTxITkxhdGVyREI+PiB7XG4gIGlmICghZGJQcm9taXNlKSB7XG4gICAgZGJQcm9taXNlID0gb3BlbkRCPEhOTGF0ZXJEQj4oJ2huLWxhdGVyJywgMSwge1xuICAgICAgdXBncmFkZShkYikge1xuICAgICAgICBjb25zdCBzdG9yZSA9IGRiLmNyZWF0ZU9iamVjdFN0b3JlKCdzdG9yaWVzJywgeyBrZXlQYXRoOiAnaWQnIH0pO1xuICAgICAgICBzdG9yZS5jcmVhdGVJbmRleCgnYnktc2F2ZWRBdCcsICdzYXZlZEF0Jyk7XG4gICAgICB9LFxuICAgIH0pO1xuICB9XG4gIHJldHVybiBkYlByb21pc2U7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlSXRlbShpdGVtOiBPbWl0PFNhdmVkU3RvcnksICdzYXZlZEF0JyB8ICdsYXN0VmlzaXQnIHwgJ3NlZW5Db21tZW50cycgfCAncmVhZENvbW1lbnRzJz4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREQigpO1xuICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGRiLmdldCgnc3RvcmllcycsIGl0ZW0uaWQpO1xuICBcbiAgaWYgKGV4aXN0aW5nKSB7XG4gICAgLy8gVXBkYXRlIGV4aXN0aW5nIGl0ZW1cbiAgICBhd2FpdCBkYi5wdXQoJ3N0b3JpZXMnLCB7XG4gICAgICAuLi5leGlzdGluZyxcbiAgICAgIC4uLml0ZW0sXG4gICAgICBsYXN0VmlzaXQ6IERhdGUubm93KCksXG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gQ3JlYXRlIG5ldyBpdGVtXG4gICAgYXdhaXQgZGIuYWRkKCdzdG9yaWVzJywge1xuICAgICAgLi4uaXRlbSxcbiAgICAgIHNhdmVkQXQ6IERhdGUubm93KCksXG4gICAgICBsYXN0VmlzaXQ6IERhdGUubm93KCksXG4gICAgICBzZWVuQ29tbWVudHM6IFtdLFxuICAgICAgcmVhZENvbW1lbnRzOiBbXSxcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVtb3ZlSXRlbShzdG9yeUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREQigpO1xuICBhd2FpdCBkYi5kZWxldGUoJ3N0b3JpZXMnLCBzdG9yeUlkKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEl0ZW0oc3RvcnlJZDogc3RyaW5nKTogUHJvbWlzZTxTYXZlZFN0b3J5IHwgdW5kZWZpbmVkPiB7XG4gIGNvbnN0IGRiID0gYXdhaXQgZ2V0REIoKTtcbiAgcmV0dXJuIGRiLmdldCgnc3RvcmllcycsIHN0b3J5SWQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0SXRlbXMoKTogUHJvbWlzZTxTYXZlZFN0b3J5W10+IHtcbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREQigpO1xuICBjb25zdCBpdGVtcyA9IGF3YWl0IGRiLmdldEFsbEZyb21JbmRleCgnc3RvcmllcycsICdieS1zYXZlZEF0Jyk7XG4gIHJldHVybiBpdGVtcy5yZXZlcnNlKCk7IC8vIE1vc3QgcmVjZW50IGZpcnN0XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpc0l0ZW1TYXZlZChzdG9yeUlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREQigpO1xuICBjb25zdCBpdGVtID0gYXdhaXQgZGIuZ2V0KCdzdG9yaWVzJywgc3RvcnlJZCk7XG4gIHJldHVybiAhIWl0ZW07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVDb21tZW50cyhcbiAgc3RvcnlJZDogc3RyaW5nLFxuICBzZWVuQ29tbWVudElkczogc3RyaW5nW10sXG4gIHJlYWRDb21tZW50SWRzOiBzdHJpbmdbXSxcbiAgdG90YWxDb21tZW50czogbnVtYmVyXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREQigpO1xuICBjb25zdCBpdGVtID0gYXdhaXQgZGIuZ2V0KCdzdG9yaWVzJywgc3RvcnlJZCk7XG4gIGlmICghaXRlbSkgcmV0dXJuO1xuXG4gIC8vIE1lcmdlIHdpdGggZXhpc3RpbmcgLSB1c2UgU2V0IHRvIGRlZHVwZVxuICBjb25zdCBzZWVuU2V0ID0gbmV3IFNldChbLi4uaXRlbS5zZWVuQ29tbWVudHMsIC4uLnNlZW5Db21tZW50SWRzXSk7XG4gIGNvbnN0IHJlYWRTZXQgPSBuZXcgU2V0KFsuLi5pdGVtLnJlYWRDb21tZW50cywgLi4ucmVhZENvbW1lbnRJZHNdKTtcblxuICBhd2FpdCBkYi5wdXQoJ3N0b3JpZXMnLCB7XG4gICAgLi4uaXRlbSxcbiAgICBzZWVuQ29tbWVudHM6IEFycmF5LmZyb20oc2VlblNldCksXG4gICAgcmVhZENvbW1lbnRzOiBBcnJheS5mcm9tKHJlYWRTZXQpLFxuICAgIHRvdGFsQ29tbWVudHMsXG4gICAgbGFzdFZpc2l0OiBEYXRlLm5vdygpLFxuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFByb2dyZXNzKHN0b3J5SWQ6IHN0cmluZyk6IFByb21pc2U8e1xuICBzZWVuQ29tbWVudHM6IFNldDxzdHJpbmc+O1xuICByZWFkQ29tbWVudHM6IFNldDxzdHJpbmc+O1xuICB0b3RhbENvbW1lbnRzOiBudW1iZXI7XG4gIHJlYWRQcm9ncmVzczogbnVtYmVyO1xufSB8IG51bGw+IHtcbiAgY29uc3QgZGIgPSBhd2FpdCBnZXREQigpO1xuICBjb25zdCBpdGVtID0gYXdhaXQgZGIuZ2V0KCdzdG9yaWVzJywgc3RvcnlJZCk7XG4gIGlmICghaXRlbSkgcmV0dXJuIG51bGw7XG5cbiAgY29uc3QgcmVhZFByb2dyZXNzID0gaXRlbS50b3RhbENvbW1lbnRzID4gMFxuICAgID8gTWF0aC5yb3VuZCgoaXRlbS5yZWFkQ29tbWVudHMubGVuZ3RoIC8gaXRlbS50b3RhbENvbW1lbnRzKSAqIDEwMClcbiAgICA6IDA7XG5cbiAgcmV0dXJuIHtcbiAgICBzZWVuQ29tbWVudHM6IG5ldyBTZXQoaXRlbS5zZWVuQ29tbWVudHMpLFxuICAgIHJlYWRDb21tZW50czogbmV3IFNldChpdGVtLnJlYWRDb21tZW50cyksXG4gICAgdG90YWxDb21tZW50czogaXRlbS50b3RhbENvbW1lbnRzLFxuICAgIHJlYWRQcm9ncmVzcyxcbiAgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4cG9ydERhdGEoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgaXRlbXMgPSBhd2FpdCBnZXRJdGVtcygpO1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyB2ZXJzaW9uOiAxLCBzdG9yaWVzOiBpdGVtcyB9LCBudWxsLCAyKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGltcG9ydERhdGEoanNvbjogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoanNvbik7XG4gIGlmIChkYXRhLnZlcnNpb24gIT09IDEgfHwgIUFycmF5LmlzQXJyYXkoZGF0YS5zdG9yaWVzKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBiYWNrdXAgZm9ybWF0Jyk7XG4gIH1cbiAgXG4gIGNvbnN0IGRiID0gYXdhaXQgZ2V0REIoKTtcbiAgbGV0IGltcG9ydGVkID0gMDtcbiAgXG4gIGZvciAoY29uc3Qgc3Rvcnkgb2YgZGF0YS5zdG9yaWVzKSB7XG4gICAgYXdhaXQgZGIucHV0KCdzdG9yaWVzJywgc3RvcnkpO1xuICAgIGltcG9ydGVkKys7XG4gIH1cbiAgXG4gIHJldHVybiBpbXBvcnRlZDtcbn1cblxuZXhwb3J0IHR5cGUgeyBTYXZlZFN0b3J5IH07XG4iLCJpbXBvcnQgeyBzYXZlSXRlbSwgcmVtb3ZlSXRlbSwgaXNJdGVtU2F2ZWQsIGdldEl0ZW0sIHVwZGF0ZUNvbW1lbnRzLCBnZXRQcm9ncmVzcyB9IGZyb20gJ0AvbGliL3N0b3JhZ2UnO1xuaW1wb3J0ICcuL2NvbnRlbnQtc3R5bGVzLmNzcyc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbnRlbnRTY3JpcHQoe1xuICBtYXRjaGVzOiBbJyo6Ly9uZXdzLnljb21iaW5hdG9yLmNvbS8qJ10sXG4gIG1haW4oKSB7XG4gICAgY29uc3QgaXNJdGVtUGFnZSA9IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSA9PT0gJy9pdGVtJztcbiAgICBjb25zdCBzdG9yeUlkID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoJ2lkJyk7XG5cbiAgICBpZiAoaXNJdGVtUGFnZSAmJiBzdG9yeUlkKSB7XG4gICAgICBpbml0Q29tbWVudFRyYWNraW5nKHN0b3J5SWQpO1xuICAgIH1cblxuICAgIGluaXRTYXZlQnV0dG9ucygpO1xuICB9LFxufSk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTQVZFIEJVVFRPTlNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmFzeW5jIGZ1bmN0aW9uIGluaXRTYXZlQnV0dG9ucygpIHtcbiAgLy8gRmluZCBhbGwgc3Rvcnkgcm93cyBvbiB0aGUgcGFnZVxuICBjb25zdCBzdG9yeVJvd3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxUYWJsZVJvd0VsZW1lbnQ+KCd0ci5hdGhpbmc6bm90KC5jb210ciknKTtcblxuICBmb3IgKGNvbnN0IHJvdyBvZiBzdG9yeVJvd3MpIHtcbiAgICBjb25zdCBpZCA9IHJvdy5pZDtcbiAgICBpZiAoIWlkKSBjb250aW51ZTtcblxuICAgIGNvbnN0IHRpdGxlQ2VsbCA9IHJvdy5xdWVyeVNlbGVjdG9yKCd0ZC50aXRsZTpsYXN0LWNoaWxkJyk7XG4gICAgY29uc3QgdGl0bGVMaW5rID0gdGl0bGVDZWxsPy5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignYS50aXRsZWxpbmUgPiBhLCBzcGFuLnRpdGxlbGluZSA+IGEnKTtcbiAgICBpZiAoIXRpdGxlQ2VsbCB8fCAhdGl0bGVMaW5rKSBjb250aW51ZTtcblxuICAgIC8vIENyZWF0ZSBzYXZlIGJ1dHRvblxuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGJ0bi5jbGFzc05hbWUgPSAnaG4tbGF0ZXItc2F2ZS1idG4nO1xuICAgIGJ0bi5kYXRhc2V0LnN0b3J5SWQgPSBpZDtcblxuICAgIGNvbnN0IGlzU2F2ZWQgPSBhd2FpdCBpc0l0ZW1TYXZlZChpZCk7XG4gICAgYnRuLmNsYXNzTGlzdC50b2dnbGUoJ3NhdmVkJywgaXNTYXZlZCk7XG4gICAgYnRuLnRleHRDb250ZW50ID0gaXNTYXZlZCA/ICfwn5OMJyA6ICfwn5ONJztcbiAgICBidG4udGl0bGUgPSBpc1NhdmVkID8gJ1JlbW92ZSBmcm9tIFJlYWQgTGF0ZXInIDogJ1NhdmUgZm9yIExhdGVyJztcblxuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgYXdhaXQgdG9nZ2xlU2F2ZShidG4sIHRpdGxlTGluayk7XG4gICAgfSk7XG5cbiAgICAvLyBJbnNlcnQgYmVmb3JlIHRpdGxlXG4gICAgdGl0bGVDZWxsLmluc2VydEJlZm9yZShidG4sIHRpdGxlQ2VsbC5maXJzdENoaWxkKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiB0b2dnbGVTYXZlKGJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQsIHRpdGxlTGluazogSFRNTEFuY2hvckVsZW1lbnQpIHtcbiAgY29uc3Qgc3RvcnlJZCA9IGJ0bi5kYXRhc2V0LnN0b3J5SWQhO1xuICBjb25zdCBpc1NhdmVkID0gYnRuLmNsYXNzTGlzdC5jb250YWlucygnc2F2ZWQnKTtcblxuICBpZiAoaXNTYXZlZCkge1xuICAgIGF3YWl0IHJlbW92ZUl0ZW0oc3RvcnlJZCk7XG4gICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoJ3NhdmVkJyk7XG4gICAgYnRuLnRleHRDb250ZW50ID0gJ/Cfk40nO1xuICAgIGJ0bi50aXRsZSA9ICdTYXZlIGZvciBMYXRlcic7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgdGl0bGUgPSB0aXRsZUxpbmsudGV4dENvbnRlbnQgfHwgJ1VudGl0bGVkJztcbiAgICBjb25zdCB1cmwgPSB0aXRsZUxpbmsuaHJlZjtcbiAgICBjb25zdCBoblVybCA9IGBodHRwczovL25ld3MueWNvbWJpbmF0b3IuY29tL2l0ZW0/aWQ9JHtzdG9yeUlkfWA7XG5cbiAgICAvLyBHZXQgY29tbWVudCBjb3VudCBmcm9tIHN1YnRleHRcbiAgICBjb25zdCBzdWJ0ZXh0Um93ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3RvcnlJZCk/Lm5leHRFbGVtZW50U2libGluZztcbiAgICBjb25zdCBjb21tZW50TGluayA9IHN1YnRleHRSb3c/LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhW2hyZWYqPVwiaXRlbT9pZD1cIl0nKTtcbiAgICBjb25zdCBjb21tZW50VGV4dCA9IGNvbW1lbnRMaW5rPy50ZXh0Q29udGVudCB8fCAnJztcbiAgICBjb25zdCBjb21tZW50TWF0Y2ggPSBjb21tZW50VGV4dC5tYXRjaCgvKFxcZCspXFxzKmNvbW1lbnQvKTtcbiAgICBjb25zdCB0b3RhbENvbW1lbnRzID0gY29tbWVudE1hdGNoID8gcGFyc2VJbnQoY29tbWVudE1hdGNoWzFdLCAxMCkgOiAwO1xuXG4gICAgYXdhaXQgc2F2ZUl0ZW0oe1xuICAgICAgaWQ6IHN0b3J5SWQsXG4gICAgICB0aXRsZSxcbiAgICAgIHVybCxcbiAgICAgIGhuVXJsLFxuICAgICAgdG90YWxDb21tZW50cyxcbiAgICB9KTtcbiAgICBidG4uY2xhc3NMaXN0LmFkZCgnc2F2ZWQnKTtcbiAgICBidG4udGV4dENvbnRlbnQgPSAn8J+TjCc7XG4gICAgYnRuLnRpdGxlID0gJ1JlbW92ZSBmcm9tIFJlYWQgTGF0ZXInO1xuICB9XG5cbiAgLy8gVXBkYXRlIGJhZGdlIGNvdW50XG4gIGNvbnN0IGl0ZW1zID0gYXdhaXQgKGF3YWl0IGltcG9ydCgnQC9saWIvc3RvcmFnZScpKS5nZXRJdGVtcygpO1xuICBhd2FpdCBicm93c2VyLnN0b3JhZ2UubG9jYWwuc2V0KHsgaXRlbUNvdW50OiBpdGVtcy5sZW5ndGggfSk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBDT01NRU5UIFRSQUNLSU5HXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5hc3luYyBmdW5jdGlvbiBpbml0Q29tbWVudFRyYWNraW5nKHN0b3J5SWQ6IHN0cmluZykge1xuICAvLyBDaGVjayBpZiB0aGlzIHN0b3J5IGlzIHNhdmVkXG4gIGNvbnN0IHN0b3J5RGF0YSA9IGF3YWl0IGdldEl0ZW0oc3RvcnlJZCk7XG4gIGlmICghc3RvcnlEYXRhKSByZXR1cm47IC8vIE9ubHkgdHJhY2sgc2F2ZWQgc3Rvcmllc1xuXG4gIC8vIEdldCBhbGwgY29tbWVudCBlbGVtZW50c1xuICBjb25zdCBjb21tZW50cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTFRhYmxlUm93RWxlbWVudD4oJ3RyLmF0aGluZy5jb210cicpO1xuICBpZiAoY29tbWVudHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgLy8gR2V0IGV4aXN0aW5nIHByb2dyZXNzXG4gIGNvbnN0IHByb2dyZXNzID0gYXdhaXQgZ2V0UHJvZ3Jlc3Moc3RvcnlJZCk7XG4gIGNvbnN0IHNlZW5TZXQgPSBwcm9ncmVzcz8uc2VlbkNvbW1lbnRzIHx8IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb25zdCByZWFkU2V0ID0gcHJvZ3Jlc3M/LnJlYWRDb21tZW50cyB8fCBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAvLyBNYXJrIGFscmVhZHktcmVhZCBjb21tZW50c1xuICBjb21tZW50cy5mb3JFYWNoKChjb21tZW50KSA9PiB7XG4gICAgY29uc3QgY29tbWVudElkID0gY29tbWVudC5pZDtcbiAgICBpZiAocmVhZFNldC5oYXMoY29tbWVudElkKSkge1xuICAgICAgY29tbWVudC5jbGFzc0xpc3QuYWRkKCdobi1sYXRlci1yZWFkJyk7XG4gICAgfSBlbHNlIGlmICghc2VlblNldC5oYXMoY29tbWVudElkKSkge1xuICAgICAgY29tbWVudC5jbGFzc0xpc3QuYWRkKCdobi1sYXRlci1uZXcnKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENyZWF0ZSBzY3JvbGxiYXIgbWFya2Vyc1xuICBjcmVhdGVTY3JvbGxiYXJNYXJrZXJzKGNvbW1lbnRzLCBzZWVuU2V0LCByZWFkU2V0KTtcblxuICAvLyBDcmVhdGUganVtcCBidXR0b25cbiAgY3JlYXRlSnVtcEJ1dHRvbihjb21tZW50cywgcmVhZFNldCk7XG5cbiAgLy8gSGFuZGxlICNobi1sYXRlci11bnJlYWQgaW4gVVJMXG4gIGlmICh3aW5kb3cubG9jYXRpb24uaGFzaCA9PT0gJyNobi1sYXRlci11bnJlYWQnKSB7XG4gICAgc2Nyb2xsVG9GaXJzdFVucmVhZChjb21tZW50cywgcmVhZFNldCk7XG4gICAgaGlzdG9yeS5yZXBsYWNlU3RhdGUobnVsbCwgJycsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArIHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICB9XG5cbiAgLy8gVHJhY2sgdmlzaWJpbGl0eSB3aXRoIEludGVyc2VjdGlvbk9ic2VydmVyXG4gIGNvbnN0IG5ld2x5U2Vlbjogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgbmV3bHlSZWFkOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCByZWFkVGltZXJzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuICBjb25zdCBvYnNlcnZlciA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlcihcbiAgICAoZW50cmllcykgPT4ge1xuICAgICAgZW50cmllcy5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgICBjb25zdCBjb21tZW50SWQgPSAoZW50cnkudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS5pZDtcblxuICAgICAgICBpZiAoZW50cnkuaXNJbnRlcnNlY3RpbmcpIHtcbiAgICAgICAgICAvLyBNYXJrIGFzIHNlZW4gaW1tZWRpYXRlbHlcbiAgICAgICAgICBpZiAoIXNlZW5TZXQuaGFzKGNvbW1lbnRJZCkpIHtcbiAgICAgICAgICAgIHNlZW5TZXQuYWRkKGNvbW1lbnRJZCk7XG4gICAgICAgICAgICBuZXdseVNlZW4ucHVzaChjb21tZW50SWQpO1xuICAgICAgICAgICAgZW50cnkudGFyZ2V0LmNsYXNzTGlzdC5yZW1vdmUoJ2huLWxhdGVyLW5ldycpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFN0YXJ0IHJlYWQgdGltZXIgKDUwMG1zIHZpc2liaWxpdHkgPSByZWFkKVxuICAgICAgICAgIGlmICghcmVhZFNldC5oYXMoY29tbWVudElkKSAmJiAhcmVhZFRpbWVycy5oYXMoY29tbWVudElkKSkge1xuICAgICAgICAgICAgY29uc3QgdGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgIHJlYWRTZXQuYWRkKGNvbW1lbnRJZCk7XG4gICAgICAgICAgICAgIG5ld2x5UmVhZC5wdXNoKGNvbW1lbnRJZCk7XG4gICAgICAgICAgICAgIGVudHJ5LnRhcmdldC5jbGFzc0xpc3QuYWRkKCdobi1sYXRlci1yZWFkJyk7XG4gICAgICAgICAgICAgIHJlYWRUaW1lcnMuZGVsZXRlKGNvbW1lbnRJZCk7XG4gICAgICAgICAgICAgIHVwZGF0ZU1hcmtlcihjb21tZW50SWQsICdyZWFkJyk7XG4gICAgICAgICAgICB9LCA1MDApO1xuICAgICAgICAgICAgcmVhZFRpbWVycy5zZXQoY29tbWVudElkLCB0aW1lcik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIENhbmNlbCByZWFkIHRpbWVyIGlmIHNjcm9sbGVkIGF3YXlcbiAgICAgICAgICBjb25zdCB0aW1lciA9IHJlYWRUaW1lcnMuZ2V0KGNvbW1lbnRJZCk7XG4gICAgICAgICAgaWYgKHRpbWVyKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgICAgICAgICAgcmVhZFRpbWVycy5kZWxldGUoY29tbWVudElkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0sXG4gICAgeyB0aHJlc2hvbGQ6IDAuNSB9XG4gICk7XG5cbiAgY29tbWVudHMuZm9yRWFjaCgoY29tbWVudCkgPT4gb2JzZXJ2ZXIub2JzZXJ2ZShjb21tZW50KSk7XG5cbiAgLy8gU2F2ZSBwcm9ncmVzcyBvbiBwYWdlIHVubG9hZFxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignYmVmb3JldW5sb2FkJywgKCkgPT4ge1xuICAgIGlmIChuZXdseVNlZW4ubGVuZ3RoID4gMCB8fCBuZXdseVJlYWQubGVuZ3RoID4gMCkge1xuICAgICAgdXBkYXRlQ29tbWVudHMoc3RvcnlJZCwgbmV3bHlTZWVuLCBuZXdseVJlYWQsIGNvbW1lbnRzLmxlbmd0aCk7XG4gICAgfVxuICB9KTtcblxuICAvLyBBbHNvIHNhdmUgcGVyaW9kaWNhbGx5XG4gIHNldEludGVydmFsKCgpID0+IHtcbiAgICBpZiAobmV3bHlTZWVuLmxlbmd0aCA+IDAgfHwgbmV3bHlSZWFkLmxlbmd0aCA+IDApIHtcbiAgICAgIHVwZGF0ZUNvbW1lbnRzKHN0b3J5SWQsIFsuLi5uZXdseVNlZW5dLCBbLi4ubmV3bHlSZWFkXSwgY29tbWVudHMubGVuZ3RoKTtcbiAgICAgIG5ld2x5U2Vlbi5sZW5ndGggPSAwO1xuICAgICAgbmV3bHlSZWFkLmxlbmd0aCA9IDA7XG4gICAgfVxuICB9LCA1MDAwKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNDUk9MTEJBUiBNQVJLRVJTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5sZXQgbWFya2Vyc0NvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmNvbnN0IG1hcmtlck1hcCA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRGl2RWxlbWVudD4oKTtcblxuZnVuY3Rpb24gY3JlYXRlU2Nyb2xsYmFyTWFya2VycyhcbiAgY29tbWVudHM6IE5vZGVMaXN0T2Y8SFRNTFRhYmxlUm93RWxlbWVudD4sXG4gIHNlZW5TZXQ6IFNldDxzdHJpbmc+LFxuICByZWFkU2V0OiBTZXQ8c3RyaW5nPlxuKSB7XG4gIG1hcmtlcnNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgbWFya2Vyc0NvbnRhaW5lci5jbGFzc05hbWUgPSAnaG4tbGF0ZXItc2Nyb2xsYmFyJztcblxuICBjb25zdCBkb2NIZWlnaHQgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsSGVpZ2h0O1xuXG4gIGNvbW1lbnRzLmZvckVhY2goKGNvbW1lbnQpID0+IHtcbiAgICBjb25zdCBjb21tZW50SWQgPSBjb21tZW50LmlkO1xuICAgIGNvbnN0IHJlY3QgPSBjb21tZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHRvcCA9IChyZWN0LnRvcCArIHdpbmRvdy5zY3JvbGxZKSAvIGRvY0hlaWdodDtcblxuICAgIGNvbnN0IG1hcmtlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG1hcmtlci5jbGFzc05hbWUgPSAnaG4tbGF0ZXItbWFya2VyJztcbiAgICBtYXJrZXIuZGF0YXNldC5jb21tZW50SWQgPSBjb21tZW50SWQ7XG5cbiAgICBpZiAocmVhZFNldC5oYXMoY29tbWVudElkKSkge1xuICAgICAgbWFya2VyLmNsYXNzTGlzdC5hZGQoJ3JlYWQnKTtcbiAgICB9IGVsc2UgaWYgKCFzZWVuU2V0Lmhhcyhjb21tZW50SWQpKSB7XG4gICAgICBtYXJrZXIuY2xhc3NMaXN0LmFkZCgnbmV3Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1hcmtlci5jbGFzc0xpc3QuYWRkKCd1bnJlYWQnKTtcbiAgICB9XG5cbiAgICBtYXJrZXIuc3R5bGUudG9wID0gYCR7dG9wICogMTAwfSVgO1xuICAgIG1hcmtlci5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnY2VudGVyJyB9KTtcbiAgICB9KTtcblxuICAgIG1hcmtlcnNDb250YWluZXIhLmFwcGVuZENoaWxkKG1hcmtlcik7XG4gICAgbWFya2VyTWFwLnNldChjb21tZW50SWQsIG1hcmtlcik7XG4gIH0pO1xuXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobWFya2Vyc0NvbnRhaW5lcik7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZU1hcmtlcihjb21tZW50SWQ6IHN0cmluZywgc3RhdHVzOiAncmVhZCcgfCAnc2VlbicpIHtcbiAgY29uc3QgbWFya2VyID0gbWFya2VyTWFwLmdldChjb21tZW50SWQpO1xuICBpZiAobWFya2VyKSB7XG4gICAgbWFya2VyLmNsYXNzTGlzdC5yZW1vdmUoJ25ldycsICd1bnJlYWQnKTtcbiAgICBtYXJrZXIuY2xhc3NMaXN0LmFkZChzdGF0dXMgPT09ICdyZWFkJyA/ICdyZWFkJyA6ICd1bnJlYWQnKTtcbiAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSlVNUCBUTyBVTlJFQUQgQlVUVE9OXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBjcmVhdGVKdW1wQnV0dG9uKGNvbW1lbnRzOiBOb2RlTGlzdE9mPEhUTUxUYWJsZVJvd0VsZW1lbnQ+LCByZWFkU2V0OiBTZXQ8c3RyaW5nPikge1xuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgYnRuLmNsYXNzTmFtZSA9ICdobi1sYXRlci1qdW1wLWJ0bic7XG4gIGJ0bi5pbm5lckhUTUwgPSAn4qyH77iPIE5leHQgVW5yZWFkJztcbiAgYnRuLnRpdGxlID0gJ0p1bXAgdG8gbmV4dCB1bnJlYWQgY29tbWVudCc7XG5cbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgIHNjcm9sbFRvRmlyc3RVbnJlYWQoY29tbWVudHMsIHJlYWRTZXQpO1xuICB9KTtcblxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGJ0bik7XG5cbiAgLy8gVXBkYXRlIHZpc2liaWxpdHkgYmFzZWQgb24gc2Nyb2xsIHBvc2l0aW9uXG4gIGNvbnN0IHVwZGF0ZUp1bXBCdXR0b24gPSAoKSA9PiB7XG4gICAgY29uc3QgaGFzVW5yZWFkQmVsb3cgPSBBcnJheS5mcm9tKGNvbW1lbnRzKS5zb21lKChjb21tZW50KSA9PiB7XG4gICAgICBpZiAocmVhZFNldC5oYXMoY29tbWVudC5pZCkpIHJldHVybiBmYWxzZTtcbiAgICAgIGNvbnN0IHJlY3QgPSBjb21tZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgcmV0dXJuIHJlY3QudG9wID4gd2luZG93LmlubmVySGVpZ2h0O1xuICAgIH0pO1xuICAgIGJ0bi5zdHlsZS5kaXNwbGF5ID0gaGFzVW5yZWFkQmVsb3cgPyAnYmxvY2snIDogJ25vbmUnO1xuICB9O1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzY3JvbGwnLCB1cGRhdGVKdW1wQnV0dG9uLCB7IHBhc3NpdmU6IHRydWUgfSk7XG4gIHVwZGF0ZUp1bXBCdXR0b24oKTtcbn1cblxuZnVuY3Rpb24gc2Nyb2xsVG9GaXJzdFVucmVhZChjb21tZW50czogTm9kZUxpc3RPZjxIVE1MVGFibGVSb3dFbGVtZW50PiwgcmVhZFNldDogU2V0PHN0cmluZz4pIHtcbiAgZm9yIChjb25zdCBjb21tZW50IG9mIGNvbW1lbnRzKSB7XG4gICAgaWYgKCFyZWFkU2V0Lmhhcyhjb21tZW50LmlkKSkge1xuICAgICAgY29uc3QgcmVjdCA9IGNvbW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAocmVjdC50b3AgPiB3aW5kb3cuaW5uZXJIZWlnaHQgKiAwLjMgfHwgcmVjdC50b3AgPCAwKSB7XG4gICAgICAgIGNvbW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnY2VudGVyJyB9KTtcbiAgICAgICAgY29tbWVudC5jbGFzc0xpc3QuYWRkKCdobi1sYXRlci1oaWdobGlnaHQnKTtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBjb21tZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2huLWxhdGVyLWhpZ2hsaWdodCcpLCAyMDAwKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iLCJmdW5jdGlvbiBwcmludChtZXRob2QsIC4uLmFyZ3MpIHtcbiAgaWYgKGltcG9ydC5tZXRhLmVudi5NT0RFID09PSBcInByb2R1Y3Rpb25cIikgcmV0dXJuO1xuICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09IFwic3RyaW5nXCIpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gYXJncy5zaGlmdCgpO1xuICAgIG1ldGhvZChgW3d4dF0gJHttZXNzYWdlfWAsIC4uLmFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xuICB9XG59XG5leHBvcnQgY29uc3QgbG9nZ2VyID0ge1xuICBkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuICBsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG4gIHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuICBlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuIiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuZXhwb3J0IGNsYXNzIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG4gIGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG4gICAgc3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG4gICAgdGhpcy5uZXdVcmwgPSBuZXdVcmw7XG4gICAgdGhpcy5vbGRVcmwgPSBvbGRVcmw7XG4gIH1cbiAgc3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG59XG5leHBvcnQgZnVuY3Rpb24gZ2V0VW5pcXVlRXZlbnROYW1lKGV2ZW50TmFtZSkge1xuICByZXR1cm4gYCR7YnJvd3Nlcj8ucnVudGltZT8uaWR9OiR7aW1wb3J0Lm1ldGEuZW52LkVOVFJZUE9JTlR9OiR7ZXZlbnROYW1lfWA7XG59XG4iLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVMb2NhdGlvbldhdGNoZXIoY3R4KSB7XG4gIGxldCBpbnRlcnZhbDtcbiAgbGV0IG9sZFVybDtcbiAgcmV0dXJuIHtcbiAgICAvKipcbiAgICAgKiBFbnN1cmUgdGhlIGxvY2F0aW9uIHdhdGNoZXIgaXMgYWN0aXZlbHkgbG9va2luZyBmb3IgVVJMIGNoYW5nZXMuIElmIGl0J3MgYWxyZWFkeSB3YXRjaGluZyxcbiAgICAgKiB0aGlzIGlzIGEgbm9vcC5cbiAgICAgKi9cbiAgICBydW4oKSB7XG4gICAgICBpZiAoaW50ZXJ2YWwgIT0gbnVsbCkgcmV0dXJuO1xuICAgICAgb2xkVXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcbiAgICAgIGludGVydmFsID0gY3R4LnNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgbGV0IG5ld1VybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG4gICAgICAgIGlmIChuZXdVcmwuaHJlZiAhPT0gb2xkVXJsLmhyZWYpIHtcbiAgICAgICAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIG9sZFVybCkpO1xuICAgICAgICAgIG9sZFVybCA9IG5ld1VybDtcbiAgICAgICAgfVxuICAgICAgfSwgMWUzKTtcbiAgICB9XG4gIH07XG59XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tIFwiLi4vdXRpbHMvaW50ZXJuYWwvbG9nZ2VyLm1qc1wiO1xuaW1wb3J0IHtcbiAgZ2V0VW5pcXVlRXZlbnROYW1lXG59IGZyb20gXCIuL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuZXhwb3J0IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcbiAgY29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcbiAgICB0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLmFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBpZiAodGhpcy5pc1RvcEZyYW1lKSB7XG4gICAgICB0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cyh7IGlnbm9yZUZpcnN0RXZlbnQ6IHRydWUgfSk7XG4gICAgICB0aGlzLnN0b3BPbGRTY3JpcHRzKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG4gICAgfVxuICB9XG4gIHN0YXRpYyBTQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXG4gICAgXCJ3eHQ6Y29udGVudC1zY3JpcHQtc3RhcnRlZFwiXG4gICk7XG4gIGlzVG9wRnJhbWUgPSB3aW5kb3cuc2VsZiA9PT0gd2luZG93LnRvcDtcbiAgYWJvcnRDb250cm9sbGVyO1xuICBsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG4gIHJlY2VpdmVkTWVzc2FnZUlkcyA9IC8qIEBfX1BVUkVfXyAqLyBuZXcgU2V0KCk7XG4gIGdldCBzaWduYWwoKSB7XG4gICAgcmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcbiAgfVxuICBhYm9ydChyZWFzb24pIHtcbiAgICByZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcbiAgfVxuICBnZXQgaXNJbnZhbGlkKCkge1xuICAgIGlmIChicm93c2VyLnJ1bnRpbWUuaWQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcbiAgfVxuICBnZXQgaXNWYWxpZCgpIHtcbiAgICByZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuICB9XG4gIC8qKlxuICAgKiBBZGQgYSBsaXN0ZW5lciB0aGF0IGlzIGNhbGxlZCB3aGVuIHRoZSBjb250ZW50IHNjcmlwdCdzIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoZSBsaXN0ZW5lci5cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG4gICAqIGNvbnN0IHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIgPSBjdHgub25JbnZhbGlkYXRlZCgoKSA9PiB7XG4gICAqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihjYik7XG4gICAqIH0pXG4gICAqIC8vIC4uLlxuICAgKiByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG4gICAqL1xuICBvbkludmFsaWRhdGVkKGNiKSB7XG4gICAgdGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgICByZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcbiAgfVxuICAvKipcbiAgICogUmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLiBVc2VmdWwgaWYgeW91IGhhdmUgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBzaG91bGRuJ3QgcnVuXG4gICAqIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGNvbnN0IGdldFZhbHVlRnJvbVN0b3JhZ2UgPSBhc3luYyAoKSA9PiB7XG4gICAqICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcbiAgICpcbiAgICogICAvLyAuLi5cbiAgICogfVxuICAgKi9cbiAgYmxvY2soKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHtcbiAgICB9KTtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogSW50ZXJ2YWxzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2xlYXJJbnRlcnZhbGAgZnVuY3Rpb24uXG4gICAqL1xuICBzZXRJbnRlcnZhbChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG4gICAgfSwgdGltZW91dCk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFySW50ZXJ2YWwoaWQpKTtcbiAgICByZXR1cm4gaWQ7XG4gIH1cbiAgLyoqXG4gICAqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0VGltZW91dGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cbiAgICpcbiAgICogVGltZW91dHMgY2FuIGJlIGNsZWFyZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBzZXRUaW1lb3V0YCBmdW5jdGlvbi5cbiAgICovXG4gIHNldFRpbWVvdXQoaGFuZGxlciwgdGltZW91dCkge1xuICAgIGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG4gICAgfSwgdGltZW91dCk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFyVGltZW91dChpZCkpO1xuICAgIHJldHVybiBpZDtcbiAgfVxuICAvKipcbiAgICogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWVgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cbiAgICogaW52YWxpZGF0ZWQuXG4gICAqXG4gICAqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxBbmltYXRpb25GcmFtZWAgZnVuY3Rpb24uXG4gICAqL1xuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoY2FsbGJhY2spIHtcbiAgICBjb25zdCBpZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoLi4uYXJncykgPT4ge1xuICAgICAgaWYgKHRoaXMuaXNWYWxpZCkgY2FsbGJhY2soLi4uYXJncyk7XG4gICAgfSk7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbEFuaW1hdGlvbkZyYW1lKGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIC8qKlxuICAgKiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RJZGxlQ2FsbGJhY2tgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cbiAgICogaW52YWxpZGF0ZWQuXG4gICAqXG4gICAqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxJZGxlQ2FsbGJhY2tgIGZ1bmN0aW9uLlxuICAgKi9cbiAgcmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjaywgb3B0aW9ucykge1xuICAgIGNvbnN0IGlkID0gcmVxdWVzdElkbGVDYWxsYmFjaygoLi4uYXJncykgPT4ge1xuICAgICAgaWYgKCF0aGlzLnNpZ25hbC5hYm9ydGVkKSBjYWxsYmFjayguLi5hcmdzKTtcbiAgICB9LCBvcHRpb25zKTtcbiAgICB0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsSWRsZUNhbGxiYWNrKGlkKSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIGFkZEV2ZW50TGlzdGVuZXIodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGUgPT09IFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpIHtcbiAgICAgIGlmICh0aGlzLmlzVmFsaWQpIHRoaXMubG9jYXRpb25XYXRjaGVyLnJ1bigpO1xuICAgIH1cbiAgICB0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcj8uKFxuICAgICAgdHlwZS5zdGFydHNXaXRoKFwid3h0OlwiKSA/IGdldFVuaXF1ZUV2ZW50TmFtZSh0eXBlKSA6IHR5cGUsXG4gICAgICBoYW5kbGVyLFxuICAgICAge1xuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgICBzaWduYWw6IHRoaXMuc2lnbmFsXG4gICAgICB9XG4gICAgKTtcbiAgfVxuICAvKipcbiAgICogQGludGVybmFsXG4gICAqIEFib3J0IHRoZSBhYm9ydCBjb250cm9sbGVyIGFuZCBleGVjdXRlIGFsbCBgb25JbnZhbGlkYXRlZGAgbGlzdGVuZXJzLlxuICAgKi9cbiAgbm90aWZ5SW52YWxpZGF0ZWQoKSB7XG4gICAgdGhpcy5hYm9ydChcIkNvbnRlbnQgc2NyaXB0IGNvbnRleHQgaW52YWxpZGF0ZWRcIik7XG4gICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgYENvbnRlbnQgc2NyaXB0IFwiJHt0aGlzLmNvbnRlbnRTY3JpcHROYW1lfVwiIGNvbnRleHQgaW52YWxpZGF0ZWRgXG4gICAgKTtcbiAgfVxuICBzdG9wT2xkU2NyaXB0cygpIHtcbiAgICB3aW5kb3cucG9zdE1lc3NhZ2UoXG4gICAgICB7XG4gICAgICAgIHR5cGU6IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSxcbiAgICAgICAgY29udGVudFNjcmlwdE5hbWU6IHRoaXMuY29udGVudFNjcmlwdE5hbWUsXG4gICAgICAgIG1lc3NhZ2VJZDogTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMilcbiAgICAgIH0sXG4gICAgICBcIipcIlxuICAgICk7XG4gIH1cbiAgdmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSB7XG4gICAgY29uc3QgaXNTY3JpcHRTdGFydGVkRXZlbnQgPSBldmVudC5kYXRhPy50eXBlID09PSBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEU7XG4gICAgY29uc3QgaXNTYW1lQ29udGVudFNjcmlwdCA9IGV2ZW50LmRhdGE/LmNvbnRlbnRTY3JpcHROYW1lID09PSB0aGlzLmNvbnRlbnRTY3JpcHROYW1lO1xuICAgIGNvbnN0IGlzTm90RHVwbGljYXRlID0gIXRoaXMucmVjZWl2ZWRNZXNzYWdlSWRzLmhhcyhldmVudC5kYXRhPy5tZXNzYWdlSWQpO1xuICAgIHJldHVybiBpc1NjcmlwdFN0YXJ0ZWRFdmVudCAmJiBpc1NhbWVDb250ZW50U2NyaXB0ICYmIGlzTm90RHVwbGljYXRlO1xuICB9XG4gIGxpc3RlbkZvck5ld2VyU2NyaXB0cyhvcHRpb25zKSB7XG4gICAgbGV0IGlzRmlyc3QgPSB0cnVlO1xuICAgIGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAodGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSB7XG4gICAgICAgIHRoaXMucmVjZWl2ZWRNZXNzYWdlSWRzLmFkZChldmVudC5kYXRhLm1lc3NhZ2VJZCk7XG4gICAgICAgIGNvbnN0IHdhc0ZpcnN0ID0gaXNGaXJzdDtcbiAgICAgICAgaXNGaXJzdCA9IGZhbHNlO1xuICAgICAgICBpZiAod2FzRmlyc3QgJiYgb3B0aW9ucz8uaWdub3JlRmlyc3RFdmVudCkgcmV0dXJuO1xuICAgICAgICB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG4gICAgICB9XG4gICAgfTtcbiAgICBhZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBjYik7XG4gICAgdGhpcy5vbkludmFsaWRhdGVkKCgpID0+IHJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIGNiKSk7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJkZWZpbml0aW9uIiwiYnJvd3NlciIsIl9icm93c2VyIiwidGFyZ2V0IiwicHJpbnQiLCJsb2dnZXIiXSwibWFwcGluZ3MiOiI7O0FBQU8sV0FBUyxvQkFBb0JBLGFBQVk7QUFDOUMsV0FBT0E7QUFBQSxFQUNUO0FDRE8sUUFBTUMsWUFBVSxXQUFXLFNBQVMsU0FBUyxLQUNoRCxXQUFXLFVBQ1gsV0FBVztBQ0ZSLFFBQU0sVUFBVUM7QUNEdkIsUUFBTSxnQkFBZ0IsQ0FBQyxRQUFRLGlCQUFpQixhQUFhLEtBQUssQ0FBQyxNQUFNLGtCQUFrQixDQUFDO0FBRTVGLE1BQUk7QUFDSixNQUFJO0FBRUosV0FBUyx1QkFBdUI7QUFDNUIsV0FBUSxzQkFDSCxvQkFBb0I7QUFBQSxNQUNqQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNaO0FBQUEsRUFDQTtBQUVBLFdBQVMsMEJBQTBCO0FBQy9CLFdBQVEseUJBQ0gsdUJBQXVCO0FBQUEsTUFDcEIsVUFBVSxVQUFVO0FBQUEsTUFDcEIsVUFBVSxVQUFVO0FBQUEsTUFDcEIsVUFBVSxVQUFVO0FBQUEsSUFDaEM7QUFBQSxFQUNBO0FBQ0EsUUFBTSxxQkFBcUIsb0JBQUksUUFBTztBQUN0QyxRQUFNLGlCQUFpQixvQkFBSSxRQUFPO0FBQ2xDLFFBQU0sd0JBQXdCLG9CQUFJLFFBQU87QUFDekMsV0FBUyxpQkFBaUIsU0FBUztBQUMv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
content;