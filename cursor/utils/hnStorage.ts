import { browser } from "wxt/browser";

export type ThreadStats = {
  totalComments: number;
  readCount: number;
  percent: number;
  newCount?: number;
};

export type ThreadRecord = {
  id: string; // HN story id
  title: string;
  url: string; // canonical item url
  addedAt: number; // epoch ms
  lastVisitedAt?: number; // epoch ms
  lastReadCommentId?: number; // numeric HN comment id
  // When set, "new" comments ABOVE lastReadCommentId (in DOM order) are only considered new if their id is
  // greater than this watermark. This allows "mark-to-here" to dismiss existing new comments above the
  // checkpoint while still allowing future new replies (which will have larger ids) to show as new.
  dismissNewAboveUntilId?: number; // numeric HN comment id
  // Baseline used to compute "new comments": a comment is considered "new" if its id > maxSeenCommentId.
  // IMPORTANT: This is an *explicitly acknowledged* baseline (e.g. via "Mark new as seen"), not updated on
  // every page load.
  maxSeenCommentId?: number; // numeric HN comment id
  // Set of individually acknowledged new comment IDs. A new comment (id > maxSeenCommentId) is still
  // considered "new" unless its ID is in this set. Cleared when maxSeenCommentId is updated.
  seenNewCommentIds?: number[];
  cachedStats?: ThreadStats;
};

const THREADS_BY_ID_KEY = "hnLater:threadsById";

function nowMs() {
  return Date.now();
}

async function getThreadsById(): Promise<Record<string, ThreadRecord>> {
  const result = await browser.storage.local.get(THREADS_BY_ID_KEY);
  return (result?.[THREADS_BY_ID_KEY] ?? {}) as Record<string, ThreadRecord>;
}

async function setThreadsById(next: Record<string, ThreadRecord>): Promise<void> {
  await browser.storage.local.set({ [THREADS_BY_ID_KEY]: next });
}

export async function upsertThread(input: {
  id: string;
  title: string;
  url: string;
}): Promise<ThreadRecord> {
  const threadsById = await getThreadsById();
  const existing = threadsById[input.id];

  const next: ThreadRecord = {
    id: input.id,
    title: input.title,
    url: input.url,
    addedAt: existing?.addedAt ?? nowMs(),
    lastVisitedAt: existing?.lastVisitedAt,
    lastReadCommentId: existing?.lastReadCommentId,
    dismissNewAboveUntilId: existing?.dismissNewAboveUntilId,
    maxSeenCommentId: existing?.maxSeenCommentId,
    seenNewCommentIds: existing?.seenNewCommentIds,
    cachedStats: existing?.cachedStats,
  };

  threadsById[input.id] = next;
  await setThreadsById(threadsById);
  return next;
}

export async function removeThread(storyId: string): Promise<void> {
  const threadsById = await getThreadsById();
  delete threadsById[storyId];
  await setThreadsById(threadsById);
}

export async function getThread(storyId: string): Promise<ThreadRecord | undefined> {
  const threadsById = await getThreadsById();
  return threadsById[storyId];
}

export async function listThreads(): Promise<ThreadRecord[]> {
  const threadsById = await getThreadsById();
  return Object.values(threadsById).sort((a, b) => b.addedAt - a.addedAt);
}

export async function setLastReadCommentId(
  storyId: string,
  lastReadCommentId: number | undefined,
): Promise<void> {
  const threadsById = await getThreadsById();
  const existing = threadsById[storyId];
  if (!existing) return;

  threadsById[storyId] = { ...existing, lastReadCommentId };
  await setThreadsById(threadsById);
}

export async function setDismissNewAboveUntilId(
  storyId: string,
  dismissNewAboveUntilId: number | undefined,
): Promise<void> {
  const threadsById = await getThreadsById();
  const existing = threadsById[storyId];
  if (!existing) return;

  threadsById[storyId] = { ...existing, dismissNewAboveUntilId };
  await setThreadsById(threadsById);
}

export async function setVisitInfo(input: {
  storyId: string;
  // Optional: omit to only update lastVisitedAt without changing the "new comments" baseline.
  maxSeenCommentId?: number;
  lastVisitedAt?: number;
}): Promise<void> {
  const threadsById = await getThreadsById();
  const existing = threadsById[input.storyId];
  if (!existing) return;

  threadsById[input.storyId] = {
    ...existing,
    ...(input.maxSeenCommentId !== undefined
      ? { maxSeenCommentId: input.maxSeenCommentId, seenNewCommentIds: undefined }
      : {}),
    lastVisitedAt: input.lastVisitedAt ?? nowMs(),
  };
  await setThreadsById(threadsById);
}

export async function addSeenNewCommentId(
  storyId: string,
  commentId: number,
): Promise<void> {
  const threadsById = await getThreadsById();
  const existing = threadsById[storyId];
  if (!existing) return;

  const currentIds = existing.seenNewCommentIds ?? [];
  if (currentIds.includes(commentId)) return; // Already seen

  threadsById[storyId] = {
    ...existing,
    seenNewCommentIds: [...currentIds, commentId],
  };
  await setThreadsById(threadsById);
}

export async function setCachedStats(input: {
  storyId: string;
  stats: ThreadStats | undefined;
}): Promise<void> {
  const threadsById = await getThreadsById();
  const existing = threadsById[input.storyId];
  if (!existing) return;

  threadsById[input.storyId] = { ...existing, cachedStats: input.stats };
  await setThreadsById(threadsById);
}

export async function resetProgress(storyId: string): Promise<void> {
  const threadsById = await getThreadsById();
  const existing = threadsById[storyId];
  if (!existing) return;

  threadsById[storyId] = {
    ...existing,
    lastReadCommentId: undefined,
    dismissNewAboveUntilId: undefined,
    seenNewCommentIds: undefined,
    cachedStats: undefined,
  };
  await setThreadsById(threadsById);
}
