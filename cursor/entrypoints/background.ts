import { type GetDataType } from "@webext-core/messaging";
import { defineBackground } from "wxt/utils/define-background";
import { browser, type Browser } from "wxt/browser";

import {
  registerHnLaterService,
  type HnLaterService,
  type HnLaterServiceResult,
  type HnLaterServiceOpenOptions,
} from "../utils/hnLaterService";
import { hnLaterMessenger, type HnLaterContentProtocolMap } from "../utils/hnLaterMessaging";

export default defineBackground(() => {
  const BOOTSTRAP_SUMMARY_HASH = "#hn-later-bootstrap-summary";

  async function findExistingItemTab(storyId: string): Promise<Browser.tabs.Tab | undefined> {
    const tabs = await browser.tabs.query({
      url: [`*://news.ycombinator.com/item?id=${storyId}*`],
    });

    return tabs.find((tab) => tab.id != null);
  }

  async function openOrFocusItemTab(
    storyId: string,
    { activate = true }: HnLaterServiceOpenOptions = {},
  ): Promise<Browser.tabs.Tab> {
    const targetUrl = `https://news.ycombinator.com/item?id=${encodeURIComponent(storyId)}`;
    const existing = await findExistingItemTab(storyId);
    if (existing?.id != null) {
      if (activate) {
        if (existing.windowId != null) {
          await browser.windows.update(existing.windowId, { focused: true });
        }
        await browser.tabs.update(existing.id, { active: true });
      }
      // Ensure we’re on the canonical URL (in case hash differs).
      if (existing.url !== targetUrl) {
        await browser.tabs.update(existing.id, { url: targetUrl });
      }
      return await browser.tabs.get(existing.id);
    }

    const created = await browser.tabs.create({ url: targetUrl, active: activate });
    return created;
  }

  async function waitForTabComplete(tabId: number): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === "complete") return;

    await new Promise<void>((resolve) => {
      const listener = (
        updatedTabId: number,
        info: Browser.tabs.OnUpdatedInfo,
        _tab: Browser.tabs.Tab,
      ) => {
        if (updatedTabId !== tabId) return;
        if (info.status !== "complete") return;
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      browser.tabs.onUpdated.addListener(listener);
    });
  }

  type ContentMessageType = keyof HnLaterContentProtocolMap;
  type ContentMessageData<K extends ContentMessageType> = GetDataType<HnLaterContentProtocolMap[K]>;

  async function sendToTab<K extends ContentMessageType>(
    tabId: number,
    messageType: K,
    data: ContentMessageData<K>,
  ): Promise<void> {
    // Retry a few times in case the content script isn’t ready yet.
    for (let i = 0; i < 15; i += 1) {
      try {
        await hnLaterMessenger.sendMessage(messageType, data, tabId);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    // Last attempt (surface error)
    await hnLaterMessenger.sendMessage(messageType, data, tabId);
  }

  async function bootstrapSummaryInTab(tabId: number, storyId: string): Promise<void> {
    await waitForTabComplete(tabId);
    await sendToTab(tabId, "hnLater/content/bootstrapSummary", { storyId });
  }

  const serviceImpl: HnLaterService = {
    async open(storyId: string, opts?: HnLaterServiceOpenOptions): Promise<HnLaterServiceResult> {
      try {
        const tab = await openOrFocusItemTab(storyId, opts);
        return { ok: true, tabId: tab.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async bootstrapSummary(
      storyId: string,
      _opts?: HnLaterServiceOpenOptions,
    ): Promise<HnLaterServiceResult> {
      let createdTabId: number | undefined;
      try {
        const existing = await findExistingItemTab(storyId);
        if (existing?.id != null) {
          await bootstrapSummaryInTab(existing.id, storyId);
          return { ok: true, tabId: existing.id };
        }

        const targetUrl = `https://news.ycombinator.com/item?id=${encodeURIComponent(storyId)}${BOOTSTRAP_SUMMARY_HASH}`;
        const created = await browser.tabs.create({ url: targetUrl, active: false });
        if (created.id == null) throw new Error("Failed to open tab");

        createdTabId = created.id;
        await bootstrapSummaryInTab(created.id, storyId);
        return { ok: true, tabId: created.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        if (createdTabId != null) {
          try {
            await browser.tabs.remove(createdTabId);
          } catch {
            // Ignore failures when the temporary tab is already gone.
          }
        }
      }
    },
    async continue(
      storyId: string,
      opts?: HnLaterServiceOpenOptions,
    ): Promise<HnLaterServiceResult> {
      try {
        const tab = await openOrFocusItemTab(storyId, opts);
        if (tab.id == null) throw new Error("Failed to open tab");
        await waitForTabComplete(tab.id);
        await sendToTab(tab.id, "hnLater/content/continue", { storyId });
        return { ok: true, tabId: tab.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async finish(storyId: string, opts?: HnLaterServiceOpenOptions): Promise<HnLaterServiceResult> {
      try {
        const tab = await openOrFocusItemTab(storyId, opts);
        if (tab.id == null) throw new Error("Failed to open tab");
        await waitForTabComplete(tab.id);
        await sendToTab(tab.id, "hnLater/content/finish", { storyId });
        return { ok: true, tabId: tab.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async archive(
      storyId: string,
      opts?: HnLaterServiceOpenOptions,
    ): Promise<HnLaterServiceResult> {
      try {
        const tab = await openOrFocusItemTab(storyId, opts);
        if (tab.id == null) throw new Error("Failed to open tab");
        await waitForTabComplete(tab.id);
        await sendToTab(tab.id, "hnLater/content/archive", { storyId });
        return { ok: true, tabId: tab.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async openComment(
      storyId: string,
      commentId: number,
      opts?: HnLaterServiceOpenOptions,
    ): Promise<HnLaterServiceResult> {
      try {
        const tab = await openOrFocusItemTab(storyId, opts);
        if (tab.id == null) throw new Error("Failed to open tab");
        await waitForTabComplete(tab.id);
        await sendToTab(tab.id, "hnLater/content/jumpToComment", { storyId, commentId });
        return { ok: true, tabId: tab.id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  registerHnLaterService(serviceImpl);
});
