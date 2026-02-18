import { getCommentStarsById, setCommentStarsById } from "./hnLaterStorage";

export type StarredCommentRecord = {
  commentId: number;
  storyId: string;
  storyTitle: string;
  storyUrl: string;
  author?: string;
  snippet?: string;
  starredAt: number;
  note?: string;
  noteUpdatedAt?: number;
};

function keyForCommentId(commentId: number): string | null {
  if (!Number.isSafeInteger(commentId)) return null;
  if (commentId <= 0) return null;
  return String(commentId);
}

function trimOrUndefined(s: string | undefined): string | undefined {
  if (s == null) return undefined;
  const t = s.trim();
  return t.length ? t : undefined;
}

export async function getStarredCommentsById(): Promise<Record<string, StarredCommentRecord>> {
  return await getCommentStarsById();
}

export async function getStarredComment(
  commentId: number,
): Promise<StarredCommentRecord | undefined> {
  const key = keyForCommentId(commentId);
  if (!key) return undefined;
  const starsById = await getCommentStarsById();
  return starsById[key];
}

export async function listStarredComments(): Promise<StarredCommentRecord[]> {
  const starsById = await getCommentStarsById();
  const values = Object.values(starsById);
  return values.sort((a, b) => {
    const byStarredAt = (b.starredAt ?? 0) - (a.starredAt ?? 0);
    if (byStarredAt !== 0) return byStarredAt;
    return (b.commentId ?? 0) - (a.commentId ?? 0);
  });
}

export async function upsertStarredComment(record: StarredCommentRecord): Promise<void> {
  const key = keyForCommentId(record.commentId);
  if (!key) return;

  const starsById = await getCommentStarsById();
  starsById[key] = {
    ...record,
    storyId: record.storyId.trim(),
    storyTitle: record.storyTitle.trim(),
    storyUrl: record.storyUrl.trim(),
    author: trimOrUndefined(record.author),
    snippet: trimOrUndefined(record.snippet),
    note: trimOrUndefined(record.note),
  };
  await setCommentStarsById(starsById);
}

export async function removeStarredComment(commentId: number): Promise<void> {
  const key = keyForCommentId(commentId);
  if (!key) return;

  const starsById = await getCommentStarsById();
  if (!Object.prototype.hasOwnProperty.call(starsById, key)) return;
  delete starsById[key];
  await setCommentStarsById(starsById);
}

export async function setStarredCommentNote(commentId: number, note: string): Promise<void> {
  const key = keyForCommentId(commentId);
  if (!key) return;

  const starsById = await getCommentStarsById();
  const existing = starsById[key];
  if (!existing) return;

  const nextNote = trimOrUndefined(note);
  const prevNote = trimOrUndefined(existing.note);

  // No-op if nothing changes.
  if (nextNote === prevNote) return;

  starsById[key] = {
    ...existing,
    ...(nextNote ? { note: nextNote, noteUpdatedAt: Date.now() } : { note: undefined, noteUpdatedAt: undefined }),
  };
  await setCommentStarsById(starsById);
}

