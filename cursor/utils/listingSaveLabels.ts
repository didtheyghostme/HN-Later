export type ListingSaveLabelTarget = {
  textContent: string | null;
};

export function syncListingSaveLabels(
  linkByStoryId: ReadonlyMap<string, ListingSaveLabelTarget>,
  savedStoryIds: ReadonlySet<string>,
): void {
  for (const [storyId, link] of linkByStoryId) {
    link.textContent = savedStoryIds.has(storyId) ? "saved" : "later";
  }
}
