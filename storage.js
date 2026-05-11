(() => {
  const SAVED_IDS_KEY = "hnlater:savedThreadIds";
  const THREAD_KEY_PREFIX = "hnlater:thread:";
  const READ_KEY_PREFIX = "hnlater:read:";

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  function storageRemove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }

  function getThreadKey(threadId) {
    return `${THREAD_KEY_PREFIX}${threadId}`;
  }

  function getReadKey(threadId) {
    return `${READ_KEY_PREFIX}${threadId}`;
  }

  async function getSavedThreadIds() {
    const { [SAVED_IDS_KEY]: ids = [] } = await storageGet([SAVED_IDS_KEY]);
    return Array.isArray(ids) ? ids : [];
  }

  async function setSavedThreadIds(ids) {
    await storageSet({ [SAVED_IDS_KEY]: Array.isArray(ids) ? ids : [] });
  }

  async function addSavedThreadId(threadId) {
    const ids = await getSavedThreadIds();
    if (ids.includes(threadId)) return;
    ids.push(threadId);
    await setSavedThreadIds(ids);
  }

  async function removeSavedThreadId(threadId) {
    const ids = await getSavedThreadIds();
    const next = ids.filter((id) => id !== threadId);
    await setSavedThreadIds(next);
  }

  async function isThreadSaved(threadId) {
    const ids = await getSavedThreadIds();
    return ids.includes(threadId);
  }

  async function getThread(threadId) {
    const key = getThreadKey(threadId);
    const data = await storageGet([key]);
    return data[key] || null;
  }

  async function setThread(threadId, thread) {
    const key = getThreadKey(threadId);
    await storageSet({ [key]: thread });
  }

  async function updateThread(threadId, patch) {
    const current = (await getThread(threadId)) || { threadId };
    const next = { ...current, ...patch, threadId };
    await setThread(threadId, next);
    return next;
  }

  async function getReadIds(threadId) {
    const key = getReadKey(threadId);
    const data = await storageGet([key]);
    const ids = data[key]?.ids;
    return Array.isArray(ids) ? ids : [];
  }

  async function setReadIds(threadId, ids) {
    const key = getReadKey(threadId);
    await storageSet({ [key]: { ids: Array.isArray(ids) ? ids : [] } });
  }

  async function clearAllData() {
    const all = await storageGet(null);
    const keys = Object.keys(all).filter((k) => k.startsWith("hnlater:"));
    if (keys.length === 0) return;
    await storageRemove(keys);
  }

  window.hnLaterStorage = {
    SAVED_IDS_KEY,
    THREAD_KEY_PREFIX,
    READ_KEY_PREFIX,
    storageGet,
    storageSet,
    storageRemove,
    getThreadKey,
    getReadKey,
    getSavedThreadIds,
    setSavedThreadIds,
    addSavedThreadId,
    removeSavedThreadId,
    isThreadSaved,
    getThread,
    setThread,
    updateThread,
    getReadIds,
    setReadIds,
    clearAllData
  };
})();

