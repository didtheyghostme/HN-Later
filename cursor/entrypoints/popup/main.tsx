import React from 'react';
import { createRoot } from 'react-dom/client';

import '../../assets/tailwind.css';

import {
  listThreads,
  removeThread,
  resetProgress,
  type ThreadRecord
} from '../../utils/hnStorage';

type BgResponse = { ok: boolean; tabId?: number; error?: string };

async function sendToBackground(message: unknown): Promise<BgResponse> {
  return (await chrome.runtime.sendMessage(message)) as BgResponse;
}

function formatPercent(percent: number | undefined) {
  if (percent == null) return '—';
  return `${percent}%`;
}

function App() {
  const [threads, setThreads] = React.useState<ThreadRecord[]>([]);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const next = await listThreads();
    setThreads(next);
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (!changes['hnLater:threadsById']) return;
      refresh();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, query]);

  async function onOpen(storyId: string) {
    setStatus(null);
    const res = await sendToBackground({ type: 'hnLater/open', storyId });
    if (!res.ok) setStatus(res.error ?? 'Failed to open thread');
  }

  async function onContinue(storyId: string) {
    setStatus(null);
    const res = await sendToBackground({ type: 'hnLater/continue', storyId });
    if (!res.ok) setStatus(res.error ?? 'Failed to continue');
  }

  async function onJumpToNew(storyId: string) {
    setStatus(null);
    const res = await sendToBackground({ type: 'hnLater/jumpToNew', storyId });
    if (!res.ok) setStatus(res.error ?? 'Failed to jump to new');
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

      <div className="mt-2">
        <input
          className="input input-bordered input-sm w-full"
          placeholder="Search saved threads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-base-200 p-3 text-xs opacity-70">
            No saved threads yet. On Hacker News, click “later” on a story or
            “Save” on an item page.
          </div>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="rounded-lg bg-base-200 p-2">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium">{t.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] opacity-70">
                    <span className="badge badge-ghost badge-sm">
                      {formatPercent(t.cachedStats?.percent)}
                    </span>
                    <span>
                      {t.cachedStats
                        ? `${t.cachedStats.readCount}/${t.cachedStats.totalComments} read`
                        : 'No progress yet'}
                    </span>
                    {t.cachedStats?.newCount != null ? (
                      <span className="badge badge-warning badge-sm">
                        {t.cachedStats.newCount} new
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <button className="btn btn-xs" onClick={() => onOpen(t.id)}>
                  Open
                </button>
                <button className="btn btn-xs btn-primary" onClick={() => onContinue(t.id)}>
                  Continue
                </button>
                <button className="btn btn-xs btn-outline" onClick={() => onJumpToNew(t.id)}>
                  Jump to new
                </button>
                <button className="btn btn-xs btn-ghost" onClick={() => onReset(t.id)}>
                  Reset
                </button>
                <button className="btn btn-xs btn-ghost" onClick={() => onRemove(t.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {status ? (
        <div className="mt-3 rounded-lg bg-error/10 p-2 text-xs text-error">
          {status}
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


