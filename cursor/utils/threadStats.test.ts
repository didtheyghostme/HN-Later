import { describe, expect, it } from "vitest";

import { ensureBaselineMaxSeen } from "./ensureBaseline";
import { computeStats } from "./threadStats";

describe("computeStats", () => {
  it("counts read-set membership only (reorders/new replies don't regress progress)", () => {
    // User has read comments 1..5 (read-set snapshot).
    const readCommentIds = [1, 2, 3, 4, 5];

    // Later, new replies (ids > 100) appear under early comments.
    const commentIdsInDomOrder = [
      1,
      101,
      2,
      102,
      3,
      4,
      5,
      6,
      7,
      // ... rest omitted
    ];

    const stats = computeStats({
      commentIds: commentIdsInDomOrder,
      readCommentIds,
    });

    // Only comments in the read-set should count as read.
    expect(stats.readCount).toBe(5);
  });

  it("does not inflate progress when new comments are accidentally in readCommentIds", () => {
    // Scenario: User previously marked-to-here at comment 5 (DOM index 4 in old layout).
    // Thread becomes popular; new replies (ids > 100) appear interspersed in DOM.
    // If "seen" on a new comment near the top sweeps all IDs up to the old checkpoint
    // into readCommentIds (including new comments the user never read), readCount would
    // be inflated vs. what the gutter shows.
    //
    // After the fix, only IDs up to the clicked position are added — so new comments
    // between the clicked row and the old checkpoint stay OUT of readCommentIds.

    // DOM order after reorder: [1, 101, 102, 2, 103, 3, 4, 5, 6, 7, 104, 8, 9, 10]
    const commentIdsInDomOrder = [1, 101, 102, 2, 103, 3, 4, 5, 6, 7, 104, 8, 9, 10];

    // Correct readCommentIds: only old comments 1-5 from original mark-to-here,
    // plus the clicked new comment 101 (seen at DOM index 1).
    const readCommentIds = [1, 2, 3, 4, 5, 101];

    const stats = computeStats({
      commentIds: commentIdsInDomOrder,
      readCommentIds,
    });

    // 6 out of 14 = 43%, NOT the ~64% that would result from also including 102, 103.
    expect(stats.readCount).toBe(6);
    expect(stats.totalComments).toBe(14);
    expect(stats.percent).toBe(43);
  });
});

describe("ensureBaselineMaxSeen", () => {
  it("initializes baseline on first implicit save (mark-to-here/seen)", async () => {
    const calls: Array<{ storyId: string; maxSeenCommentId?: number }> = [];

    const thread = { id: "123", title: "t", url: "u", addedAt: 0 } as any;
    const storyId = "123";
    const commentIds = [1, 2, 3, 10, 5];

    const next = await ensureBaselineMaxSeen({
      thread,
      storyId,
      commentIds,
      setVisitInfo: async (input) => {
        calls.push(input);
      },
    });

    expect(calls).toEqual([{ storyId, maxSeenCommentId: 10 }]);
    expect(next?.maxSeenCommentId).toBe(10);
  });

  it("does nothing if baseline already exists", async () => {
    const calls: Array<{ storyId: string; maxSeenCommentId?: number }> = [];

    const thread = { id: "123", title: "t", url: "u", addedAt: 0, maxSeenCommentId: 42 } as any;

    const next = await ensureBaselineMaxSeen({
      thread,
      storyId: "123",
      commentIds: [1, 999],
      setVisitInfo: async (input) => {
        calls.push(input);
      },
    });

    expect(calls).toEqual([]);
    expect(next?.maxSeenCommentId).toBe(42);
  });
});

