import { describe, expect, it } from "vitest";

import { buildCapturedStarredCommentContent, sanitizeStarredCommentHtml } from "./hnCommentMarkup";

describe("sanitizeStarredCommentHtml", () => {
  it("preserves supported HN formatting and rewrites relative links", () => {
    expect(
      sanitizeStarredCommentHtml(
        '<p>Hello <i>world</i> <a href="item?id=1">story</a></p><pre><code>const x = 1;</code></pre>',
      ),
    ).toBe(
      '<p>Hello <i>world</i> <a href="https://news.ycombinator.com/item?id=1" target="_blank" rel="noopener noreferrer nofollow">story</a></p><pre><code>const x = 1;</code></pre>',
    );
  });

  it("strips unsafe tags and attributes", () => {
    expect(
      sanitizeStarredCommentHtml(
        '<p><a href="javascript:alert(1)" onclick="evil()">click</a><script>alert(1)</script><span> ok</span></p>',
      ),
    ).toBe("<p>click ok</p>");
  });

  it("returns undefined when only blocked content remains", () => {
    expect(sanitizeStarredCommentHtml('<script>alert("x")</script>')).toBeUndefined();
  });

  it("wraps leading inline content into a synthetic paragraph", () => {
    expect(sanitizeStarredCommentHtml("Text with <i>inline</i> markup<p>Next paragraph</p>")).toBe(
      "<p>Text with <i>inline</i> markup</p><p>Next paragraph</p>",
    );
  });

  it("flushes a synthetic paragraph before a top-level pre block", () => {
    expect(
      sanitizeStarredCommentHtml(
        "Leading text<pre><code>const x = 1;</code></pre><p>Afterward</p>",
      ),
    ).toBe("<p>Leading text</p><pre><code>const x = 1;</code></pre><p>Afterward</p>");
  });

  it("normalizes the HN pattern of leading text followed by paragraph tags", () => {
    expect(
      sanitizeStarredCommentHtml(
        "Figuring out how to trust AI-written code faster is <i>the</i> project of software engineering for the next few years, IMO.<p>We'll need to figure out the techniques.</p>",
      ),
    ).toBe(
      "<p>Figuring out how to trust AI-written code faster is <i>the</i> project of software engineering for the next few years, IMO.</p><p>We'll need to figure out the techniques.</p>",
    );
  });
});

describe("buildCapturedStarredCommentContent", () => {
  it("keeps plain text and optional sanitized html", () => {
    expect(
      buildCapturedStarredCommentContent({
        textContent: "  Hello world  ",
        innerHtml: '<p>Hello <a href="/item?id=2">world</a></p>',
      }),
    ).toEqual({
      commentText: "Hello world",
      commentHtml:
        '<p>Hello <a href="https://news.ycombinator.com/item?id=2" target="_blank" rel="noopener noreferrer nofollow">world</a></p>',
    });
  });

  it("falls back to innerText when textContent is empty", () => {
    expect(
      buildCapturedStarredCommentContent({
        textContent: "   ",
        innerText: "Visible text",
        innerHtml: "<p>Visible text</p>",
      }),
    ).toEqual({
      commentText: "Visible text",
      commentHtml: "<p>Visible text</p>",
    });
  });
});
