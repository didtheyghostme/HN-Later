export default defineBackground(() => {
  // Update badge with saved items count
  async function updateBadge() {
    try {
      const result = await browser.storage.local.get('itemCount');
      const count = result.itemCount || 0;
      await browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      await browser.action.setBadgeBackgroundColor({ color: '#ff6600' });
    } catch (e) {
      console.error('Failed to update badge:', e);
    }
  }

  // Listen for storage changes
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes.itemCount) {
      updateBadge();
    }
  });

  // Initial badge update
  updateBadge();

  // Handle messages from content script and popup
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'OPEN_THREAD') {
      // Open thread and scroll to unread
      browser.tabs.create({
        url: `${message.url}#hn-later-unread`,
      });
      sendResponse({ success: true });
    }
    return true;
  });
});
