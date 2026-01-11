import type { ThreadRecord } from "./hnStorage";

export function getMaxCommentId(commentIds: number[]): number | undefined {
  return commentIds.length ? Math.max(...commentIds) : undefined;
}

export async function ensureBaselineMaxSeen(args: {
  thread: ThreadRecord | undefined;
  storyId: string;
  commentIds: number[];
  setVisitInfo: (input: { storyId: string; maxSeenCommentId?: number }) => Promise<void>;
}): Promise<ThreadRecord | undefined> {
  const { thread } = args;
  if (!thread) return thread;
  if (thread.maxSeenCommentId != null) return thread;

  const currentMax = getMaxCommentId(args.commentIds);
  await args.setVisitInfo({ storyId: args.storyId, maxSeenCommentId: currentMax });

  return { ...thread, maxSeenCommentId: currentMax, seenNewCommentIds: undefined };
}

