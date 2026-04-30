import type { SavedStory } from '@/lib/storage';

const listEl = document.getElementById('list')!;
const emptyEl = document.getElementById('empty')!;
const exportBtn = document.getElementById('export-btn')!;
const importInput = document.getElementById('import-input') as HTMLInputElement;

// Storage API via message passing
async function getItems(): Promise<SavedStory[]> {
  const response = await browser.runtime.sendMessage({ type: 'GET_ITEMS' });
  if (!response.success) throw new Error(response.error);
  return response.items;
}

async function removeItem(storyId: string): Promise<void> {
  const response = await browser.runtime.sendMessage({ type: 'REMOVE_ITEM', storyId });
  if (!response.success) throw new Error(response.error);
}

async function exportData(): Promise<string> {
  const response = await browser.runtime.sendMessage({ type: 'EXPORT_DATA' });
  if (!response.success) throw new Error(response.error);
  return response.data;
}

async function importData(json: string): Promise<number> {
  const response = await browser.runtime.sendMessage({ type: 'IMPORT_DATA', json });
  if (!response.success) throw new Error(response.error);
  return response.count;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getCheckpointStatus(story: SavedStory): string {
  if (story.checkpointCommentId && story.checkpointTimestamp) {
    return `📍 ${formatTimeAgo(story.checkpointTimestamp)}`;
  }
  return 'Not started';
}

function renderStory(story: SavedStory): HTMLElement {
  const checkpointStatus = getCheckpointStatus(story);
  
  const div = document.createElement('div');
  div.className = 'story-item';
  div.innerHTML = `
    <div class="story-title">
      <a href="${story.url}" target="_blank" title="${story.title}">${story.title}</a>
    </div>
    <div class="story-meta">
      <span class="checkpoint-status">${checkpointStatus}</span>
      <span class="comment-count">${story.totalComments} comments</span>
      <span>${formatTimeAgo(story.savedAt)}</span>
    </div>
    <div class="story-actions">
      <button class="btn btn-primary continue-btn" data-url="${story.hnUrl}">
        ▶ Continue
      </button>
      <button class="btn btn-secondary remove-btn" data-id="${story.id}">
        ✕ Remove
      </button>
    </div>
  `;
  
  // Event handlers
  div.querySelector('.continue-btn')!.addEventListener('click', (e) => {
    const url = (e.currentTarget as HTMLElement).dataset.url!;
    browser.runtime.sendMessage({ type: 'OPEN_THREAD', url });
    window.close();
  });
  
  div.querySelector('.remove-btn')!.addEventListener('click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.id!;
    await removeItem(id);
    div.remove();
    checkEmpty();
  });
  
  return div;
}

function checkEmpty() {
  const hasItems = listEl.children.length > 0;
  listEl.hidden = !hasItems;
  emptyEl.hidden = hasItems;
}

async function render() {
  const items = await getItems();
  listEl.innerHTML = '';
  
  for (const item of items) {
    listEl.appendChild(renderStory(item));
  }
  
  checkEmpty();
}

function showToast(message: string) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast?.classList.remove('show'), 2000);
}

// Export data
exportBtn.addEventListener('click', async () => {
  try {
    const data = await exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hn-later-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!');
  } catch (e) {
    showToast('Export failed');
    console.error(e);
  }
});

// Import data
importInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const count = await importData(text);
    await render();
    showToast(`Imported ${count} stories!`);
  } catch (e) {
    showToast('Import failed - invalid file');
    console.error(e);
  }
  
  importInput.value = '';
});

// Initial render
render();
