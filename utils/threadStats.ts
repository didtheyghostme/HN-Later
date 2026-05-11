import type { ThreadStats } from "./hnStorage";

export function computeStats(input: {
  commentIds: number[];
  readCommentIds: number[] | undefined;
  newCount?: number;
  // Comment IDs that should be treated as unread for display/stats even if they exist in readCommentIds.
  // This is used to align progress % with UI rules like "new overrides read".
  forcedUnreadCommentIds?: number[];
}): ThreadStats {
  const totalComments = input.commentIds.length;

  const readSet = new Set(input.readCommentIds ?? []);
  const forcedUnreadSet = new Set(input.forcedUnreadCommentIds ?? []);
  const readCount = input.commentIds.reduce(
    (acc, id) => (readSet.has(id) && !forcedUnreadSet.has(id) ? acc + 1 : acc),
    0,
  );

  const percent = totalComments === 0 ? 0 : Math.round((readCount / totalComments) * 100);

  return {
    totalComments,
    readCount,
    percent,
    newCount: input.newCount,
  };
}

