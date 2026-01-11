import React from "react";
import { createRoot } from "react-dom/client";
import { browser, type Browser } from "wxt/browser";

import "../../assets/tailwind.css";

import { getHnLaterService, type HnLaterServiceResult } from "../../utils/hnLaterService";
import {
  listThreads,
  removeThread,
  resetProgress,
  unarchiveThread,
  setFrozenProgress,
  setThreadStatus,
  type FrozenProgress,
  type ThreadRecord,
  type ThreadStatus,
} from "../../utils/hnStorage";

const hnLaterService = getHnLaterService();

function formatPercent(percent: number | undefined) {
  if (percent == null) return "—";
  return `${percent}%`;
}

function formatExact(ms: number | undefined) {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

function formatRelative(ms: number | undefined) {
  if (ms == null) return "—";

  const now = Date.now();
  const diffMs = now - ms;
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "just now";

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const fmt = new Intl.DateTimeFormat("en-GB", sameYear
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
  return fmt.format(d);
}

function titleCase(s: string) {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function MoreDropdown({
  children,
  onSelect,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
}) {
  const detailsRef = React.useRef<HTMLDetailsElement>(null);

  const handleItemClick = (callback: () => void) => {
    callback();
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
    onSelect?.();
  };

  return (
    <details ref={detailsRef} className="dropdown dropdown-end">
      <summary className="btn btn-square btn-ghost btn-xs">⋮</summary>
      <ul className="menu dropdown-content w-32 rounded-box bg-base-100 p-1 shadow">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return (
              <li>
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    handleItemClick(child.props.onClick);
                  }}
                >
                  {child.props.children}
                </a>
              </li>
            );
          }
          return null;
        })}
      </ul>
    </details>
  );
}

function App() {
  const [threads, setThreads] = React.useState<ThreadRecord[]>([]);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ThreadStatus | "all">("active");

  const refresh = React.useCallback(async () => {
    const next = await listThreads();
    setThreads(next);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (!changes["hnLater:threadsById"]) return;
      refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = threads;
    if (view !== "all") base = base.filter((t) => (t.status ?? "active") === view);
    if (!q) return base;
    return base.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, query, view]);

  async function onOpen(storyId: string) {
    setStatus(null);
    const res: HnLaterServiceResult = await hnLaterService.open(storyId);
    if (!res.ok) setStatus(res.error ?? "Failed to open thread");
  }

  async function onContinue(storyId: string) {
    setStatus(null);
    const res: HnLaterServiceResult = await hnLaterService.continue(storyId);
    if (!res.ok) setStatus(res.error ?? "Failed to continue");
  }

  async function onFinish(storyId: string) {
    setStatus(null);
    const res: HnLaterServiceResult = await hnLaterService.finish(storyId);
    if (!res.ok) setStatus(res.error ?? "Failed to finish");
  }

  async function onArchive(thread: ThreadRecord) {
    setStatus(null);
    const stats = thread.cachedStats;
    const frozen: FrozenProgress | undefined = stats
      ? { totalComments: stats.totalComments, readCount: stats.readCount, percent: stats.percent }
      : undefined;
    await setThreadStatus(thread.id, "archived");
    await setFrozenProgress(thread.id, frozen);
    await refresh();
  }

  async function onUnarchive(storyId: string) {
    setStatus(null);
    await unarchiveThread(storyId);
    await refresh();
  }

  async function onReset(storyId: string) {
    setStatus(null);
    await resetProgress(storyId);
    await refresh();
  }

  async function onRemove(storyId: string) {
    setStatus(null);
    await removeThread(storyId);
    await refresh();
  }

  return (
    <div className="w-[380px] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">HN Later</div>
        <div className="text-xs opacity-70">{threads.length} saved</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          className={view === "active" ? "btn btn-primary btn-xs" : "btn btn-ghost btn-xs"}
          onClick={() => setView("active")}
        >
          Active
        </button>
        <button
          className={view === "finished" ? "btn btn-primary btn-xs" : "btn btn-ghost btn-xs"}
          onClick={() => setView("finished")}
        >
          Finished
        </button>
        <button
          className={view === "archived" ? "btn btn-primary btn-xs" : "btn btn-ghost btn-xs"}
          onClick={() => setView("archived")}
        >
          Archived
        </button>
        <button
          className={view === "all" ? "btn btn-primary btn-xs" : "btn btn-ghost btn-xs"}
          onClick={() => setView("all")}
        >
          All
        </button>
      </div>

      <div className="mt-2">
        <input
          className="input input-sm input-bordered w-full"
          placeholder="Search saved threads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-base-200 p-3 text-xs opacity-70">
            No saved threads yet. On Hacker News, click “later” on a story or “Save” on an item
            page.
          </div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="rounded-lg bg-base-200 p-2">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  {(() => {
                    const s = (t.status ?? "active") as ThreadStatus;
                    const statusLabel =
                      s === "finished" ? "Finished" : s === "archived" ? "Archived" : undefined;
                    const tooltipLines: string[] = [];
                    if (t.hnPostedAt != null) tooltipLines.push(`Posted: ${formatExact(t.hnPostedAt)}`);
                    tooltipLines.push(`Saved: ${formatExact(t.addedAt)}`);
                    if (t.lastVisitedAt != null) tooltipLines.push(`Last visited: ${formatExact(t.lastVisitedAt)}`);
                    if (statusLabel && t.statusChangedAt != null) {
                      tooltipLines.push(`${statusLabel}: ${formatExact(t.statusChangedAt)}`);
                    }
                    const tooltip = tooltipLines.join("\n");

                    return (
                      <>
                        <div className="line-clamp-2 text-sm font-medium" title={tooltip}>
                          {t.title}
                        </div>
                        <div className="mt-1 text-[11px] opacity-70" title={tooltip}>
                          Saved {formatRelative(t.addedAt)} · Visited {formatRelative(t.lastVisitedAt)}
                        </div>
                      </>
                    );
                  })()}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] opacity-70">
                    {(() => {
                      const s = (t.status ?? "active") as ThreadStatus;
                      const progress =
                        s === "active" ? t.cachedStats : (t.frozenProgress ?? t.cachedStats);
                      return (
                        <>
                          <span className="badge badge-ghost badge-sm">
                            {formatPercent(progress?.percent)}
                          </span>
                          <span>
                            {progress
                              ? `${progress.readCount}/${progress.totalComments} read`
                              : "No progress yet"}
                          </span>
                        </>
                      );
                    })()}
                    {t.cachedStats?.newCount != null ? (
                      <span className="badge badge-warning badge-sm">
                        {t.cachedStats.newCount} new
                      </span>
                    ) : null}
                    {(t.status ?? "active") !== "active" ? (
                      <span className="badge badge-ghost badge-sm">
                        {titleCase(t.status ?? "active")}
                      </span>
                    ) : null}
                  </div>
                </div>
                {(t.status ?? "active") === "active" ? (
                  <MoreDropdown>
                    <button onClick={() => onFinish(t.id)}>Mark as Finished</button>
                    <button onClick={() => onArchive(t)}>Archive</button>
                    <button onClick={() => onReset(t.id)}>Reset</button>
                    <button onClick={() => onRemove(t.id)}>Remove</button>
                  </MoreDropdown>
                ) : (
                  <MoreDropdown>
                    <button onClick={() => onUnarchive(t.id)}>Unarchive</button>
                    <button onClick={() => onRemove(t.id)}>Remove</button>
                  </MoreDropdown>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button className="btn btn-xs" onClick={() => onOpen(t.id)}>
                  Open
                </button>
                {(t.status ?? "active") === "active" ? (
                  <button className="btn btn-primary btn-xs" onClick={() => onContinue(t.id)}>
                    Continue
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {status ? (
        <div className="mt-3 rounded-lg bg-error/10 p-2 text-xs text-error">{status}</div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
