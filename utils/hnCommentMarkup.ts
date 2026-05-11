export const HN_COMMENT_BASE_URL = "https://news.ycombinator.com/";

const ALLOWED_TAGS = new Set(["p", "br", "a", "i", "pre", "code"]);
const BLOCKED_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "template",
  "noscript",
]);

type HtmlToken = { type: "text"; raw: string } | { type: "tag"; raw: string } | { type: "comment" };

type ParsedHtmlTag = {
  name: string;
  attrsRaw: string;
  closing: boolean;
  selfClosing: boolean;
};

export type CapturedStarredCommentContent = {
  commentText?: string;
  commentHtml?: string;
};

export function buildCapturedStarredCommentContent(input: {
  textContent?: string | null;
  innerText?: string | null;
  innerHtml?: string | null;
}): CapturedStarredCommentContent {
  const commentText = trimNonEmpty(input.textContent) ?? trimNonEmpty(input.innerText);
  if (!commentText) return {};

  const commentHtml = sanitizeStarredCommentHtml(input.innerHtml);
  return commentHtml ? { commentText, commentHtml } : { commentText };
}

export function sanitizeStarredCommentHtml(input: string | null | undefined): string | undefined {
  const raw = input?.trim();
  if (!raw) return undefined;

  let out = "";
  const openTags: string[] = [];
  const blockedTags: string[] = [];

  for (const token of tokenizeHtmlFragment(raw)) {
    if (token.type === "comment") continue;

    if (token.type === "text") {
      if (blockedTags.length) continue;
      out += token.raw;
      continue;
    }

    const tag = parseHtmlTag(token.raw);
    if (!tag) {
      if (!blockedTags.length) out += escapeHtml(token.raw);
      continue;
    }

    if (tag.closing) {
      if (blockedTags.length) {
        closeBlockedTag(blockedTags, tag.name);
        continue;
      }
      if (!ALLOWED_TAGS.has(tag.name)) continue;
      out += closeOpenTag(openTags, tag.name);
      continue;
    }

    if (BLOCKED_TAGS.has(tag.name)) {
      if (!tag.selfClosing) blockedTags.push(tag.name);
      continue;
    }

    if (blockedTags.length) continue;
    if (!ALLOWED_TAGS.has(tag.name)) continue;

    if (tag.name === "br") {
      out += "<br>";
      continue;
    }

    if (tag.name === "p" || tag.name === "a") {
      out += closeOpenTag(openTags, tag.name);
    }

    const startTag = buildStartTag(tag);
    if (!startTag) continue;

    out += startTag;
    if (!tag.selfClosing) openTags.push(tag.name);
  }

  out += closeAllTags(openTags);

  const sanitized = normalizeTopLevelParagraphs(out.trim());
  if (!sanitized.length) return undefined;
  return hasRenderableText(sanitized) ? sanitized : undefined;
}

function trimNonEmpty(s: string | null | undefined): string | undefined {
  if (s == null) return undefined;
  const trimmed = s.trim();
  return trimmed.length ? trimmed : undefined;
}

function tokenizeHtmlFragment(input: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let index = 0;

  while (index < input.length) {
    const ltIndex = input.indexOf("<", index);
    if (ltIndex === -1) {
      if (index < input.length) tokens.push({ type: "text", raw: input.slice(index) });
      break;
    }

    if (ltIndex > index) {
      tokens.push({ type: "text", raw: input.slice(index, ltIndex) });
    }

    if (input.startsWith("<!--", ltIndex)) {
      const commentEnd = input.indexOf("-->", ltIndex + 4);
      index = commentEnd === -1 ? input.length : commentEnd + 3;
      tokens.push({ type: "comment" });
      continue;
    }

    const tagEnd = findTagEnd(input, ltIndex + 1);
    if (tagEnd === -1) {
      tokens.push({ type: "text", raw: input.slice(ltIndex) });
      break;
    }

    tokens.push({ type: "tag", raw: input.slice(ltIndex, tagEnd + 1) });
    index = tagEnd + 1;
  }

  return tokens;
}

function findTagEnd(input: string, start: number): number {
  let quote: '"' | "'" | null = null;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === ">") return i;
  }

  return -1;
}

function parseHtmlTag(raw: string): ParsedHtmlTag | undefined {
  const match = /^<\s*(\/?)\s*([a-zA-Z0-9]+)\b([\s\S]*?)\s*(\/?)\s*>$/.exec(raw);
  if (!match) return undefined;

  return {
    closing: match[1] === "/",
    name: match[2].toLowerCase(),
    attrsRaw: match[3] ?? "",
    selfClosing: match[4] === "/",
  };
}

function buildStartTag(tag: ParsedHtmlTag): string | undefined {
  if (tag.name === "a") {
    const hrefRaw = extractAttribute(tag.attrsRaw, "href");
    const href = sanitizeHref(hrefRaw);
    if (!href) return undefined;

    return `<a href="${escapeHtmlAttribute(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
  }

  return `<${tag.name}>`;
}

function extractAttribute(attrsRaw: string, attrName: string): string | undefined {
  const match = new RegExp(
    `\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\\`]+))`,
    "i",
  ).exec(attrsRaw);

  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value == null ? undefined : decodeHtmlEntities(value.trim());
}

function sanitizeHref(rawHref: string | undefined): string | undefined {
  const href = rawHref?.trim();
  if (!href) return undefined;
  if (href.startsWith("#")) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(href, HN_COMMENT_BASE_URL);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return parsed.toString();
}

function closeBlockedTag(blockedTags: string[], tagName: string): void {
  const idx = blockedTags.lastIndexOf(tagName);
  if (idx === -1) return;
  blockedTags.length = idx;
}

function closeOpenTag(openTags: string[], tagName: string): string {
  const idx = openTags.lastIndexOf(tagName);
  if (idx === -1) return "";

  let out = "";
  for (let i = openTags.length - 1; i >= idx; i -= 1) {
    out += `</${openTags[i]}>`;
  }
  openTags.length = idx;
  return out;
}

function closeAllTags(openTags: string[]): string {
  let out = "";
  for (let i = openTags.length - 1; i >= 0; i -= 1) {
    out += `</${openTags[i]}>`;
  }
  openTags.length = 0;
  return out;
}

function normalizeTopLevelParagraphs(html: string): string {
  if (!html.length) return html;

  let out = "";
  let paragraphBuffer = "";
  const openTags: string[] = [];

  const flushParagraph = () => {
    const content = paragraphBuffer.trim();
    paragraphBuffer = "";
    if (!content.length) return;
    if (!hasRenderableText(content)) return;
    out += `<p>${content}</p>`;
  };

  for (const token of tokenizeHtmlFragment(html)) {
    if (token.type === "comment") continue;

    if (token.type === "text") {
      if (openTags.length) {
        out += token.raw;
      } else {
        paragraphBuffer += token.raw;
      }
      continue;
    }

    const tag = parseHtmlTag(token.raw);
    if (!tag) {
      if (openTags.length) {
        out += token.raw;
      } else {
        paragraphBuffer += token.raw;
      }
      continue;
    }

    if (!openTags.length) {
      if (!tag.closing && isBlockTag(tag.name)) {
        flushParagraph();
        out += token.raw;
        if (!tag.selfClosing) openTags.push(tag.name);
        continue;
      }

      paragraphBuffer += token.raw;
      continue;
    }

    out += token.raw;
    if (tag.closing) {
      closeTagStack(openTags, tag.name);
      continue;
    }

    if (!tag.selfClosing) openTags.push(tag.name);
  }

  flushParagraph();
  return out.trim();
}

function isBlockTag(tagName: string): boolean {
  return tagName === "p" || tagName === "pre";
}

function closeTagStack(openTags: string[], tagName: string): void {
  const idx = openTags.lastIndexOf(tagName);
  if (idx === -1) return;
  openTags.length = idx;
}

function hasRenderableText(html: string): boolean {
  const textOnly = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|a|i|pre|code)\b[^>]*>/gi, "")
    .trim();
  return decodeHtmlEntities(textOnly).trim().length > 0;
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos" || lower === "#39") return "'";

    if (lower.startsWith("#x")) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (lower.startsWith("#")) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return match;
  });
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
