import { describe, expect, it } from "vitest";

import { planSeenNewCommentUpdate } from "./seenNewCommentUpdate";

describe("planSeenNewCommentUpdate", () => {
  it("does not widen the read-set when clicking seen above an existing checkpoint", () => {
    const commentIds = [1, 2, 100, 3, 101, 4, 5, 6];

    const plan = planSeenNewCommentUpdate({
      commentIds,
      lastReadCommentId: 6,
      clickedCommentId: 100,
      currentlyNewCommentIds: [100, 101],
    });

    expect(plan).toBeTruthy();
    expect(plan?.shouldUpdateLastReadCommentId).toBe(false);
    expect(plan?.nextLastReadCommentId).toBe(6);
    expect(plan?.seenNewCommentIdsToAdd).toEqual([100]);
    expect(plan?.readCommentIdsToAdd).toEqual([100]);
  });

  it("advances checkpoint and snapshots up to clicked when clicking seen below the checkpoint", () => {
    const commentIds = [1, 2, 100, 3, 101, 4, 5];

    const plan = planSeenNewCommentUpdate({
      commentIds,
      lastReadCommentId: 2,
      clickedCommentId: 101,
      currentlyNewCommentIds: [100, 101],
    });

    expect(plan).toBeTruthy();
    expect(plan?.shouldUpdateLastReadCommentId).toBe(true);
    expect(plan?.nextLastReadCommentId).toBe(101);
    expect(plan?.seenNewCommentIdsToAdd).toEqual([100, 101]);
    expect(plan?.readCommentIdsToAdd).toEqual([1, 2, 100, 3, 101]);
  });

  it("falls back to acknowledging the clicked id if new-state is stale", () => {
    const commentIds = [1, 2, 3, 4, 5];

    const plan = planSeenNewCommentUpdate({
      commentIds,
      lastReadCommentId: 5,
      clickedCommentId: 3,
      currentlyNewCommentIds: [],
    });

    expect(plan).toBeTruthy();
    expect(plan?.shouldUpdateLastReadCommentId).toBe(false);
    expect(plan?.nextLastReadCommentId).toBe(5);
    expect(plan?.seenNewCommentIdsToAdd).toEqual([3]);
    expect(plan?.readCommentIdsToAdd).toEqual([3]);
  });
});

