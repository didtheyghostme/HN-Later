import { defineExtensionStorage } from "@webext-core/storage";
import { browser } from "wxt/browser";

import type { StarredCommentRecord } from "./hnCommentStars";
import type { ThreadRecord } from "./hnStorage";

export const THREADS_BY_ID_KEY = "hnLater:threadsById" as const;
export const COMMENT_STARS_BY_ID_KEY = "hnLater:commentStarsById" as const;

export type HnLaterStorageSchema = {
  [THREADS_BY_ID_KEY]: Record<string, ThreadRecord> | null;
  [COMMENT_STARS_BY_ID_KEY]: Record<string, StarredCommentRecord> | null;
};

export const hnLaterStorage = defineExtensionStorage<HnLaterStorageSchema>(browser.storage.local);

export async function getThreadsById(): Promise<Record<string, ThreadRecord>> {
  const value = await hnLaterStorage.getItem(THREADS_BY_ID_KEY);
  return value ?? {};
}

export async function setThreadsById(next: Record<string, ThreadRecord>): Promise<void> {
  await hnLaterStorage.setItem(THREADS_BY_ID_KEY, next);
}

export async function getCommentStarsById(): Promise<Record<string, StarredCommentRecord>> {
  const value = await hnLaterStorage.getItem(COMMENT_STARS_BY_ID_KEY);
  return value ?? {};
}

export async function setCommentStarsById(
  next: Record<string, StarredCommentRecord>,
): Promise<void> {
  await hnLaterStorage.setItem(COMMENT_STARS_BY_ID_KEY, next);
}


