// HN Later - Background Service Worker
// Handles storage operations and messaging between popup and content scripts

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['hnLaterItems'], (result) => {
    if (!result.hnLaterItems) {
      chrome.storage.local.set({ hnLaterItems: {} });
    }
  });
});

// Message handler for communication between popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'saveItem':
      saveItem(request.data).then(sendResponse);
      return true;

    case 'removeItem':
      removeItem(request.itemId).then(sendResponse);
      return true;

    case 'getItem':
      getItem(request.itemId).then(sendResponse);
      return true;

    case 'getAllItems':
      getAllItems().then(sendResponse);
      return true;

    case 'updateProgress':
      updateProgress(request.itemId, request.progress).then(sendResponse);
      return true;

    case 'getProgress':
      getProgress(request.itemId).then(sendResponse);
      return true;
    
    case 'archiveItem':
      archiveItem(request.itemId, request.archived).then(sendResponse);
      return true;
  }
});

// Save a new item to read later
async function saveItem(data) {
  try {
    const result = await chrome.storage.local.get(['hnLaterItems']);
    const items = result.hnLaterItems || {};
    
    items[data.id] = {
      id: data.id,
      title: data.title,
      url: data.url,
      commentCount: data.commentCount,
      author: data.author,
      points: data.points,
      savedAt: Date.now(),
      progress: {
        readComments: [],
        totalComments: data.commentCount || 0,
        percentage: 0,
        lastReadCommentId: null,
        lastVisited: null
      }
    };

    await chrome.storage.local.set({ hnLaterItems: items });
    return { success: true, item: items[data.id] };
  } catch (error) {
    console.error('Error saving item:', error);
    return { success: false, error: error.message };
  }
}

// Remove an item from read later list
async function removeItem(itemId) {
  try {
    const result = await chrome.storage.local.get(['hnLaterItems']);
    const items = result.hnLaterItems || {};
    
    if (items[itemId]) {
      delete items[itemId];
      await chrome.storage.local.set({ hnLaterItems: items });
      return { success: true };
    }
    
    return { success: false, error: 'Item not found' };
  } catch (error) {
    console.error('Error removing item:', error);
    return { success: false, error: error.message };
  }
}

// Get a specific item
async function getItem(itemId) {
  try {
    const result = await chrome.storage.local.get(['hnLaterItems']);
    const items = result.hnLaterItems || {};
    return { success: true, item: items[itemId] || null };
  } catch (error) {
    console.error('Error getting item:', error);
    return { success: false, error: error.message };
  }
}

// Get all saved items
async function getAllItems() {
  try {
    const result = await chrome.storage.local.get(['hnLaterItems']);
    const items = result.hnLaterItems || {};
    // Convert to array and sort by saved date (newest first)
    const itemsArray = Object.values(items).sort((a, b) => b.savedAt - a.savedAt);
    return { success: true, items: itemsArray };
  } catch (error) {
    console.error('Error getting all items:', error);
    return { success: false, error: error.message };
  }
}

// Update reading progress for an item
async function updateProgress(itemId, progressData) {
  try {
    const result = await chrome.storage.local.get(['hnLaterItems']);
    const items = result.hnLaterItems || {};
    
    if (items[itemId]) {
      // Merge new read comments with existing ones
      const existingReadComments = items[itemId].progress.readComments || [];
      const newReadComments = progressData.readComments || [];
      const allReadComments = [...new Set([...existingReadComments, ...newReadComments])];
      
      items[itemId].progress = {
        ...items[itemId].progress,
        readComments: allReadComments,
        totalComments: progressData.totalComments || items[itemId].progress.totalComments,
        percentage: progressData.totalComments > 0 
          ? Math.round((allReadComments.length / progressData.totalComments) * 100)
          : 0,
        lastReadCommentId: progressData.lastReadCommentId || items[itemId].progress.lastReadCommentId,
        lastVisited: Date.now()
      };

      // Auto-snapshot when 100% is reached for the first time
      if (items[itemId].progress.percentage === 100 && !items[itemId].snapshot) {
        items[itemId].snapshot = {
          percentage: 100,
          totalComments: items[itemId].progress.totalComments
        };
      }

      await chrome.storage.local.set({ hnLaterItems: items });
      return { success: true, progress: items[itemId].progress };
    }
    
    return { success: false, error: 'Item not found' };
  } catch (error) {
    console.error('Error updating progress:', error);
    return { success: false, error: error.message };
  }
}

// Get progress for an item
async function getProgress(itemId) {
  try {
    const result = await chrome.storage.local.get(['hnLaterItems']);
    const items = result.hnLaterItems || {};
    
    if (items[itemId]) {
      return { success: true, progress: items[itemId].progress };
    }
    
    return { success: false, error: 'Item not found' };
  } catch (error) {
    console.error('Error getting progress:', error);
    return { success: false, error: error.message };
  }
}

// Archive/Unarchive an item
async function archiveItem(itemId, archived) {
  try {
    const result = await chrome.storage.local.get(['hnLaterItems']);
    const items = result.hnLaterItems || {};
    
    if (items[itemId]) {
      items[itemId].archived = archived;
      
      if (archived) {
        // Create snapshot when archiving
        items[itemId].snapshot = {
          percentage: items[itemId].progress.percentage,
          totalComments: items[itemId].progress.totalComments
        };
      } else {
        // Clear snapshot when unarchiving if not 100%
        if (items[itemId].progress.percentage < 100) {
          delete items[itemId].snapshot;
        }
      }
      
      await chrome.storage.local.set({ hnLaterItems: items });
      return { success: true, archived: items[itemId].archived };
    }
    
    return { success: false, error: 'Item not found' };
  } catch (error) {
    console.error('Error archiving item:', error);
    return { success: false, error: error.message };
  }
}
