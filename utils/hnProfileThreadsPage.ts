export function getHnProfileThreadsUsernameFromUrl(url: URL): string | undefined {
  if (url.pathname !== "/threads") return undefined;

  const username = url.searchParams.get("id")?.trim();
  return username || undefined;
}

export function isProfileThreadsCommentAuthor(
  profileUsername: string,
  commentAuthorText: string | null | undefined,
): boolean {
  return commentAuthorText?.trim() === profileUsername;
}
