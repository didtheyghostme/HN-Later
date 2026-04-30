/**
 * HN Read Later - Content Script
 * Injected into Hacker News pages to add save functionality and track reading progress
 */

(function() {
  'use strict';

  // Check if we're on an item page (discussion thread)
  const urlParams = new URLSearchParams(window.location.search);
  const itemId = urlParams.get('id');
  
  if (!itemId) {
    // Not on an item page, nothing to do
    return;
  }

  // Configuration
  const READ_THRESHOLD_MS = 1000; // Time a comment must be visible to count as "read"
  const SCROLL_DEBOUNCE_MS = 100;
  
  // State
  let savedItem = null;
  let isItemSaved = false;
  let commentElements = [];
  let readCommentIds = new Set();
  let pendingReadComments = new Set();
  let saveDebounceTimer = null;

  /**
   * Parse the page to extract story info
   */
  function getStoryInfo() {
    const titleElement = document.querySelector('.titleline > a');
    const title = titleElement ? titleElement.textContent : document.title;
    const url = titleElement ? titleElement.href : null;
    
    // Get comment count
    const comments = document.querySelectorAll('tr.athing.comtr');
    const totalComments = comments.length;
    
    return {
      itemId,
      title,
      url: url && !url.includes('news.ycombinator.com') ? url : null,
      hnUrl: window.location.href.split('?')[0] + '?id=' + itemId,
      totalComments
    };
  }

  /**
   * Get all comment elements with their IDs
   */
  function getCommentElements() {
    const comments = document.querySelectorAll('tr.athing.comtr');
    return Array.from(comments).map(comment => ({
      element: comment,
      id: comment.id
    }));
  }

  /**
   * Create and inject the save button
   */
  function createSaveButton() {
    const subtext = document.querySelector('.subtext');
    if (!subtext) return null;

    const separator = document.createTextNode(' | ');
    const button = document.createElement('a');
    button.href = '#';
    button.id = 'hn-save-button';
    button.className = 'hn-read-later-btn';
    button.textContent = 'save for later';
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      await toggleSaveItem();
    });

    subtext.appendChild(separator);
    subtext.appendChild(button);
    
    return button;
  }

  /**
   * Update save button state
   */
  function updateSaveButton() {
    const button = document.getElementById('hn-save-button');
    if (!button) return;
    
    if (isItemSaved) {
      button.textContent = '✓ saved';
      button.classList.add('saved');
    } else {
      button.textContent = 'save for later';
      button.classList.remove('saved');
    }
  }

  /**
   * Toggle save state
   */
  async function toggleSaveItem() {
    if (isItemSaved) {
      await Storage.deleteItem(itemId);
      isItemSaved = false;
      savedItem = null;
      readCommentIds.clear();
      hideProgressIndicator();
      clearReadMarkers();
    } else {
      const storyInfo = getStoryInfo();
      const newItem = {
        ...storyInfo,
        savedAt: Date.now(),
        readCommentIds: [],
        lastVisitedAt: Date.now()
      };
      await Storage.saveItem(newItem);
      isItemSaved = true;
      savedItem = newItem;
      showProgressIndicator();
      startReadingTracker();
    }
    updateSaveButton();
  }

  /**
   * Create the floating progress indicator
   */
  function createProgressIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'hn-progress-indicator';
    indicator.className = 'hn-progress-indicator';
    indicator.innerHTML = `
      <div class="hn-progress-content">
        <div class="hn-progress-label">Reading Progress</div>
        <div class="hn-progress-bar-container">
          <div class="hn-progress-bar" style="width: 0%"></div>
        </div>
        <div class="hn-progress-text">0%</div>
      </div>
      <button class="hn-progress-resume" title="Jump to first unread">▼</button>
    `;
    
    indicator.querySelector('.hn-progress-resume').addEventListener('click', scrollToFirstUnread);
    
    document.body.appendChild(indicator);
    return indicator;
  }

  /**
   * Show the progress indicator
   */
  function showProgressIndicator() {
    let indicator = document.getElementById('hn-progress-indicator');
    if (!indicator) {
      indicator = createProgressIndicator();
    }
    indicator.style.display = 'flex';
    updateProgressIndicator();
  }

  /**
   * Hide the progress indicator
   */
  function hideProgressIndicator() {
    const indicator = document.getElementById('hn-progress-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  /**
   * Update the progress display
   */
  function updateProgressIndicator() {
    const indicator = document.getElementById('hn-progress-indicator');
    if (!indicator) return;
    
    const totalComments = commentElements.length;
    if (totalComments === 0) {
      indicator.querySelector('.hn-progress-text').textContent = 'No comments';
      return;
    }
    
    const readCount = readCommentIds.size;
    const percentage = Math.round((readCount / totalComments) * 100);
    
    indicator.querySelector('.hn-progress-bar').style.width = percentage + '%';
    indicator.querySelector('.hn-progress-text').textContent = 
      `${percentage}% (${readCount}/${totalComments})`;
  }

  /**
   * Mark a comment element as read visually
   */
  function markCommentAsRead(commentEl) {
    commentEl.element.classList.add('hn-comment-read');
    commentEl.element.classList.remove('hn-comment-unread');
  }

  /**
   * Mark a comment element as unread visually
   */
  function markCommentAsUnread(commentEl) {
    commentEl.element.classList.add('hn-comment-unread');
    commentEl.element.classList.remove('hn-comment-read');
  }

  /**
   * Clear all read markers
   */
  function clearReadMarkers() {
    commentElements.forEach(comment => {
      comment.element.classList.remove('hn-comment-read', 'hn-comment-unread');
    });
  }

  /**
   * Apply saved read state to comments
   */
  function applySavedReadState() {
    if (!savedItem || !savedItem.readCommentIds) return;
    
    const savedReadIds = new Set(savedItem.readCommentIds);
    
    commentElements.forEach(comment => {
      if (savedReadIds.has(comment.id)) {
        readCommentIds.add(comment.id);
        markCommentAsRead(comment);
      } else {
        markCommentAsUnread(comment);
      }
    });
    
    updateProgressIndicator();
  }

  /**
   * Scroll to the first unread comment
   */
  function scrollToFirstUnread() {
    const firstUnread = commentElements.find(comment => !readCommentIds.has(comment.id));
    if (firstUnread) {
      firstUnread.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstUnread.element.classList.add('hn-comment-highlight');
      setTimeout(() => {
        firstUnread.element.classList.remove('hn-comment-highlight');
      }, 2000);
    }
  }

  /**
   * Scroll to the last read comment
   */
  function scrollToLastRead() {
    if (!savedItem || !savedItem.lastReadCommentId) return;
    
    const lastRead = commentElements.find(comment => comment.id === savedItem.lastReadCommentId);
    if (lastRead) {
      lastRead.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Save pending read comments to storage (debounced)
   */
  function savePendingReads() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
    }
    
    saveDebounceTimer = setTimeout(async () => {
      if (pendingReadComments.size > 0 && isItemSaved) {
        const commentIds = Array.from(pendingReadComments);
        pendingReadComments.clear();
        
        await Storage.markCommentsRead(itemId, commentIds);
        
        // Update total comments count if changed
        const currentTotal = commentElements.length;
        if (savedItem && savedItem.totalComments !== currentTotal) {
          await Storage.updateItem(itemId, { totalComments: currentTotal });
        }
      }
    }, 500);
  }

  /**
   * Set up Intersection Observer for reading detection
   */
  function startReadingTracker() {
    const visibleTimers = new Map();
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const commentId = entry.target.id;
        
        if (entry.isIntersecting) {
          // Comment is visible, start timer
          if (!visibleTimers.has(commentId) && !readCommentIds.has(commentId)) {
            visibleTimers.set(commentId, setTimeout(() => {
              // Mark as read after threshold
              readCommentIds.add(commentId);
              pendingReadComments.add(commentId);
              
              const commentEl = commentElements.find(c => c.id === commentId);
              if (commentEl) {
                markCommentAsRead(commentEl);
              }
              
              updateProgressIndicator();
              savePendingReads();
              visibleTimers.delete(commentId);
            }, READ_THRESHOLD_MS));
          }
        } else {
          // Comment left viewport, cancel timer
          if (visibleTimers.has(commentId)) {
            clearTimeout(visibleTimers.get(commentId));
            visibleTimers.delete(commentId);
          }
        }
      });
    }, {
      threshold: 0.5, // At least 50% visible
      rootMargin: '0px'
    });
    
    // Observe all comments
    commentElements.forEach(comment => {
      observer.observe(comment.element);
    });
    
    return observer;
  }

  /**
   * Show resume banner for returning visitors
   */
  function showResumeBanner() {
    if (!savedItem) return;
    
    const readCount = (savedItem.readCommentIds || []).length;
    const totalComments = commentElements.length;
    const percentage = Math.round((readCount / totalComments) * 100);
    
    if (percentage >= 100) return; // Already complete
    
    const newComments = totalComments - savedItem.totalComments;
    
    const banner = document.createElement('div');
    banner.id = 'hn-resume-banner';
    banner.className = 'hn-resume-banner';
    
    let message = `Continue reading (${percentage}% complete)`;
    if (newComments > 0) {
      message += ` • ${newComments} new comment${newComments > 1 ? 's' : ''}`;
    }
    
    banner.innerHTML = `
      <span class="hn-resume-message">${message}</span>
      <button class="hn-resume-button">Jump to unread ▼</button>
      <button class="hn-resume-close">✕</button>
    `;
    
    banner.querySelector('.hn-resume-button').addEventListener('click', () => {
      scrollToFirstUnread();
      banner.remove();
    });
    
    banner.querySelector('.hn-resume-close').addEventListener('click', () => {
      banner.remove();
    });
    
    // Insert at top of content
    const mainTable = document.querySelector('#hnmain');
    if (mainTable) {
      mainTable.insertBefore(banner, mainTable.firstChild);
    }
  }

  /**
   * Initialize the extension on this page
   */
  async function init() {
    // Get all comments
    commentElements = getCommentElements();
    
    // Create save button
    createSaveButton();
    
    // Check if item is already saved
    savedItem = await Storage.getItem(itemId);
    isItemSaved = savedItem !== null;
    
    // Update UI
    updateSaveButton();
    
    if (isItemSaved) {
      // Update visit timestamp
      await Storage.updateLastVisited(itemId);
      
      // Update total comments if changed
      if (savedItem.totalComments !== commentElements.length) {
        await Storage.updateItem(itemId, { totalComments: commentElements.length });
      }
      
      // Show progress and apply saved state
      showProgressIndicator();
      applySavedReadState();
      
      // Start tracking
      startReadingTracker();
      
      // Show resume banner if returning
      if (savedItem.lastVisitedAt && readCommentIds.size > 0 && readCommentIds.size < commentElements.length) {
        showResumeBanner();
      }
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
