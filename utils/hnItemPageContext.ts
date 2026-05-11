const HN_BASE_URL = "https://news.ycombinator.com/";
const NAV_ITEM_LINK_LABELS = new Set(["root", "parent", "context", "prev", "next"]);

export type HnItemPageLink = {
  href: string | null | undefined;
  text: string | null | undefined;
};

export type HnItemPageContextInput = {
  routeItemId?: string | null | undefined;
  titleLineTitle?: string | null | undefined;
  docTitle?: string | null | undefined;
  topCommentItemLinks?: HnItemPageLink[] | null | undefined;
};

export type HnItemPageContext = {
  routeItemId?: string;
  storyId?: string;
  title: string;
};

function normalizePositiveIntegerString(value: string | null | undefined): string | undefined {
  const s = value?.trim();
  if (!s) return undefined;
  if (!/^\d+$/.test(s)) return undefined;

  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) return undefined;
  return String(n);
}

function sanitizeDocTitle(docTitle: string | null | undefined): string | undefined {
  const s = docTitle?.replace(/\s*\|\s*Hacker News\s*$/i, "").trim();
  return s || undefined;
}

function isAgeLinkLabel(text: string): boolean {
  return /\bago$/i.test(text.trim());
}

function getTitleFromCommentItemLinks(
  links: HnItemPageLink[] | null | undefined,
): string | undefined {
  let title: string | undefined;

  for (const link of links ?? []) {
    if (!parseHnItemIdFromHref(link.href)) continue;

    const text = link.text?.trim();
    if (!text) continue;
    if (NAV_ITEM_LINK_LABELS.has(text.toLowerCase())) continue;
    if (isAgeLinkLabel(text)) continue;

    title = text;
  }

  return title;
}

export function parseHnItemIdFromHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;

  try {
    const url = new URL(href, HN_BASE_URL);
    if (url.origin !== new URL(HN_BASE_URL).origin) return undefined;
    if (url.pathname !== "/item") return undefined;
    return normalizePositiveIntegerString(url.searchParams.get("id"));
  } catch {
    return undefined;
  }
}

export function resolveHnItemPageContext(input: HnItemPageContextInput): HnItemPageContext {
  const routeItemId = normalizePositiveIntegerString(input.routeItemId);

  let storyId = routeItemId;
  for (const link of input.topCommentItemLinks ?? []) {
    const candidate = parseHnItemIdFromHref(link.href);
    if (!candidate) continue;
    if (!storyId || Number(candidate) < Number(storyId)) {
      storyId = candidate;
    }
  }

  const title =
    input.titleLineTitle?.trim() ||
    getTitleFromCommentItemLinks(input.topCommentItemLinks) ||
    sanitizeDocTitle(input.docTitle) ||
    "Hacker News";

  return {
    routeItemId,
    storyId,
    title,
  };
}
