import { describe, expect, it } from "vitest";

import {
  getHnProfileThreadsUsernameFromUrl,
  isProfileThreadsCommentAuthor,
} from "./hnProfileThreadsPage";

describe("getHnProfileThreadsUsernameFromUrl", () => {
  it("reads the profile username from threads pages", () => {
    expect(
      getHnProfileThreadsUsernameFromUrl(new URL("https://news.ycombinator.com/threads?id=dang")),
    ).toBe("dang");
  });

  it("trims the username", () => {
    expect(
      getHnProfileThreadsUsernameFromUrl(
        new URL("https://news.ycombinator.com/threads?id=%20pg%20"),
      ),
    ).toBe("pg");
  });

  it("ignores threads pages without a username", () => {
    expect(
      getHnProfileThreadsUsernameFromUrl(new URL("https://news.ycombinator.com/threads")),
    ).toBe(undefined);
    expect(
      getHnProfileThreadsUsernameFromUrl(new URL("https://news.ycombinator.com/threads?id=")),
    ).toBe(undefined);
  });

  it("does not match non-threads pages", () => {
    expect(
      getHnProfileThreadsUsernameFromUrl(new URL("https://news.ycombinator.com/posts?id=dang")),
    ).toBe(undefined);
    expect(
      getHnProfileThreadsUsernameFromUrl(new URL("https://news.ycombinator.com/user?id=dang")),
    ).toBe(undefined);
    expect(
      getHnProfileThreadsUsernameFromUrl(new URL("https://news.ycombinator.com/item?id=123")),
    ).toBe(undefined);
    expect(getHnProfileThreadsUsernameFromUrl(new URL("https://news.ycombinator.com/news"))).toBe(
      undefined,
    );
  });
});

describe("isProfileThreadsCommentAuthor", () => {
  it("matches the viewed profile username to the comment author text", () => {
    expect(isProfileThreadsCommentAuthor("dang", "dang")).toBe(true);
    expect(isProfileThreadsCommentAuthor("dang", " dang ")).toBe(true);
  });

  it("does not match different or missing author text", () => {
    expect(isProfileThreadsCommentAuthor("dang", "pg")).toBe(false);
    expect(isProfileThreadsCommentAuthor("dang", "")).toBe(false);
    expect(isProfileThreadsCommentAuthor("dang", null)).toBe(false);
    expect(isProfileThreadsCommentAuthor("dang", undefined)).toBe(false);
  });
});
