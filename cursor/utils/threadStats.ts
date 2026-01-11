import type { ThreadStats } from "./hnStorage";

export function computeStats(input: {
  commentIds: number[];
  lastReadCommentId: number | undefined;
  maxSeenCommentId: number | undefined;
  newCount?: number;
}): ThreadStats {
  const totalComments = input.commentIds.length;

  const maxSeen = input.maxSeenCommentId;

  // "Old" comments are those at/below the "new baseline".
  // Reading progress is driven by a DOM-order checkpoint (lastReadCommentId), but that checkpoint may
  // point at a *new* comment. In that case we still want to count all old comments above the checkpoint
  // as read.
  const markerIdx =
    input.lastReadCommentId != null ? input.commentIds.indexOf(input.lastReadCommentId) : -1;
  const prefix = markerIdx >= 0 ? input.commentIds.slice(0, markerIdx + 1) : [];

  const oldReadCount =
    markerIdx >= 0
      ? maxSeen != null
        ? prefix.filter((id) => id <= maxSeen).length
        : prefix.length
      : 0;

  // Overall progress counts acknowledged new comments as read.
  // - totalNew: all comments with id > maxSeen
  // - stillNew: the count currently shown as "new" (unacknowledged / unread)
  // => acknowledgedNew = totalNew - stillNew
  const totalNew = maxSeen != null ? input.commentIds.filter((id) => id > maxSeen).length : 0;
  const stillNew = maxSeen != null ? (input.newCount ?? totalNew) : 0;
  const newAcknowledgedCount = maxSeen != null ? Math.max(0, totalNew - stillNew) : 0;

  const readCount = Math.min(totalComments, oldReadCount + newAcknowledgedCount);

  const percent = totalComments === 0 ? 0 : Math.round((readCount / totalComments) * 100);

  return {
    totalComments,
    readCount,
    percent,
    newCount: input.newCount,
  };
}

