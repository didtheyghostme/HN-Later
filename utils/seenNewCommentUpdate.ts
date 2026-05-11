export type SeenNewCommentUpdatePlan = {
  // Whether we should persist a new last-read checkpoint.
  // This should only be true when the user is advancing their reading progress (never backwards).
  shouldUpdateLastReadCommentId: boolean;
  nextLastReadCommentId: number | undefined;
  // New comment IDs to acknowledge ("seen") due to this click.
  seenNewCommentIdsToAdd: number[];
  // Read IDs to add to the read-set due to this click.
  readCommentIdsToAdd: number[];
};

/**
 * Plan the storage updates needed when user clicks "seen" on a NEW comment.
 *
 * Key UI invariants:
 * - "Seen" should never move the last-read checkpoint backwards.
 * - "Seen" should not accidentally mark other still-new/unacknowledged comments as read.
 * - The clicked comment should always be acknowledged at minimum.
 */
export function planSeenNewCommentUpdate(input: {
  commentIds: number[]; // DOM order
  lastReadCommentId: number | undefined;
  clickedCommentId: number;
  // IDs currently considered "new" by the UI (e.g. rows with `hn-later-new`).
  currentlyNewCommentIds: number[];
}): SeenNewCommentUpdatePlan | undefined {
  const clickedIdx = input.commentIds.indexOf(input.clickedCommentId);
  if (clickedIdx < 0) return undefined;

  const currentMarkerIdx =
    input.lastReadCommentId != null ? input.commentIds.indexOf(input.lastReadCommentId) : -1;

  // Never move the checkpoint backwards: only advance when clicking below the existing checkpoint.
  const markerAdvances = clickedIdx > currentMarkerIdx;

  // Acknowledge all *currently-new* comments up to (and including) the clicked row in DOM order.
  // Always include the clicked ID even if the "new" classes are stale (race/edge cases).
  const newSet = new Set(input.currentlyNewCommentIds ?? []);
  const seenNewCommentIdsToAdd: number[] = [];
  const seenSet = new Set<number>();

  for (let i = 0; i <= clickedIdx; i += 1) {
    const id = input.commentIds[i];
    if (!newSet.has(id)) continue;
    if (seenSet.has(id)) continue;
    seenSet.add(id);
    seenNewCommentIdsToAdd.push(id);
  }

  if (!seenSet.has(input.clickedCommentId)) {
    seenSet.add(input.clickedCommentId);
    seenNewCommentIdsToAdd.push(input.clickedCommentId);
  }

  const readCommentIdsToAdd = markerAdvances
    ? input.commentIds.slice(0, clickedIdx + 1)
    : seenNewCommentIdsToAdd;

  return {
    shouldUpdateLastReadCommentId: markerAdvances,
    nextLastReadCommentId: markerAdvances ? input.clickedCommentId : input.lastReadCommentId,
    seenNewCommentIdsToAdd,
    readCommentIdsToAdd,
  };
}

