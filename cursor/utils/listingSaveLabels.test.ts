import { describe, expect, it } from "vitest";

import { syncListingSaveLabels } from "./listingSaveLabels";

describe("syncListingSaveLabels", () => {
  it('flips a visible story from "later" to "saved" when storage adds it', () => {
    const linkByStoryId = new Map([
      ["10", { textContent: "later" }],
      ["11", { textContent: "saved" }],
    ]);

    syncListingSaveLabels(linkByStoryId, new Set(["10", "11"]));

    expect(linkByStoryId.get("10")?.textContent).toBe("saved");
    expect(linkByStoryId.get("11")?.textContent).toBe("saved");
  });

  it('flips a visible story from "saved" to "later" when storage removes it', () => {
    const linkByStoryId = new Map([
      ["10", { textContent: "saved" }],
      ["11", { textContent: "saved" }],
    ]);

    syncListingSaveLabels(linkByStoryId, new Set(["11"]));

    expect(linkByStoryId.get("10")?.textContent).toBe("later");
    expect(linkByStoryId.get("11")?.textContent).toBe("saved");
  });
});
