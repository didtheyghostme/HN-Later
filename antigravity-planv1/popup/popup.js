/**
 * HN Read Later - Popup Script
 * Handles the extension popup UI
 */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadItems();
}

/**
 * Load and display all saved items
 */
async function loadItems() {
  const loading = document.getElementById('loading');
  const emptyState = document.getElementById('empty-state');
  const itemList = document.getElementById('item-list');
  
  try {
    const items = await Storage.getItems();
    
    loading.style.display = 'none';
    
    if (items.length === 0) {
      emptyState.style.display = 'flex';
      itemList.style.display = 'none';
      updateStats(0, 0);
    } else {
      emptyState.style.display = 'none';
      itemList.style.display = 'block';
      renderItems(items);
      
      // Calculate stats
      const inProgress = items.filter(item => {
        const progress = Storage.getProgress(item);
        return progress > 0 && progress < 100;
      }).length;
      updateStats(items.length, inProgress);
    }
  } catch (error) {
    console.error('Error loading items:', error);
    loading.textContent = 'Error loading items';
  }
}

/**
 * Update the stats display
 */
function updateStats(total, inProgress) {
  document.getElementById('total-count').textContent = total;
  document.getElementById('in-progress-count').textContent = inProgress;
}

/**
 * Render the list of saved items
 */
function renderItems(items) {
  const itemList = document.getElementById('item-list');
  itemList.innerHTML = '';
  
  items.forEach(item => {
    const li = createItemElement(item);
    itemList.appendChild(li);
  });
}

/**
 * Create a list item element for a saved item
 */
function createItemElement(item) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = item.itemId;
  
  const progress = Storage.getProgress(item);
  const readCount = (item.readCommentIds || []).length;
  const savedDate = formatRelativeTime(item.savedAt);
  
  li.innerHTML = `
    <div class="item-main">
      <a href="${item.hnUrl}" class="item-title" target="_blank" title="${escapeHtml(item.title)}">
        ${escapeHtml(truncate(item.title, 60))}
      </a>
      <div class="item-meta">
        ${item.totalComments} comments • saved ${savedDate}
      </div>
    </div>
    <div class="item-progress">
      <div class="progress-circle" style="--progress: ${progress}">
        <span class="progress-value">${progress}%</span>
      </div>
      <div class="progress-label">${readCount}/${item.totalComments}</div>
    </div>
    <button class="item-delete" title="Remove from list">✕</button>
  `;
  
  // Handle delete button
  li.querySelector('.item-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteItem(item.itemId, li);
  });
  
  return li;
}

/**
 * Delete a saved item
 */
async function deleteItem(itemId, element) {
  // Add removing animation
  element.classList.add('removing');
  
  await Storage.deleteItem(itemId);
  
  // Wait for animation then reload
  setTimeout(() => {
    loadItems();
  }, 300);
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  return 'just now';
}

/**
 * Truncate text to max length
 */
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
