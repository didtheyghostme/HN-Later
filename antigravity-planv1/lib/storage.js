/**
 * HN Read Later - Storage Utilities
 * Shared storage functions for managing saved items and reading progress
 */

const StorageKeys = {
  SAVED_ITEMS: 'hn_saved_items'
};

/**
 * @typedef {Object} SavedItem
 * @property {string} itemId - HN item ID
 * @property {string} title - Story title
 * @property {string} [url] - Original story URL (if external)
 * @property {string} hnUrl - HN discussion URL
 * @property {number} savedAt - Timestamp when saved
 * @property {number} totalComments - Total comment count when saved
 * @property {string[]} readCommentIds - IDs of read comments
 * @property {string} [lastReadCommentId] - Last comment scrolled to
 * @property {number} [lastVisitedAt] - Last visit timestamp
 */

const Storage = {
  /**
   * Get all saved items
   * @returns {Promise<SavedItem[]>}
   */
  async getItems() {
    const result = await chrome.storage.local.get(StorageKeys.SAVED_ITEMS);
    return result[StorageKeys.SAVED_ITEMS] || [];
  },

  /**
   * Get a specific saved item by ID
   * @param {string} itemId
   * @returns {Promise<SavedItem|null>}
   */
  async getItem(itemId) {
    const items = await this.getItems();
    return items.find(item => item.itemId === itemId) || null;
  },

  /**
   * Check if an item is saved
   * @param {string} itemId
   * @returns {Promise<boolean>}
   */
  async isItemSaved(itemId) {
    const item = await this.getItem(itemId);
    return item !== null;
  },

  /**
   * Save a new item to read later
   * @param {SavedItem} item
   * @returns {Promise<void>}
   */
  async saveItem(item) {
    const items = await this.getItems();
    const existingIndex = items.findIndex(i => i.itemId === item.itemId);
    
    if (existingIndex >= 0) {
      // Update existing item
      items[existingIndex] = { ...items[existingIndex], ...item };
    } else {
      // Add new item
      items.unshift(item);
    }
    
    await chrome.storage.local.set({ [StorageKeys.SAVED_ITEMS]: items });
  },

  /**
   * Update an existing item
   * @param {string} itemId
   * @param {Partial<SavedItem>} updates
   * @returns {Promise<void>}
   */
  async updateItem(itemId, updates) {
    const items = await this.getItems();
    const index = items.findIndex(item => item.itemId === itemId);
    
    if (index >= 0) {
      items[index] = { ...items[index], ...updates };
      await chrome.storage.local.set({ [StorageKeys.SAVED_ITEMS]: items });
    }
  },

  /**
   * Delete a saved item
   * @param {string} itemId
   * @returns {Promise<void>}
   */
  async deleteItem(itemId) {
    const items = await this.getItems();
    const filtered = items.filter(item => item.itemId !== itemId);
    await chrome.storage.local.set({ [StorageKeys.SAVED_ITEMS]: filtered });
  },

  /**
   * Mark a comment as read
   * @param {string} itemId
   * @param {string} commentId
   * @returns {Promise<void>}
   */
  async markCommentRead(itemId, commentId) {
    const items = await this.getItems();
    const index = items.findIndex(item => item.itemId === itemId);
    
    if (index >= 0) {
      const readCommentIds = items[index].readCommentIds || [];
      if (!readCommentIds.includes(commentId)) {
        readCommentIds.push(commentId);
        items[index].readCommentIds = readCommentIds;
        items[index].lastReadCommentId = commentId;
        await chrome.storage.local.set({ [StorageKeys.SAVED_ITEMS]: items });
      }
    }
  },

  /**
   * Mark multiple comments as read
   * @param {string} itemId
   * @param {string[]} commentIds
   * @returns {Promise<void>}
   */
  async markCommentsRead(itemId, commentIds) {
    const items = await this.getItems();
    const index = items.findIndex(item => item.itemId === itemId);
    
    if (index >= 0) {
      const readCommentIds = new Set(items[index].readCommentIds || []);
      commentIds.forEach(id => readCommentIds.add(id));
      items[index].readCommentIds = Array.from(readCommentIds);
      if (commentIds.length > 0) {
        items[index].lastReadCommentId = commentIds[commentIds.length - 1];
      }
      await chrome.storage.local.set({ [StorageKeys.SAVED_ITEMS]: items });
    }
  },

  /**
   * Calculate reading progress percentage
   * @param {SavedItem} item
   * @returns {number} Progress 0-100
   */
  getProgress(item) {
    if (!item || item.totalComments === 0) return 0;
    const readCount = (item.readCommentIds || []).length;
    return Math.round((readCount / item.totalComments) * 100);
  },

  /**
   * Update last visited timestamp
   * @param {string} itemId
   * @returns {Promise<void>}
   */
  async updateLastVisited(itemId) {
    await this.updateItem(itemId, { lastVisitedAt: Date.now() });
  }
};

// Export for use in other scripts (works in both content scripts and service workers)
if (typeof window !== 'undefined') {
  window.Storage = Storage;
}
