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
  maxSeenCommentId?: number; // numeric HN comment id
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
    maxSeenCommentId: existing?.maxSeenCommentId,
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

export async function setVisitInfo(input: {
  storyId: string;
  maxSeenCommentId: number | undefined;
  lastVisitedAt?: number;
}): Promise<void> {
  const threadsById = await getThreadsById();
  const existing = threadsById[input.storyId];
  if (!existing) return;

  threadsById[input.storyId] = {
    ...existing,
    maxSeenCommentId: input.maxSeenCommentId,
    lastVisitedAt: input.lastVisitedAt ?? nowMs(),
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
    cachedStats: undefined,
  };
  await setThreadsById(threadsById);
}
