/**
 * HN Read Later - Background Service Worker
 * Handles extension events and badge updates
 */

// Update badge with count of saved items
async function updateBadge() {
  try {
    const result = await chrome.storage.local.get('hn_saved_items');
    const items = result.hn_saved_items || [];
    const count = items.length;
    
    // Show count if there are items, empty otherwise
    await chrome.action.setBadgeText({ 
      text: count > 0 ? String(count) : '' 
    });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff6600' });
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

// Listen for storage changes to update badge
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.hn_saved_items) {
    updateBadge();
  }
});

// Update badge on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Update badge on service worker startup
updateBadge();

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_BADGE_COUNT') {
    chrome.storage.local.get('hn_saved_items').then(result => {
      const items = result.hn_saved_items || [];
      sendResponse({ count: items.length });
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'OPEN_ITEM') {
    chrome.tabs.create({ url: message.url });
    return false;
  }
});
