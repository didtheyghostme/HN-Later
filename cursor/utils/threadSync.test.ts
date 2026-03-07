import { describe, expect, it } from "vitest";

import type { ThreadRecord } from "./hnStorage";
import {
  areRenderableThreadStatesEqual,
  didStoryThreadChange,
  shouldBootstrapSavedThread,
} from "./threadSync";

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

  it("ignores last-visited updates for the current story", () => {
    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: { "123": makeThread({ lastVisitedAt: 1 }) },
        newThreadsById: { "123": makeThread({ lastVisitedAt: 2 }) },
      }),
    ).toBe(false);
  });

  it("ignores metadata-only updates for the current story", () => {
    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: {
          "123": makeThread({
            title: "Old title",
            url: "https://example.com/old",
            hnPostedAt: 1,
            addedAt: 10,
          }),
        },
        newThreadsById: {
          "123": makeThread({
            title: "New title",
            url: "https://example.com/new",
            hnPostedAt: 2,
            addedAt: 20,
          }),
        },
      }),
    ).toBe(false);
  });

  it("ignores cached-stats-only updates for the current story", () => {
    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: {
          "123": makeThread({
            cachedStats: { totalComments: 10, readCount: 3, percent: 30, newCount: 2 },
          }),
        },
        newThreadsById: {
          "123": makeThread({
            cachedStats: { totalComments: 11, readCount: 4, percent: 36, newCount: 1 },
          }),
        },
      }),
    ).toBe(false);
  });

  it("detects progress updates for the current story", () => {
    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: {
          "123": makeThread({
            lastReadCommentId: 10,
            readCommentIds: [1, 2, 3],
            maxSeenCommentId: 20,
            seenNewCommentIds: [21],
            dismissNewAboveUntilId: 20,
          }),
        },
        newThreadsById: {
          "123": makeThread({
            lastReadCommentId: 11,
            readCommentIds: [1, 2, 3, 4],
            maxSeenCommentId: 22,
            seenNewCommentIds: [21, 22],
            dismissNewAboveUntilId: 22,
          }),
        },
      }),
    ).toBe(true);
  });

  it("detects status and frozen-progress updates for the current story", () => {
    expect(
      didStoryThreadChange({
        storyId: "123",
        oldThreadsById: {
          "123": makeThread({
            status: "active",
            frozenProgress: undefined,
          }),
        },
        newThreadsById: {
          "123": makeThread({
            status: "archived",
            frozenProgress: { totalComments: 10, readCount: 7, percent: 70 },
          }),
        },
      }),
    ).toBe(true);
  });
});

describe("areRenderableThreadStatesEqual", () => {
  it("compares only item-page render state", () => {
    expect(
      areRenderableThreadStatesEqual(
        makeThread({
          title: "Old title",
          url: "https://example.com/old",
          addedAt: 1,
          hnPostedAt: 2,
          lastVisitedAt: 3,
          cachedStats: { totalComments: 10, readCount: 5, percent: 50, newCount: 2 },
        }),
        makeThread({
          title: "New title",
          url: "https://example.com/new",
          addedAt: 4,
          hnPostedAt: 5,
          lastVisitedAt: 6,
          cachedStats: { totalComments: 20, readCount: 8, percent: 40, newCount: 1 },
        }),
      ),
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
