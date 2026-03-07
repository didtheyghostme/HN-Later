import { describe, expect, it } from "vitest";

import { getHnItemPageBehavior } from "./hnItemPageBehavior";

describe("getHnItemPageBehavior", () => {
  it("allows full-thread recompute and bulk actions on canonical story pages", () => {
    expect(
      getHnItemPageBehavior({
        routeItemId: "47278426",
        storyId: "47278426",
      }),
    ).toEqual({
      isCanonicalStoryPage: true,
      allowsBootstrapFromCurrentPage: true,
      allowsSummaryRecomputeFromCurrentPage: true,
      allowsSummaryDeltaPersistence: true,
      routesGlobalThreadActionsToCanonical: false,
      allowsBulkMarkSeen: true,
    });
  });

  it("treats comment permalinks as story-linked partial views", () => {
    expect(
      getHnItemPageBehavior({
        routeItemId: "47278863",
        storyId: "47278426",
      }),
    ).toEqual({
      isCanonicalStoryPage: false,
      allowsBootstrapFromCurrentPage: false,
      allowsSummaryRecomputeFromCurrentPage: false,
      allowsSummaryDeltaPersistence: true,
      routesGlobalThreadActionsToCanonical: true,
      allowsBulkMarkSeen: true,
    });
  });

  it("falls back to the permalink behavior when route id is missing", () => {
    expect(
      getHnItemPageBehavior({
        routeItemId: undefined,
        storyId: "47278426",
      }),
    ).toEqual({
      isCanonicalStoryPage: false,
      allowsBootstrapFromCurrentPage: false,
      allowsSummaryRecomputeFromCurrentPage: false,
      allowsSummaryDeltaPersistence: true,
      routesGlobalThreadActionsToCanonical: true,
      allowsBulkMarkSeen: true,
    });
  });
});
