import type { FrozenProgress, ThreadStats, ThreadStatus } from "./hnStorage";

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function getNextPercent(totalComments: number, readCount: number): number {
  if (totalComments === 0) return 0;
  return Math.round((readCount / totalComments) * 100);
}

function toFrozenProgress(stats: ThreadStats): FrozenProgress {
  return {
    totalComments: stats.totalComments,
    readCount: stats.readCount,
    percent: stats.percent,
  };
}

export function applyStoredStorySummaryDelta(input: {
  storedStats: ThreadStats | undefined;
  previousVisibleStats: Pick<ThreadStats, "readCount" | "newCount">;
  nextVisibleStats: Pick<ThreadStats, "readCount" | "newCount">;
  status: ThreadStatus | undefined;
  frozenProgress: FrozenProgress | undefined;
}): {
  cachedStats: ThreadStats | undefined;
  frozenProgress: FrozenProgress | undefined;
} {
  const storedStats = input.storedStats;
  if (!storedStats) {
    return {
      cachedStats: undefined,
      frozenProgress: input.frozenProgress,
    };
  }

  const totalComments = Math.max(0, storedStats.totalComments);
  const readDelta = input.nextVisibleStats.readCount - input.previousVisibleStats.readCount;
  const previousNewCount = input.previousVisibleStats.newCount ?? 0;
  const nextNewCount = input.nextVisibleStats.newCount ?? 0;
  const newDelta = nextNewCount - previousNewCount;

  const readCount = clamp(storedStats.readCount + readDelta, 0, totalComments);
  const nextStats: ThreadStats = {
    totalComments,
    readCount,
    percent: getNextPercent(totalComments, readCount),
    newCount: clamp((storedStats.newCount ?? 0) + newDelta, 0, totalComments),
  };

  if (input.status === "archived") {
    return {
      cachedStats: nextStats,
      frozenProgress: toFrozenProgress(nextStats),
    };
  }

  if (input.status === "finished" && (nextStats.newCount ?? 0) === 0) {
    return {
      cachedStats: nextStats,
      frozenProgress: {
        totalComments,
        readCount: totalComments,
        percent: totalComments === 0 ? 0 : 100,
      },
    };
  }

  return {
    cachedStats: nextStats,
    frozenProgress: input.frozenProgress,
  };
}
