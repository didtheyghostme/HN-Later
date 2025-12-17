// HN Later - Popup Script
// Manages the read later list UI

document.addEventListener('DOMContentLoaded', init);

let allItems = [];
let currentTab = 'all';

async function init() {
  await loadItems();
  setupTabs();
}

// Load all items from storage
async function loadItems() {
  const response = await chrome.runtime.sendMessage({ action: 'getAllItems' });
  
  if (response.success) {
    allItems = response.items;
    updateStats();
    renderItems();
  }
}

// Update stats in header
function updateStats() {
  const totalEl = document.getElementById('totalItems');
  const avgEl = document.getElementById('avgProgress');
  
  totalEl.textContent = allItems.length;
  
  if (allItems.length > 0) {
    const avgProgress = Math.round(
      allItems.reduce((sum, item) => sum + (item.progress?.percentage || 0), 0) / allItems.length
    );
    avgEl.textContent = avgProgress + '%';
  } else {
    avgEl.textContent = '0%';
  }
}

// Set up tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderItems();
    });
  });
}

// Filter items based on current tab
function filterItems() {
  switch (currentTab) {
    case 'unread':
      return allItems.filter(item => (item.progress?.percentage || 0) === 0);
    case 'reading':
      return allItems.filter(item => {
        const p = item.progress?.percentage || 0;
        return p > 0 && p < 100;
      });
    case 'complete':
      return allItems.filter(item => (item.progress?.percentage || 0) === 100);
    default:
      return allItems;
  }
}

// Render items in the list
function renderItems() {
  const listEl = document.getElementById('itemList');
  const emptyEl = document.getElementById('emptyState');
  const items = filterItems();
  
  if (items.length === 0) {
    emptyEl.classList.remove('hidden');
    // Clear any existing items
    listEl.querySelectorAll('.item').forEach(el => el.remove());
    return;
  }
  
  emptyEl.classList.add('hidden');
  
  // Clear existing items
  listEl.querySelectorAll('.item').forEach(el => el.remove());
  
  items.forEach(item => {
    const itemEl = createItemElement(item);
    listEl.appendChild(itemEl);
  });
}

// Create item element
function createItemElement(item) {
  const percentage = item.progress?.percentage || 0;
  const status = getStatus(percentage);
  const savedDate = formatDate(item.savedAt);
  
  const el = document.createElement('div');
  el.className = 'item';
  el.innerHTML = `
    <div class="item-header">
      <span class="item-title">${escapeHtml(item.title)}</span>
      <button class="item-remove" title="Remove from list">×</button>
    </div>
    <div class="item-meta">
      <span>👤 ${escapeHtml(item.author || 'unknown')}</span>
      <span>💬 ${item.commentCount || 0}</span>
      <span>📅 ${savedDate}</span>
    </div>
    <div class="item-progress-container">
      <div class="item-progress-bar ${status}" style="width: ${percentage}%"></div>
    </div>
    <div class="item-footer">
      <span class="item-progress-text ${status}">
        ${percentage === 100 ? '✓ Complete' : percentage > 0 ? percentage + '% read' : 'Not started'}
      </span>
      <div class="item-actions">
        ${percentage > 0 && percentage < 100 
          ? '<button class="item-action-btn continue">▶ Continue</button>' 
          : ''}
        <button class="item-action-btn open">Open</button>
      </div>
    </div>
  `;
  
  // Event handlers
  el.querySelector('.item-remove').addEventListener('click', async (e) => {
    e.stopPropagation();
    await removeItem(item.id);
  });
  
  const continueBtn = el.querySelector('.item-action-btn.continue');
  if (continueBtn) {
    continueBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openItem(item, true);
    });
  }
  
  el.querySelector('.item-action-btn.open').addEventListener('click', async (e) => {
    e.stopPropagation();
    await openItem(item, false);
  });
  
  el.addEventListener('click', () => openItem(item, percentage > 0 && percentage < 100));
  
  return el;
}

// Get status class based on percentage
function getStatus(percentage) {
  if (percentage === 0) return 'unread';
  if (percentage === 100) return 'complete';
  return 'reading';
}

// Open item in new tab
async function openItem(item, shouldContinue) {
  const url = item.url + (shouldContinue && item.progress?.lastReadCommentId 
    ? `#${item.progress.lastReadCommentId}` 
    : '');
  
  await chrome.tabs.create({ url });
  window.close();
}

// Remove item from list
async function removeItem(itemId) {
  const response = await chrome.runtime.sendMessage({ 
    action: 'removeItem', 
    itemId: itemId 
  });
  
  if (response.success) {
    allItems = allItems.filter(item => item.id !== itemId);
    updateStats();
    renderItems();
  }
}

// Format date to relative time
function formatDate(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
