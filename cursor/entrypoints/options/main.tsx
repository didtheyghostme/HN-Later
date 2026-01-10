import React from "react";
import { createRoot } from "react-dom/client";
import { browser, type Browser } from "wxt/browser";

import "../../assets/tailwind.css";

import { getThreadsById } from "../../utils/hnLaterStorage";
import {
  exportHnLaterData,
  importHnLaterData,
  parseHnLaterBackupText,
  type HnLaterImportMode,
} from "../../utils/hnImportExport";

function formatDateTime(ms: number) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatDateForFilename(ms: number) {
  const d = new Date(ms);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

function downloadTextFile(filename: string, text: string, mimeType = "application/json") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on next tick to avoid breaking the download on slower machines.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function App() {
  const [currentCount, setCurrentCount] = React.useState<number | null>(null);

  const [exportBusy, setExportBusy] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);

  const [mode, setMode] = React.useState<HnLaterImportMode>("merge");
  const [confirmReplace, setConfirmReplace] = React.useState(false);

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [fileText, setFileText] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{ exportedAt: number; threadCount: number } | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const [importBusy, setImportBusy] = React.useState(false);
  const [importStatus, setImportStatus] = React.useState<string | null>(null);

  const refreshCount = React.useCallback(async () => {
    const threadsById = await getThreadsById();
    setCurrentCount(Object.keys(threadsById).length);
  }, []);

  React.useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  React.useEffect(() => {
    const listener = (changes: Record<string, Browser.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (!changes["hnLater:threadsById"]) return;
      refreshCount();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, [refreshCount]);

  async function onExport() {
    setExportStatus(null);
    setExportBusy(true);
    try {
      const data = await exportHnLaterData();
      const json = JSON.stringify(data, null, 2);
      const count = Object.keys(data.threadsById).length;
      const filename = `hn-later-backup-${formatDateForFilename(data.exportedAt)}.json`;
      downloadTextFile(filename, json);
      setExportStatus(`Downloaded backup (${count} ${count === 1 ? "thread" : "threads"}).`);
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setExportBusy(false);
    }
  }

  async function onSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImportStatus(null);
    setConfirmReplace(false);

    if (!file) {
      setFileName(null);
      setFileText(null);
      setPreview(null);
      setParseError(null);
      return;
    }

    setFileName(file.name);
    const text = await file.text();
    setFileText(text);

    try {
      const backup = parseHnLaterBackupText(text);
      const threadCount = Object.keys(backup.threadsById).length;
      setPreview({ exportedAt: backup.exportedAt, threadCount });
      setParseError(null);
    } catch (err) {
      setPreview(null);
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onImport() {
    if (!fileText) return;
    if (parseError) return;
    if (mode === "replace" && !confirmReplace) return;

    setImportBusy(true);
    setImportStatus(null);
    try {
      const { importedCount } = await importHnLaterData(fileText, mode);
      await refreshCount();
      setImportStatus(
        mode === "replace"
          ? `Restored ${importedCount} ${importedCount === 1 ? "thread" : "threads"} (replaced all existing data).`
          : `Imported ${importedCount} ${importedCount === 1 ? "thread" : "threads"} (merged into existing data).`,
      );
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">HN Later</div>
            <div className="mt-1 text-sm opacity-70">Backup and restore your saved threads and progress.</div>
          </div>
          <div className="text-right text-xs opacity-70">
            {currentCount == null ? "…" : `${currentCount} saved`}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="rounded-box bg-base-200 p-4">
            <div className="text-sm font-semibold">Export (Backup)</div>
            <div className="mt-1 text-sm opacity-70">
              Downloads a JSON file you can store or move to another device.
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn btn-primary btn-sm" onClick={onExport} disabled={exportBusy}>
                {exportBusy ? "Exporting…" : "Download backup"}
              </button>
              {exportStatus ? (
                <div className="text-sm opacity-80">{exportStatus}</div>
              ) : (
                <div className="text-sm opacity-60">Includes saved threads + progress state.</div>
              )}
            </div>
          </div>

          <div className="rounded-box bg-base-200 p-4">
            <div className="text-sm font-semibold">Import (Restore)</div>
            <div className="mt-1 text-sm opacity-70">
              Select a backup JSON file to merge into your current data or restore everything from the file.
            </div>

            <div className="mt-3">
              <input
                className="file-input file-input-bordered file-input-sm w-full"
                type="file"
                accept="application/json,.json"
                onChange={onSelectFile}
              />
              {fileName ? <div className="mt-1 text-xs opacity-70">Selected: {fileName}</div> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="radio radio-sm"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                <span>
                  <span className="font-medium">Merge</span>{" "}
                  <span className="opacity-70">(safe; keeps existing threads)</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="radio radio-sm"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                <span>
                  <span className="font-medium">Replace all</span>{" "}
                  <span className="opacity-70">(restore; overwrites everything)</span>
                </span>
              </label>
            </div>

            {preview ? (
              <div className="mt-3 rounded-lg bg-base-100 p-3 text-sm">
                <div className="font-medium">Backup preview</div>
                <div className="mt-1 opacity-80">{preview.threadCount} threads</div>
                <div className="mt-1 text-xs opacity-70">Exported: {formatDateTime(preview.exportedAt)}</div>
              </div>
            ) : null}

            {parseError ? (
              <div className="mt-3 rounded-lg bg-error/10 p-3 text-sm text-error">{parseError}</div>
            ) : null}

            {mode === "replace" ? (
              <div className="mt-3 rounded-lg bg-warning/10 p-3 text-sm">
                <div className="font-medium">Warning</div>
                <div className="mt-1 opacity-80">
                  Replace all will permanently overwrite your current extension data with the backup file.
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={confirmReplace}
                    onChange={(e) => setConfirmReplace(e.target.checked)}
                  />
                  <span className="text-sm">I understand and want to replace all data.</span>
                </label>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="btn btn-sm"
                onClick={onImport}
                disabled={!fileText || !!parseError || importBusy || (mode === "replace" && !confirmReplace)}
              >
                {importBusy ? "Importing…" : mode === "replace" ? "Restore from backup" : "Import backup"}
              </button>
              <div className="text-xs opacity-70">
                {mode === "merge"
                  ? "Merge: imported threads overwrite matching IDs, others are kept."
                  : "Replace: current data is wiped and replaced by the backup."}
              </div>
            </div>

            {importStatus ? (
              <div className="mt-3 rounded-lg bg-base-100 p-3 text-sm opacity-80">{importStatus}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 text-xs opacity-60">
          Tip: You can open this page via the extension’s context menu (right-click the icon → Options) or from
          the extension details page in <span className="font-mono">chrome://extensions</span>.
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

