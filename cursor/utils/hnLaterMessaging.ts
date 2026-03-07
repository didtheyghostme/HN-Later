import { defineExtensionMessaging } from "@webext-core/messaging";

export type HnLaterContentProtocolMap = {
  /**
   * Tell the content script on a canonical HN item page to bootstrap or refresh the story summary.
   */
  "hnLater/content/bootstrapSummary": (data: { storyId: string }) => { ok: true };
  /**
   * Tell the content script on an HN item page to scroll/highlight the user's last-read marker.
   */
  "hnLater/content/continue": (data: { storyId: string }) => { ok: true };
  /**
   * Tell the content script on an HN item page to mark the current thread as finished.
   */
  "hnLater/content/finish": (data: { storyId: string }) => { ok: true };
  /**
   * Tell the content script on an HN item page to archive the current thread.
   */
  "hnLater/content/archive": (data: { storyId: string }) => { ok: true };
  /**
   * Tell the content script on an HN item page to scroll/highlight a specific comment.
   */
  "hnLater/content/jumpToComment": (data: { storyId: string; commentId: number }) => { ok: true };
};

export const hnLaterMessenger = defineExtensionMessaging<HnLaterContentProtocolMap>();
