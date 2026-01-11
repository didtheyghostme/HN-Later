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

