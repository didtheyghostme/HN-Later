import { 
  saveItem, 
  removeItem, 
  getItems, 
  getItem, 
  isItemSaved, 
  updateCheckpoint, 
  getProgress,
  exportData,
  importData,
  type SavedStory 
} from '@/lib/storage';

export default defineBackground(() => {
  // Update badge with saved items count
  async function updateBadge() {
    try {
      const items = await getItems();
      const count = items.length;
      await browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      await browser.action.setBadgeBackgroundColor({ color: '#ff6600' });
    } catch (e) {
      console.error('Failed to update badge:', e);
    }
  }

  // Initial badge update
  updateBadge();

  // Handle messages from content script and popup
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handleAsync = async () => {
      try {
        switch (message.type) {
          case 'SAVE_ITEM': {
            await saveItem(message.item);
            await updateBadge();
            return { success: true };
          }
          case 'REMOVE_ITEM': {
            await removeItem(message.storyId);
            await updateBadge();
            return { success: true };
          }
          case 'GET_ITEMS': {
            const items = await getItems();
            return { success: true, items };
          }
          case 'GET_ITEM': {
            const item = await getItem(message.storyId);
            return { success: true, item };
          }
          case 'IS_SAVED': {
            const saved = await isItemSaved(message.storyId);
            return { success: true, saved };
          }
          case 'UPDATE_CHECKPOINT': {
            await updateCheckpoint(
              message.storyId,
              message.checkpointCommentId,
              message.totalComments
            );
            return { success: true };
          }
          case 'GET_PROGRESS': {
            const progress = await getProgress(message.storyId);
            return { success: true, progress };
          }
          case 'EXPORT_DATA': {
            const data = await exportData();
            return { success: true, data };
          }
          case 'IMPORT_DATA': {
            const count = await importData(message.json);
            await updateBadge();
            return { success: true, count };
          }
          case 'OPEN_THREAD': {
            await browser.tabs.create({
              url: `${message.url}#hn-later-continue`,
            });
            return { success: true };
          }
          default:
            return { success: false, error: 'Unknown message type' };
        }
      } catch (e) {
        console.error('Message handler error:', e);
        return { success: false, error: String(e) };
      }
    };

    handleAsync().then(sendResponse);
    return true; // Keep message channel open for async response
  });
});
