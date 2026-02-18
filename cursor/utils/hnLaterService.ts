import { defineProxyService } from "@webext-core/proxy-service";

export type HnLaterServiceResult = { ok: true; tabId?: number } | { ok: false; error: string };

export type HnLaterServiceOpenOptions = {
  /**
   * Whether to focus the window and activate the tab.
   * Defaults to true.
   */
  activate?: boolean;
};

export type HnLaterService = {
  open: (storyId: string, opts?: HnLaterServiceOpenOptions) => Promise<HnLaterServiceResult>;
  continue: (storyId: string, opts?: HnLaterServiceOpenOptions) => Promise<HnLaterServiceResult>;
  finish: (storyId: string, opts?: HnLaterServiceOpenOptions) => Promise<HnLaterServiceResult>;
  openComment: (
    storyId: string,
    commentId: number,
    opts?: HnLaterServiceOpenOptions,
  ) => Promise<HnLaterServiceResult>;
};

export const [registerHnLaterService, getHnLaterService] = defineProxyService(
  "hnLater",
  (impl: HnLaterService) => impl,
);


