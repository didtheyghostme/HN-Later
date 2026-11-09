const HN_ORIGIN = "https://news.ycombinator.com";

export function getHnUserLink(container: ParentNode | null): HTMLAnchorElement | null {
  // HN no longer consistently includes the `hnuser` class on username links.
  for (const link of container?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []) {
    try {
      const url = new URL(link.getAttribute("href") ?? "", HN_ORIGIN);
      if (
        url.origin === HN_ORIGIN &&
        url.pathname === "/user" &&
        url.searchParams.get("id")?.trim()
      ) {
        return link;
      }
    } catch {
      // Ignore malformed links and keep looking for the author's profile.
    }
  }

  return null;
}
