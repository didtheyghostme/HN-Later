import {
  getCommentStarsById,
  getThreadsById,
  setCommentStarsById,
  setThreadsById,
} from "./hnLaterStorage";
import type { StarredCommentRecord } from "./hnCommentStars";
import type { FrozenProgress, ThreadRecord, ThreadStats, ThreadStatus } from "./hnStorage";

export const HN_LATER_EXPORT_SCHEMA_VERSION = 2 as const;

type HnLaterExportV1 = {
  schemaVersion: 1;
  exportedAt: number; // epoch ms
  threadsById: Record<string, ThreadRecord>;
};

export type HnLaterExportV2 = {
  schemaVersion: typeof HN_LATER_EXPORT_SCHEMA_VERSION;
  exportedAt: number; // epoch ms
  threadsById: Record<string, ThreadRecord>;
  commentStarsById: Record<string, StarredCommentRecord>;
};

export type HnLaterImportMode = "merge" | "replace";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertSafeRecordKey(key: string): void {
  // Avoid prototype pollution footguns.
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    throw new Error(`Invalid thread id "${key}" in backup file.`);
  }
}

function parseThreadStatus(value: unknown): ThreadStatus | undefined {
  if (value == null) return undefined;
  if (value === "active" || value === "finished" || value === "archived") return value;
  throw new Error(`Invalid thread status in backup: ${JSON.stringify(value)}`);
}

function parseFrozenProgress(value: unknown): FrozenProgress | undefined {
  if (value == null) return undefined;
  if (!isPlainObject(value)) throw new Error("Invalid frozenProgress in backup (expected object).");

  const totalComments = value.totalComments;
  const readCount = value.readCount;
  const percent = value.percent;

  if (!isFiniteNumber(totalComments) || !isFiniteNumber(readCount) || !isFiniteNumber(percent)) {
    throw new Error("Invalid frozenProgress in backup (expected numeric fields).");
  }

  return { totalComments, readCount, percent };
}

function parseThreadStats(value: unknown): ThreadStats | undefined {
  if (value == null) return undefined;
  if (!isPlainObject(value)) throw new Error("Invalid cachedStats in backup (expected object).");

  const totalComments = value.totalComments;
  const readCount = value.readCount;
  const percent = value.percent;
  const newCount = value.newCount;

  if (!isFiniteNumber(totalComments) || !isFiniteNumber(readCount) || !isFiniteNumber(percent)) {
    throw new Error("Invalid cachedStats in backup (expected numeric fields).");
  }
  if (newCount != null && !isFiniteNumber(newCount)) {
    throw new Error("Invalid cachedStats.newCount in backup (expected number).");
  }

  return newCount != null ? { totalComments, readCount, percent, newCount } : { totalComments, readCount, percent };
}

function parseSeenNewCommentIds(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error("Invalid seenNewCommentIds in backup (expected array).");
  const out: number[] = [];
  for (const v of value) {
    if (isFiniteNumber(v)) out.push(v);
  }
  return out.length ? out : undefined;
}

function parseReadCommentIds(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error("Invalid readCommentIds in backup (expected array).");
  const out: number[] = [];
  for (const v of value) {
    if (isFiniteNumber(v)) out.push(v);
  }
  return out.length ? out : undefined;
}

function parseOptionalTrimmedStringField(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName} in backup (expected string).`);
  }
  const t = value.trim();
  return t.length ? t : undefined;
}

function parseStarredCommentRecord(idFromKey: string, value: unknown): StarredCommentRecord {
  assertSafeRecordKey(idFromKey);
  if (!isPlainObject(value))
    throw new Error(`Invalid starred comment record for "${idFromKey}" (expected object).`);

  const commentIdRaw = value.commentId;
  const commentIdFromKey = Number(idFromKey);
  const commentId = isFiniteNumber(commentIdRaw)
    ? commentIdRaw
    : isFiniteNumber(commentIdFromKey)
      ? commentIdFromKey
      : undefined;
  if (!isFiniteNumber(commentId)) {
    throw new Error(`Invalid commentId for starred comment "${idFromKey}" in backup (expected number).`);
  }

  const storyId = value.storyId;
  const storyTitle = value.storyTitle;
  const storyUrl = value.storyUrl;
  const starredAt = value.starredAt;

  if (!isNonEmptyString(storyId))
    throw new Error(`Invalid storyId for starred comment "${idFromKey}" in backup.`);
  if (!isNonEmptyString(storyTitle))
    throw new Error(`Invalid storyTitle for starred comment "${idFromKey}" in backup.`);
  if (!isNonEmptyString(storyUrl))
    throw new Error(`Invalid storyUrl for starred comment "${idFromKey}" in backup.`);
  if (!isFiniteNumber(starredAt))
    throw new Error(`Invalid starredAt for starred comment "${idFromKey}" in backup (expected number).`);

  const author = parseOptionalTrimmedStringField(value.author, "author");
  const snippet = parseOptionalTrimmedStringField(value.snippet, "snippet");
  const note = parseOptionalTrimmedStringField(value.note, "note");
  const noteUpdatedAtRaw = value.noteUpdatedAt;
  const noteUpdatedAt =
    noteUpdatedAtRaw == null
      ? undefined
      : isFiniteNumber(noteUpdatedAtRaw)
        ? noteUpdatedAtRaw
        : (() => {
            throw new Error(
              `Invalid noteUpdatedAt for starred comment "${idFromKey}" in backup (expected number).`,
            );
          })();

  return {
    commentId,
    storyId: storyId.trim(),
    storyTitle: storyTitle.trim(),
    storyUrl: storyUrl.trim(),
    starredAt,
    ...(author ? { author } : {}),
    ...(snippet ? { snippet } : {}),
    ...(note ? { note } : {}),
    ...(noteUpdatedAt != null ? { noteUpdatedAt } : {}),
  };
}

function parseCommentStarsById(value: unknown): Record<string, StarredCommentRecord> {
  if (value == null) return {};
  if (!isPlainObject(value)) throw new Error('Invalid backup commentStarsById (expected an object like {"123": {...}}).');

  const out: Record<string, StarredCommentRecord> = {};
  for (const [key, v] of Object.entries(value)) {
    const record = parseStarredCommentRecord(key, v);
    out[String(record.commentId)] = record;
  }
  return out;
}

function parseThreadRecord(idFromKey: string, value: unknown): ThreadRecord {
  assertSafeRecordKey(idFromKey);
  if (!isPlainObject(value)) throw new Error(`Invalid thread record for "${idFromKey}" (expected object).`);

  const idRaw = value.id;
  const id = isNonEmptyString(idRaw) ? idRaw : idFromKey;
  if (!isNonEmptyString(id)) throw new Error("Invalid thread record id in backup.");

  const title = value.title;
  const url = value.url;
  const addedAt = value.addedAt;

  if (!isNonEmptyString(title)) throw new Error(`Invalid title for "${id}" in backup.`);
  if (!isNonEmptyString(url)) throw new Error(`Invalid url for "${id}" in backup.`);
  if (!isFiniteNumber(addedAt)) throw new Error(`Invalid addedAt for "${id}" in backup (expected number).`);

  const hnPostedAt = value.hnPostedAt;
  const lastVisitedAt = value.lastVisitedAt;
  const statusChangedAt = value.statusChangedAt;
  const lastReadCommentId = value.lastReadCommentId;
  const readCommentIds = value.readCommentIds;
  const dismissNewAboveUntilId = value.dismissNewAboveUntilId;
  const maxSeenCommentId = value.maxSeenCommentId;

  const status = parseThreadStatus(value.status);
  const frozenProgress = parseFrozenProgress(value.frozenProgress);
  const seenNewCommentIds = parseSeenNewCommentIds(value.seenNewCommentIds);
  const parsedReadCommentIds = parseReadCommentIds(readCommentIds);
  const cachedStats = parseThreadStats(value.cachedStats);

  const out: ThreadRecord = {
    id,
    title,
    url,
    addedAt,
    ...(isFiniteNumber(hnPostedAt) ? { hnPostedAt } : {}),
    ...(isFiniteNumber(lastVisitedAt) ? { lastVisitedAt } : {}),
    ...(status ? { status } : {}),
    ...(frozenProgress ? { frozenProgress } : {}),
    ...(isFiniteNumber(statusChangedAt) ? { statusChangedAt } : {}),
    ...(isFiniteNumber(lastReadCommentId) ? { lastReadCommentId } : {}),
    ...(parsedReadCommentIds ? { readCommentIds: parsedReadCommentIds } : {}),
    ...(isFiniteNumber(dismissNewAboveUntilId) ? { dismissNewAboveUntilId } : {}),
    ...(isFiniteNumber(maxSeenCommentId) ? { maxSeenCommentId } : {}),
    ...(seenNewCommentIds ? { seenNewCommentIds } : {}),
    ...(cachedStats ? { cachedStats } : {}),
  };

  return out;
}

export async function exportHnLaterData(): Promise<HnLaterExportV2> {
  const threadsById = await getThreadsById();
  const commentStarsById = await getCommentStarsById();
  return {
    schemaVersion: HN_LATER_EXPORT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    threadsById,
    commentStarsById,
  };
}

export function parseHnLaterBackupText(fileText: string): HnLaterExportV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${msg}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Invalid backup format: expected a JSON object at the top level.");
  }

  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== HN_LATER_EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported backup schemaVersion: ${JSON.stringify(schemaVersion)} (expected 1 or ${HN_LATER_EXPORT_SCHEMA_VERSION}).`,
    );
  }

  const exportedAt = parsed.exportedAt;
  if (!isFiniteNumber(exportedAt)) {
    throw new Error("Invalid backup exportedAt (expected a number).");
  }

  const rawThreadsById = parsed.threadsById;
  if (!isPlainObject(rawThreadsById)) {
    throw new Error('Invalid backup threadsById (expected an object like {"123": {...}}).');
  }

  const threadsById: Record<string, ThreadRecord> = {};
  for (const [key, value] of Object.entries(rawThreadsById)) {
    const record = parseThreadRecord(key, value);
    threadsById[record.id] = record;
  }

  const commentStarsById =
    schemaVersion === 1 ? {} : parseCommentStarsById((parsed as Record<string, unknown>).commentStarsById);

  return {
    schemaVersion: HN_LATER_EXPORT_SCHEMA_VERSION,
    exportedAt,
    threadsById,
    commentStarsById,
  };
}

export async function importHnLaterData(
  fileText: string,
  mode: HnLaterImportMode,
): Promise<{ importedCount: number }> {
  const backup = parseHnLaterBackupText(fileText);
  const importedCount = Object.keys(backup.threadsById).length;

  if (mode === "replace") {
    await setThreadsById(backup.threadsById);
    await setCommentStarsById(backup.commentStarsById);
    return { importedCount };
  }

  const current = await getThreadsById();
  const merged: Record<string, ThreadRecord> = { ...current, ...backup.threadsById };
  await setThreadsById(merged);

  const currentStars = await getCommentStarsById();
  const mergedStars: Record<string, StarredCommentRecord> = {
    ...currentStars,
    ...backup.commentStarsById,
  };
  await setCommentStarsById(mergedStars);
  return { importedCount };
}

