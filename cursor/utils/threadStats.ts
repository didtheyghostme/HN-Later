import type { ThreadStats } from "./hnStorage";

export function computeStats(input: {
  commentIds: number[];
  readCommentIds: number[] | undefined;
  newCount?: number;
}): ThreadStats {
  const totalComments = input.commentIds.length;

  const readSet = new Set(input.readCommentIds ?? []);
  const readCount = input.commentIds.reduce((acc, id) => (readSet.has(id) ? acc + 1 : acc), 0);

  const percent = totalComments === 0 ? 0 : Math.round((readCount / totalComments) * 100);

  return {
    totalComments,
    readCount,
    percent,
    newCount: input.newCount,
  };
}

