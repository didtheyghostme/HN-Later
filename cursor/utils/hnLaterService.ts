import { defineProxyService } from "@webext-core/proxy-service";

export type HnLaterServiceResult = { ok: true; tabId?: number } | { ok: false; error: string };

export type HnLaterService = {
  open: (storyId: string) => Promise<HnLaterServiceResult>;
  continue: (storyId: string) => Promise<HnLaterServiceResult>;
  finish: (storyId: string) => Promise<HnLaterServiceResult>;
};

export const [registerHnLaterService, getHnLaterService] = defineProxyService(
  "hnLater",
  (impl: HnLaterService) => impl,
);


