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

export function areThreadRecordsEqual(
  a: ThreadRecord | undefined,
  b: ThreadRecord | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;

  return (
    a.id === b.id &&
    a.title === b.title &&
    a.url === b.url &&
    a.addedAt === b.addedAt &&
    a.hnPostedAt === b.hnPostedAt &&
    a.lastVisitedAt === b.lastVisitedAt &&
    a.status === b.status &&
    a.statusChangedAt === b.statusChangedAt &&
    a.lastReadCommentId === b.lastReadCommentId &&
    a.dismissNewAboveUntilId === b.dismissNewAboveUntilId &&
    a.maxSeenCommentId === b.maxSeenCommentId &&
    arraysEqual(a.readCommentIds, b.readCommentIds) &&
    arraysEqual(a.seenNewCommentIds, b.seenNewCommentIds) &&
    a.cachedStats?.totalComments === b.cachedStats?.totalComments &&
    a.cachedStats?.readCount === b.cachedStats?.readCount &&
    a.cachedStats?.percent === b.cachedStats?.percent &&
    a.cachedStats?.newCount === b.cachedStats?.newCount &&
    a.frozenProgress?.totalComments === b.frozenProgress?.totalComments &&
    a.frozenProgress?.readCount === b.frozenProgress?.readCount &&
    a.frozenProgress?.percent === b.frozenProgress?.percent
  );
}

export function didStoryThreadChange(input: {
  storyId: string;
  oldThreadsById: Record<string, ThreadRecord> | null | undefined;
  newThreadsById: Record<string, ThreadRecord> | null | undefined;
}): boolean {
  return !areThreadRecordsEqual(
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
