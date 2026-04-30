// HN Later - Content Script
// Tracks comment reading progress and adds UI elements to HN pages

(function() {
  'use strict';

  let currentItemId = null;
  let isItemPage = false;
  let allComments = [];
  let readComments = new Set();
  let observer = null;
  let isSavedItem = false;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Check if we're on an item page (has ?id= in URL)
    const urlParams = new URLSearchParams(window.location.search);
    currentItemId = urlParams.get('id');
    isItemPage = window.location.pathname === '/item' && currentItemId;

    if (isItemPage) {
      initItemPage();
    }

    // Add save buttons to story rows on list pages
    addSaveButtonsToList();
  }

  // Initialize item/comments page
  async function initItemPage() {
    // Get all comments
    allComments = document.querySelectorAll('.comtr');
    
    if (allComments.length === 0) return;

    // Check if this item is saved
    const response = await sendMessage({ action: 'getItem', itemId: currentItemId });
    isSavedItem = response.success && response.item;

    if (isSavedItem) {
      // Load existing progress
      readComments = new Set(response.item.progress.readComments || []);
      
      // Add progress UI
      addProgressUI();
      
      // Mark already-read comments
      markReadComments();
      
      // Set up intersection observer to track visible comments
      setupVisibilityTracking();
      
      // Add continue reading button if there's progress
      if (response.item.progress.lastReadCommentId) {
        addContinueReadingButton(response.item.progress.lastReadCommentId);
      }
    }

    // Add save/remove button to the item header
    addItemPageButton();
  }

  // Add save buttons to story list on main pages
  function addSaveButtonsToList() {
    const storyRows = document.querySelectorAll('.athing');
    
    storyRows.forEach(row => {
      const id = row.id;
      if (!id) return;

      // Find the subtext row (contains comments link, points, etc.)
      const subtextRow = row.nextElementSibling;
      if (!subtextRow || !subtextRow.classList.contains('athing')) {
        const subtext = subtextRow?.querySelector('.subtext');
        if (subtext) {
          addSaveButtonToSubtext(subtext, id, row);
        }
      }
    });
  }

  // Add save button to a story's subtext
  async function addSaveButtonToSubtext(subtext, itemId, storyRow) {
    // Check if button already exists
    if (subtext.querySelector('.hn-later-btn')) return;

    const response = await sendMessage({ action: 'getItem', itemId: itemId });
    const isSaved = response.success && response.item;

    const btn = document.createElement('span');
    btn.className = 'hn-later-btn';
    btn.innerHTML = isSaved 
      ? ' | <a href="javascript:void(0)" class="hn-later-remove">★ saved</a>'
      : ' | <a href="javascript:void(0)" class="hn-later-save">☆ save for later</a>';
    
    btn.querySelector('a').addEventListener('click', async (e) => {
      e.preventDefault();
      if (isSaved) {
        await removeFromLater(itemId, btn);
      } else {
        await saveForLater(itemId, storyRow, btn);
      }
    });

    subtext.appendChild(btn);

    // Add progress indicator if saved
    if (isSaved && response.item.progress.percentage > 0) {
      const progress = document.createElement('span');
      progress.className = 'hn-later-progress-inline';
      progress.textContent = ` (${response.item.progress.percentage}% read)`;
      btn.appendChild(progress);
    }
  }

  // Save story to read later
  async function saveForLater(itemId, storyRow, btnContainer) {
    const titleLink = storyRow.querySelector('.titleline > a');
    const title = titleLink ? titleLink.textContent : 'Unknown Title';
    
    // Get subtext info
    const subtextRow = storyRow.nextElementSibling;
    const subtext = subtextRow?.querySelector('.subtext');
    
    let author = '';
    let points = 0;
    let commentCount = 0;

    if (subtext) {
      const userLink = subtext.querySelector('.hnuser');
      author = userLink ? userLink.textContent : '';
      
      const scoreSpan = subtext.querySelector('.score');
      if (scoreSpan) {
        points = parseInt(scoreSpan.textContent) || 0;
      }
      
      // Find comments link
      const links = subtext.querySelectorAll('a');
      links.forEach(link => {
        const text = link.textContent;
        if (text.includes('comment')) {
          const match = text.match(/(\d+)/);
          if (match) commentCount = parseInt(match[1]);
        }
      });
    }

    const data = {
      id: itemId,
      title: title,
      url: `https://news.ycombinator.com/item?id=${itemId}`,
      author: author,
      points: points,
      commentCount: commentCount
    };

    const response = await sendMessage({ action: 'saveItem', data: data });
    
    if (response.success) {
      btnContainer.innerHTML = ' | <a href="javascript:void(0)" class="hn-later-remove">★ saved</a>';
      btnContainer.querySelector('a').addEventListener('click', async (e) => {
        e.preventDefault();
        await removeFromLater(itemId, btnContainer);
      });
      showNotification('Saved for later!');
    }
  }

  // Remove story from read later
  async function removeFromLater(itemId, btnContainer) {
    const response = await sendMessage({ action: 'removeItem', itemId: itemId });
    
    if (response.success) {
      btnContainer.innerHTML = ' | <a href="javascript:void(0)" class="hn-later-save">☆ save for later</a>';
      btnContainer.querySelector('a').addEventListener('click', async (e) => {
        e.preventDefault();
        // Need to get storyRow reference - for now just reload
        location.reload();
      });
      showNotification('Removed from list');
      
      // Remove progress UI if on item page
      if (isItemPage && currentItemId === itemId) {
        const progressBar = document.querySelector('.hn-later-progress-container');
        if (progressBar) progressBar.remove();
      }
    }
  }

  // Add save/remove button on item page
  async function addItemPageButton() {
    const response = await sendMessage({ action: 'getItem', itemId: currentItemId });
    const isSaved = response.success && response.item;

    // Find the fatitem table or title
    const fatitem = document.querySelector('.fatitem');
    if (!fatitem) return;

    const subtext = fatitem.querySelector('.subtext');
    if (!subtext) return;

    // Add button
    const btn = document.createElement('span');
    btn.className = 'hn-later-btn hn-later-item-btn';
    btn.innerHTML = isSaved 
      ? ' | <a href="javascript:void(0)" class="hn-later-remove">★ saved</a>'
      : ' | <a href="javascript:void(0)" class="hn-later-save">☆ save for later</a>';
    
    btn.querySelector('a').addEventListener('click', async (e) => {
      e.preventDefault();
      if (isSaved) {
        await removeFromLater(currentItemId, btn);
        isSavedItem = false;
        // Remove progress tracking
        if (observer) observer.disconnect();
        removeProgressUI();
      } else {
        // Get item details
        const titleEl = fatitem.querySelector('.titleline > a') || fatitem.querySelector('.toptext');
        const title = titleEl ? titleEl.textContent : document.title;
        const userEl = subtext.querySelector('.hnuser');
        const scoreEl = subtext.querySelector('.score');
        
        const data = {
          id: currentItemId,
          title: title,
          url: window.location.href,
          author: userEl ? userEl.textContent : '',
          points: scoreEl ? parseInt(scoreEl.textContent) || 0 : 0,
          commentCount: allComments.length
        };

        const saveResponse = await sendMessage({ action: 'saveItem', data: data });
        if (saveResponse.success) {
          btn.innerHTML = ' | <a href="javascript:void(0)" class="hn-later-remove">★ saved</a>';
          btn.querySelector('a').addEventListener('click', async (e) => {
            e.preventDefault();
            await removeFromLater(currentItemId, btn);
          });
          isSavedItem = true;
          showNotification('Saved for later!');
          
          // Initialize progress tracking
          addProgressUI();
          setupVisibilityTracking();
        }
      }
    });

    subtext.appendChild(btn);
  }

  // Add progress UI to the page
  function addProgressUI() {
    // Remove existing progress UI
    removeProgressUI();

    const container = document.createElement('div');
    container.className = 'hn-later-progress-container';
    container.innerHTML = `
      <div class="hn-later-progress-header">
        <span class="hn-later-progress-label">Reading Progress</span>
        <span class="hn-later-progress-text">${readComments.size} / ${allComments.length} comments</span>
      </div>
      <div class="hn-later-progress-bar-container">
        <div class="hn-later-progress-bar" style="width: ${calculatePercentage()}%"></div>
      </div>
      <div class="hn-later-progress-percentage">${calculatePercentage()}%</div>
    `;

    // Insert after the main item
    const fatitem = document.querySelector('.fatitem');
    if (fatitem) {
      fatitem.parentNode.insertBefore(container, fatitem.nextSibling);
    }
  }

  // Remove progress UI
  function removeProgressUI() {
    const existing = document.querySelector('.hn-later-progress-container');
    if (existing) existing.remove();
    
    const continueBtn = document.querySelector('.hn-later-continue-btn');
    if (continueBtn) continueBtn.remove();
  }

  // Calculate reading percentage
  function calculatePercentage() {
    if (allComments.length === 0) return 0;
    return Math.round((readComments.size / allComments.length) * 100);
  }

  // Mark comments that have been read
  function markReadComments() {
    allComments.forEach(comment => {
      const commentId = comment.id;
      if (readComments.has(commentId)) {
        comment.classList.add('hn-later-read');
      }
    });
  }

  // Set up intersection observer to track visible comments
  function setupVisibilityTracking() {
    if (observer) {
      observer.disconnect();
    }

    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.8 // Comment is considered "read" when 80% visible
    };

    let lastReadComment = null;
    let saveTimeout = null;

    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
          const commentId = entry.target.id;
          if (commentId && !readComments.has(commentId)) {
            readComments.add(commentId);
            entry.target.classList.add('hn-later-read');
            lastReadComment = commentId;
            
            // Update UI
            updateProgressUI();
            
            // Debounce saving to storage
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
              saveProgress(lastReadComment);
            }, 1000);
          }
        }
      });
    }, options);

    // Observe all comments
    allComments.forEach(comment => {
      observer.observe(comment);
    });
  }

  // Update progress UI
  function updateProgressUI() {
    const progressText = document.querySelector('.hn-later-progress-text');
    const progressBar = document.querySelector('.hn-later-progress-bar');
    const progressPercentage = document.querySelector('.hn-later-progress-percentage');
    
    if (progressText) {
      progressText.textContent = `${readComments.size} / ${allComments.length} comments`;
    }
    if (progressBar) {
      progressBar.style.width = `${calculatePercentage()}%`;
    }
    if (progressPercentage) {
      progressPercentage.textContent = `${calculatePercentage()}%`;
    }
  }

  // Save progress to storage
  async function saveProgress(lastReadCommentId) {
    if (!isSavedItem) return;

    const progressData = {
      readComments: Array.from(readComments),
      totalComments: allComments.length,
      lastReadCommentId: lastReadCommentId
    };

    await sendMessage({
      action: 'updateProgress',
      itemId: currentItemId,
      progress: progressData
    });
  }

  // Add "Continue Reading" button
  function addContinueReadingButton(lastReadCommentId) {
    const existingBtn = document.querySelector('.hn-later-continue-btn');
    if (existingBtn) existingBtn.remove();

    const lastReadElement = document.getElementById(lastReadCommentId);
    if (!lastReadElement) return;

    // Find next unread comment
    let nextUnread = null;
    let foundLast = false;
    
    for (const comment of allComments) {
      if (foundLast && !readComments.has(comment.id)) {
        nextUnread = comment;
        break;
      }
      if (comment.id === lastReadCommentId) {
        foundLast = true;
      }
    }

    if (!nextUnread) {
      // If no next unread, find first unread comment
      for (const comment of allComments) {
        if (!readComments.has(comment.id)) {
          nextUnread = comment;
          break;
        }
      }
    }

    if (!nextUnread) return; // All comments read

    const btn = document.createElement('button');
    btn.className = 'hn-later-continue-btn';
    btn.innerHTML = '▶ Continue Reading';
    btn.title = 'Jump to next unread comment';
    
    btn.addEventListener('click', () => {
      nextUnread.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nextUnread.classList.add('hn-later-highlight');
      setTimeout(() => {
        nextUnread.classList.remove('hn-later-highlight');
      }, 2000);
    });

    const progressContainer = document.querySelector('.hn-later-progress-container');
    if (progressContainer) {
      progressContainer.appendChild(btn);
    }
  }

  // Show notification
  function showNotification(message) {
    const existing = document.querySelector('.hn-later-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'hn-later-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('hn-later-notification-hide');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  // Send message to background script
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrollToComment' && currentItemId === request.itemId) {
      const comment = document.getElementById(request.commentId);
      if (comment) {
        comment.scrollIntoView({ behavior: 'smooth', block: 'center' });
        comment.classList.add('hn-later-highlight');
        setTimeout(() => {
          comment.classList.remove('hn-later-highlight');
        }, 2000);
      }
      sendResponse({ success: true });
    }
    return true;
  });
})();
