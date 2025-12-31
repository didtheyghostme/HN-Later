import { defineExtensionMessaging } from "@webext-core/messaging";

export type HnLaterContentProtocolMap = {
  /**
   * Tell the content script on an HN item page to scroll/highlight the user's last-read marker.
   */
  "hnLater/content/continue": (data: { storyId: string }) => { ok: true };
  /**
   * Tell the content script on an HN item page to mark the current thread as finished.
   */
  "hnLater/content/finish": (data: { storyId: string }) => { ok: true };
};

export const hnLaterMessenger = defineExtensionMessaging<HnLaterContentProtocolMap>();


