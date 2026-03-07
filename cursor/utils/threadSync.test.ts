import { describe, expect, it } from "vitest";

import type { ThreadRecord } from "./hnStorage";
import { didStoryThreadChange, shouldBootstrapSavedThread } from "./threadSync";

function makeThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: "123",
    title: "Example",
    url: "https://news.ycombinator.com/item?id=123",
    addedAt: 1,
    ...overrides,
  };
}

describe("didStoryThreadChange", () => {
  it("ignores updates for unrelated stories", () => {
    const current = makeThread();

    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: { "123": current, "999": makeThread({ id: "999", title: "Old other" }) },
        newThreadsById: { "123": current, "999": makeThread({ id: "999", title: "New other" }) },
      }),
    ).toBe(false);
  });

  it("detects updates for the current story", () => {
    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: { "123": makeThread({ readCommentIds: [1, 2] }) },
        newThreadsById: { "123": makeThread({ readCommentIds: [1, 2, 3] }) },
      }),
    ).toBe(true);
  });

  it("detects removal of the current story", () => {
    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: { "123": makeThread() },
        newThreadsById: {},
      }),
    ).toBe(true);
  });
});

describe("shouldBootstrapSavedThread", () => {
  it("returns true for a saved thread without a baseline on a page with comments", () => {
    expect(shouldBootstrapSavedThread(makeThread(), [1, 2, 3])).toBe(true);
  });

  it("returns false when the thread already has a baseline", () => {
    expect(shouldBootstrapSavedThread(makeThread({ maxSeenCommentId: 3 }), [1, 2, 3])).toBe(false);
  });

  it("returns false when there are no comments on the page", () => {
    expect(shouldBootstrapSavedThread(makeThread(), [])).toBe(false);
  });
});
