import { describe, expect, it } from "vitest";

import {
  parseHnCommentIdFromHash,
  parseHnItemIdFromHref,
  resolveHnItemPageContext,
} from "./hnItemPageContext";

describe("parseHnItemIdFromHref", () => {
  it("handles relative item links and fragments", () => {
    expect(parseHnItemIdFromHref("/item?id=47278426#47278863")).toBe("47278426");
    expect(parseHnItemIdFromHref("item?id=47278426")).toBe("47278426");
  });
});

describe("parseHnCommentIdFromHash", () => {
  it("reads positive numeric comment hashes", () => {
    expect(parseHnCommentIdFromHash("#48595815")).toBe(48595815);
  });

  it("rejects empty, nonnumeric, and unsafe hashes", () => {
    expect(parseHnCommentIdFromHash("")).toBe(undefined);
    expect(parseHnCommentIdFromHash("#")).toBe(undefined);
    expect(parseHnCommentIdFromHash("#abc")).toBe(undefined);
    expect(parseHnCommentIdFromHash("#0")).toBe(undefined);
    expect(parseHnCommentIdFromHash("#-1")).toBe(undefined);
    expect(parseHnCommentIdFromHash("#1.5")).toBe(undefined);
    expect(parseHnCommentIdFromHash("#9007199254740992")).toBe(undefined);
  });

  it("rejects extension-specific hashes", () => {
    expect(parseHnCommentIdFromHash("#hn-later-bootstrap-summary")).toBe(undefined);
  });
});

describe("resolveHnItemPageContext", () => {
  it("keeps the route id on a story page", () => {
    expect(
      resolveHnItemPageContext({
        routeItemId: "47278426",
        titleLineTitle: "Tech employment now significantly worse than the 2021 peak",
        docTitle: "Tech employment now significantly worse than the 2021 peak | Hacker News",
      }),
    ).toEqual({
      routeItemId: "47278426",
      storyId: "47278426",
      title: "Tech employment now significantly worse than the 2021 peak",
    });
  });

  it("resolves a top-level comment permalink to the parent story", () => {
    expect(
      resolveHnItemPageContext({
        routeItemId: "47278863",
        docTitle: "In my experience, tech employment is now significantly worse... | Hacker News",
        topCommentItemLinks: [
          { href: "/item?id=47278863", text: "22 hours ago" },
          { href: "/item?id=47278426", text: "parent" },
          { href: "/item?id=47278426", text: "context" },
          {
            href: "/item?id=47278426",
            text: "Tech employment now significantly worse than the 2021 peak",
          },
        ],
      }),
    ).toEqual({
      routeItemId: "47278863",
      storyId: "47278426",
      title: "Tech employment now significantly worse than the 2021 peak",
    });
  });

  it("resolves a nested comment permalink to the root story", () => {
    expect(
      resolveHnItemPageContext({
        routeItemId: "500",
        docTitle: "Nested reply title fallback | Hacker News",
        topCommentItemLinks: [
          { href: "/item?id=500#500", text: "1 hour ago" },
          { href: "/item?id=100", text: "root" },
          { href: "/item?id=300", text: "parent" },
          { href: "/item?id=100#300", text: "context" },
          { href: "/item?id=100", text: "Nested thread title" },
        ],
      }),
    ).toEqual({
      routeItemId: "500",
      storyId: "100",
      title: "Nested thread title",
    });
  });
});
