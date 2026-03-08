import { describe, expect, it, vi } from "vitest";

vi.mock("./hnLaterStorage", () => ({
  getCommentStarsById: vi.fn(async () => ({})),
  getThreadsById: vi.fn(async () => ({})),
  setCommentStarsById: vi.fn(async () => {}),
  setThreadsById: vi.fn(async () => {}),
}));

import { HN_LATER_EXPORT_SCHEMA_VERSION, parseHnLaterBackupText } from "./hnImportExport";

function makeBackup(overrides?: { commentHtml?: string; omitCommentHtml?: boolean }) {
  const star = {
    commentId: 10,
    storyId: "1",
    storyTitle: "Example story",
    storyUrl: "https://news.ycombinator.com/item?id=1",
    author: "pg",
    commentText: "hello world",
    starredAt: 20,
    ...(overrides?.omitCommentHtml
      ? {}
      : { commentHtml: overrides?.commentHtml ?? "<p>hello world</p>" }),
  };

  return JSON.stringify({
    schemaVersion: HN_LATER_EXPORT_SCHEMA_VERSION,
    exportedAt: 123,
    threadsById: {
      "1": {
        id: "1",
        title: "Example story",
        url: "https://news.ycombinator.com/item?id=1",
        addedAt: 10,
      },
    },
    commentStarsById: {
      "10": star,
    },
  });
}

describe("parseHnLaterBackupText", () => {
  it("round-trips optional commentHtml", () => {
    const parsed = parseHnLaterBackupText(
      makeBackup({ commentHtml: '<p>hello <a href="item?id=1">world</a></p>' }),
    );

    expect(parsed.commentStarsById["10"]?.commentHtml).toBe(
      '<p>hello <a href="https://news.ycombinator.com/item?id=1" target="_blank" rel="noopener noreferrer nofollow">world</a></p>',
    );
  });

  it("accepts older backups without commentHtml", () => {
    const parsed = parseHnLaterBackupText(makeBackup({ omitCommentHtml: true }));
    expect(parsed.commentStarsById["10"]?.commentHtml).toBeUndefined();
  });

  it("sanitizes imported commentHtml", () => {
    const parsed = parseHnLaterBackupText(
      makeBackup({ commentHtml: '<script>alert(1)</script><a href="javascript:evil()">click</a>' }),
    );

    expect(parsed.commentStarsById["10"]?.commentHtml).toBe("click");
  });
});
