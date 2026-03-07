export type HnItemPageBehavior = {
  isCanonicalStoryPage: boolean;
  allowsBootstrapFromCurrentPage: boolean;
  allowsSummaryRecomputeFromCurrentPage: boolean;
  allowsSummaryDeltaPersistence: boolean;
  routesGlobalThreadActionsToCanonical: boolean;
  allowsBulkMarkSeen: boolean;
};

export function getHnItemPageBehavior(input: {
  routeItemId?: string | null | undefined;
  storyId?: string | null | undefined;
}): HnItemPageBehavior {
  const isCanonicalStoryPage =
    !!input.routeItemId && !!input.storyId && input.routeItemId === input.storyId;

  return {
    isCanonicalStoryPage,
    allowsBootstrapFromCurrentPage: isCanonicalStoryPage,
    allowsSummaryRecomputeFromCurrentPage: isCanonicalStoryPage,
    allowsSummaryDeltaPersistence: true,
    routesGlobalThreadActionsToCanonical: !isCanonicalStoryPage,
    allowsBulkMarkSeen: true,
  };
}
