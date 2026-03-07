import { describe, expect, it } from "vitest";

import { applyStoredStorySummaryDelta } from "./storySummaryDelta";

describe("applyStoredStorySummaryDelta", () => {
  it("adds visible read/new deltas onto stored story stats without changing totals", () => {
    expect(
      applyStoredStorySummaryDelta({
        storedStats: { totalComments: 20, readCount: 4, percent: 20, newCount: 5 },
        previousVisibleStats: { readCount: 1, newCount: 3 },
        nextVisibleStats: { readCount: 4, newCount: 1 },
        status: "active",
        frozenProgress: undefined,
      }),
    ).toEqual({
      cachedStats: { totalComments: 20, readCount: 7, percent: 35, newCount: 3 },
      frozenProgress: undefined,
    });
  });

  it("clamps negative deltas to valid read/new ranges", () => {
    expect(
      applyStoredStorySummaryDelta({
        storedStats: { totalComments: 10, readCount: 1, percent: 10, newCount: 1 },
        previousVisibleStats: { readCount: 5, newCount: 4 },
        nextVisibleStats: { readCount: 0, newCount: 0 },
        status: "active",
        frozenProgress: undefined,
      }),
    ).toEqual({
      cachedStats: { totalComments: 10, readCount: 0, percent: 0, newCount: 0 },
      frozenProgress: undefined,
    });
  });

  it("updates archived frozen progress from the adjusted story stats", () => {
    expect(
      applyStoredStorySummaryDelta({
        storedStats: { totalComments: 12, readCount: 6, percent: 50, newCount: 2 },
        previousVisibleStats: { readCount: 2, newCount: 2 },
        nextVisibleStats: { readCount: 4, newCount: 0 },
        status: "archived",
        frozenProgress: { totalComments: 12, readCount: 6, percent: 50 },
      }),
    ).toEqual({
      cachedStats: { totalComments: 12, readCount: 8, percent: 67, newCount: 0 },
      frozenProgress: { totalComments: 12, readCount: 8, percent: 67 },
    });
  });

  it("rolls finished frozen progress forward once story new-count reaches zero", () => {
    expect(
      applyStoredStorySummaryDelta({
        storedStats: { totalComments: 15, readCount: 12, percent: 80, newCount: 2 },
        previousVisibleStats: { readCount: 1, newCount: 2 },
        nextVisibleStats: { readCount: 3, newCount: 0 },
        status: "finished",
        frozenProgress: { totalComments: 13, readCount: 13, percent: 100 },
      }),
    ).toEqual({
      cachedStats: { totalComments: 15, readCount: 14, percent: 93, newCount: 0 },
      frozenProgress: { totalComments: 15, readCount: 15, percent: 100 },
    });
  });

  it("keeps finished frozen progress unchanged while story new-count remains", () => {
    expect(
      applyStoredStorySummaryDelta({
        storedStats: { totalComments: 15, readCount: 12, percent: 80, newCount: 3 },
        previousVisibleStats: { readCount: 1, newCount: 2 },
        nextVisibleStats: { readCount: 2, newCount: 1 },
        status: "finished",
        frozenProgress: { totalComments: 13, readCount: 13, percent: 100 },
      }),
    ).toEqual({
      cachedStats: { totalComments: 15, readCount: 13, percent: 87, newCount: 2 },
      frozenProgress: { totalComments: 13, readCount: 13, percent: 100 },
    });
  });

  it("returns undefined cached stats when no story summary exists yet", () => {
    expect(
      applyStoredStorySummaryDelta({
        storedStats: undefined,
        previousVisibleStats: { readCount: 0, newCount: 0 },
        nextVisibleStats: { readCount: 1, newCount: 0 },
        status: "active",
        frozenProgress: undefined,
      }),
    ).toEqual({
      cachedStats: undefined,
      frozenProgress: undefined,
    });
  });
});
