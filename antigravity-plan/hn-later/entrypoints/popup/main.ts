import { getItems, removeItem, exportData, importData, type SavedStory } from '@/lib/storage';

const listEl = document.getElementById('list')!;
const emptyEl = document.getElementById('empty')!;
const exportBtn = document.getElementById('export-btn')!;
const importInput = document.getElementById('import-input') as HTMLInputElement;

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

function calculateProgress(story: SavedStory): number {
  if (story.totalComments === 0) return 0;
  return Math.round((story.readComments.length / story.totalComments) * 100);
}

function countNewComments(story: SavedStory): number {
  // New = total - seen
  return Math.max(0, story.totalComments - story.seenComments.length);
}

function renderStory(story: SavedStory): HTMLElement {
  const progress = calculateProgress(story);
  const newCount = countNewComments(story);
  
  const div = document.createElement('div');
  div.className = 'story-item';
  div.innerHTML = `
    <div class="story-title">
      <a href="${story.url}" target="_blank" title="${story.title}">${story.title}</a>
    </div>
    <div class="story-meta">
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <span class="progress-text">${progress}%</span>
      </div>
      ${newCount > 0 ? `<span class="new-badge">${newCount} new</span>` : ''}
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
    await updateItemCount();
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

async function updateItemCount() {
  const items = await getItems();
  await browser.storage.local.set({ itemCount: items.length });
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
    await updateItemCount();
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
