import type { ThreadRecord } from "./hnStorage";

function arraysEqual(a: number[] | undefined, b: number[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];

  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }

  return true;
}

function frozenProgressEqual(
  a: ThreadRecord["frozenProgress"],
  b: ThreadRecord["frozenProgress"],
): boolean {
  return (
    a?.totalComments === b?.totalComments &&
    a?.readCount === b?.readCount &&
    a?.percent === b?.percent
  );
}

function cachedStatsEqual(a: ThreadRecord["cachedStats"], b: ThreadRecord["cachedStats"]): boolean {
  return (
    a?.totalComments === b?.totalComments &&
    a?.readCount === b?.readCount &&
    a?.percent === b?.percent &&
    a?.newCount === b?.newCount
  );
}

export function areRenderableThreadStatesEqual(
  a: ThreadRecord | undefined,
  b: ThreadRecord | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;

  return (
    a.status === b.status &&
    a.lastReadCommentId === b.lastReadCommentId &&
    a.dismissNewAboveUntilId === b.dismissNewAboveUntilId &&
    a.maxSeenCommentId === b.maxSeenCommentId &&
    arraysEqual(a.readCommentIds, b.readCommentIds) &&
    arraysEqual(a.seenNewCommentIds, b.seenNewCommentIds) &&
    cachedStatsEqual(a.cachedStats, b.cachedStats) &&
    frozenProgressEqual(a.frozenProgress, b.frozenProgress)
  );
}

export function didStoryThreadChange(input: {
  storyId: string;
  oldThreadsById: Record<string, ThreadRecord> | null | undefined;
  newThreadsById: Record<string, ThreadRecord> | null | undefined;
}): boolean {
  return !areRenderableThreadStatesEqual(
    input.oldThreadsById?.[input.storyId],
    input.newThreadsById?.[input.storyId],
  );
}

export function shouldBootstrapSavedThread(
  thread: ThreadRecord | undefined,
  commentIds: number[],
): boolean {
  return !!thread && thread.maxSeenCommentId == null && commentIds.length > 0;
}
