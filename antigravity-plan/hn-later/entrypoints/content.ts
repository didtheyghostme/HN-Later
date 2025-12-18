import { saveItem, removeItem, isItemSaved, getItem, updateCheckpoint, getProgress } from '@/lib/storageApi';
import './content-styles.css';

export default defineContentScript({
  matches: ['*://news.ycombinator.com/*'],
  main() {
    const isItemPage = window.location.pathname === '/item';
    const storyId = new URLSearchParams(window.location.search).get('id');

    if (isItemPage && storyId) {
      initItemPage(storyId);
    }

    // Add collapse buttons to all comments on any item page
    if (isItemPage) {
      initCollapseButtons();
    }

    initSaveLinks();
  },
});

// ============================================
// SAVE LINKS (HN native style)
// ============================================

async function initSaveLinks() {
  // Find all story rows on the page (listing pages)
  const storyRows = document.querySelectorAll<HTMLTableRowElement>('tr.athing:not(.comtr)');

  for (const row of storyRows) {
    const id = row.id;
    if (!id) continue;

    const subtextRow = row.nextElementSibling;
    const subtext = subtextRow?.querySelector('td.subtext');
    if (!subtext) continue;

    // Find the comments link
    const links = subtext.querySelectorAll('a');
    const commentsLink = Array.from(links).find(a => a.href.includes('item?id='));
    if (!commentsLink) continue;

    // Create save link
    const saveLink = document.createElement('a');
    saveLink.href = '#';
    saveLink.className = 'hn-later-save-link';
    saveLink.dataset.storyId = id;

    const isSaved = await isItemSaved(id);
    updateSaveLinkState(saveLink, isSaved);

    saveLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await toggleSaveFromListing(saveLink, row);
    });

    // Insert after comments link with separator
    const separator = document.createTextNode(' | ');
    commentsLink.after(separator, saveLink);
  }
}

function updateSaveLinkState(link: HTMLAnchorElement, isSaved: boolean) {
  link.textContent = isSaved ? 'saved ✓' : 'save';
  link.classList.toggle('saved', isSaved);
}

async function toggleSaveFromListing(link: HTMLAnchorElement, row: HTMLTableRowElement) {
  const storyId = link.dataset.storyId!;
  const isSaved = link.classList.contains('saved');

  if (isSaved) {
    await removeItem(storyId);
    updateSaveLinkState(link, false);
  } else {
    const titleCell = row.querySelector('td.title:last-child');
    const titleLink = titleCell?.querySelector<HTMLAnchorElement>('a.titleline > a, span.titleline > a');
    if (!titleLink) return;

    const title = titleLink.textContent || 'Untitled';
    const url = titleLink.href;
    const hnUrl = `https://news.ycombinator.com/item?id=${storyId}`;

    // Get comment count from subtext
    const subtextRow = row.nextElementSibling;
    const commentLink = subtextRow?.querySelector<HTMLAnchorElement>('a[href*="item?id="]');
    const commentText = commentLink?.textContent || '';
    const commentMatch = commentText.match(/(\d+)\s*comment/);
    const totalComments = commentMatch ? parseInt(commentMatch[1], 10) : 0;

    await saveItem({
      id: storyId,
      title,
      url,
      hnUrl,
      totalComments,
    });
    updateSaveLinkState(link, true);
  }
}

// ============================================
// ITEM PAGE (comments page)
// ============================================

async function initItemPage(storyId: string) {
  // Add save link to item page
  await addItemPageSaveLink(storyId);

  // Check if this story is saved
  const storyData = await getItem(storyId);
  if (storyData) {
    initCommentTracking(storyId, storyData.checkpointTimestamp);
  }
}

async function addItemPageSaveLink(storyId: string) {
  const subtext = document.querySelector('td.subtext');
  if (!subtext) return;

  const links = subtext.querySelectorAll('a');
  const lastLink = links[links.length - 1];
  if (!lastLink) return;

  const saveLink = document.createElement('a');
  saveLink.href = '#';
  saveLink.className = 'hn-later-save-link';
  saveLink.dataset.storyId = storyId;

  const isSaved = await isItemSaved(storyId);
  updateSaveLinkState(saveLink, isSaved);

  saveLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await toggleSaveFromItemPage(saveLink, storyId);
  });

  const separator = document.createTextNode(' | ');
  lastLink.after(separator, saveLink);
}

async function toggleSaveFromItemPage(link: HTMLAnchorElement, storyId: string) {
  const isSaved = link.classList.contains('saved');

  if (isSaved) {
    await removeItem(storyId);
    updateSaveLinkState(link, false);
    removeTrackingUI();
  } else {
    const titleEl = document.querySelector('.titleline > a, .storylink') as HTMLAnchorElement;
    const title = titleEl?.textContent || 'Untitled';
    const url = titleEl?.href || window.location.href;
    const hnUrl = window.location.href;

    const comments = document.querySelectorAll<HTMLTableRowElement>('tr.athing.comtr');
    const totalComments = comments.length;

    await saveItem({
      id: storyId,
      title,
      url,
      hnUrl,
      totalComments,
    });
    updateSaveLinkState(link, true);

    // Start tracking immediately (no refresh needed)
    initCommentTracking(storyId, null);
  }
}

function removeTrackingUI() {
  document.querySelector('.hn-later-scrollbar')?.remove();
  document.querySelector('.hn-later-buttons')?.remove();
  document.querySelectorAll('.hn-later-new-label').forEach(el => el.remove());
}

// ============================================
// COMMENT TRACKING
// ============================================

async function initCommentTracking(storyId: string, checkpointTimestamp: number | null) {
  const comments = document.querySelectorAll<HTMLTableRowElement>('tr.athing.comtr');
  if (comments.length === 0) return;

  // Get existing progress
  const progress = await getProgress(storyId);
  const checkpointId = progress?.checkpointCommentId ?? null;

  // Mark new comments (posted after last checkpoint)
  if (checkpointTimestamp) {
    markNewComments(comments, checkpointTimestamp);
  }

  // Create UI elements
  createScrollbarMarkers(comments, checkpointId);
  createFloatingButtons(storyId, comments);

  // Handle #hn-later-continue in URL (from popup "Continue" button)
  if (window.location.hash === '#hn-later-continue' && checkpointId) {
    const checkpointEl = document.getElementById(checkpointId);
    if (checkpointEl) {
      checkpointEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }
}

function markNewComments(comments: NodeListOf<HTMLTableRowElement>, checkpointTimestamp: number) {
  comments.forEach((comment) => {
    // Try to get comment timestamp from the "X hours ago" link
    const ageLink = comment.querySelector('.age a');
    if (!ageLink) return;

    // HN shows relative time, but the title attribute has the absolute timestamp
    const titleAttr = ageLink.getAttribute('title');
    if (!titleAttr) return;

    // Parse timestamp (format: "2024-01-15T12:30:00")
    const commentTime = new Date(titleAttr).getTime();
    
    if (commentTime > checkpointTimestamp) {
      // This comment is new since last visit
      const label = document.createElement('span');
      label.className = 'hn-later-new-label';
      label.textContent = '[NEW]';
      ageLink.after(label);
      comment.classList.add('hn-later-new');
    }
  });
}

// ============================================
// SCROLLBAR MARKERS (Discourse-style)
// ============================================

let markersContainer: HTMLDivElement | null = null;
const markerMap = new Map<string, HTMLDivElement>();

function createScrollbarMarkers(
  comments: NodeListOf<HTMLTableRowElement>,
  checkpointId: string | null
) {
  markersContainer = document.createElement('div');
  markersContainer.className = 'hn-later-scrollbar';

  // Add viewport indicator
  const viewport = document.createElement('div');
  viewport.className = 'hn-later-viewport';
  markersContainer.appendChild(viewport);

  const docHeight = document.documentElement.scrollHeight;
  let foundCheckpoint = checkpointId === null; // If no checkpoint, all are "unread"

  comments.forEach((comment) => {
    const commentId = comment.id;
    const rect = comment.getBoundingClientRect();
    const top = (rect.top + window.scrollY) / docHeight;

    const marker = document.createElement('div');
    marker.className = 'hn-later-marker';
    marker.dataset.commentId = commentId;

    if (comment.classList.contains('hn-later-new')) {
      marker.classList.add('new');
    } else if (!foundCheckpoint) {
      marker.classList.add('read');
    } else {
      marker.classList.add('unread');
    }

    if (commentId === checkpointId) {
      foundCheckpoint = true;
    }

    marker.style.top = `${top * 100}%`;
    marker.addEventListener('click', () => {
      comment.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    markersContainer!.appendChild(marker);
    markerMap.set(commentId, marker);
  });

  document.body.appendChild(markersContainer);

  // Update viewport indicator on scroll
  const updateViewport = () => {
    const scrollTop = window.scrollY;
    const viewportHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    
    viewport.style.top = `${(scrollTop / docHeight) * 100}%`;
    viewport.style.height = `${(viewportHeight / docHeight) * 100}%`;
  };

  window.addEventListener('scroll', updateViewport, { passive: true });
  updateViewport();
}

// ============================================
// FLOATING BUTTONS
// ============================================

function createFloatingButtons(storyId: string, comments: NodeListOf<HTMLTableRowElement>) {
  const container = document.createElement('div');
  container.className = 'hn-later-buttons';

  // Checkpoint button
  const checkpointBtn = document.createElement('button');
  checkpointBtn.className = 'hn-later-btn checkpoint';
  checkpointBtn.innerHTML = '📍 Checkpoint';
  checkpointBtn.title = 'Save reading position';
  checkpointBtn.addEventListener('click', () => setCheckpoint(storyId, comments));

  // Next Topic button
  const nextTopicBtn = document.createElement('button');
  nextTopicBtn.className = 'hn-later-btn next-topic';
  nextTopicBtn.innerHTML = '⏭️ Next Topic';
  nextTopicBtn.title = 'Jump to next top-level comment';
  nextTopicBtn.addEventListener('click', () => scrollToNextTopic(comments));

  container.appendChild(checkpointBtn);
  container.appendChild(nextTopicBtn);
  document.body.appendChild(container);
}

// ============================================
// PER-COMMENT COLLAPSE BUTTONS
// ============================================

function initCollapseButtons() {
  const comments = document.querySelectorAll<HTMLTableRowElement>('tr.athing.comtr');
  
  comments.forEach((comment) => {
    // Make the row position:relative so we can absolutely position the button
    comment.style.position = 'relative';
    
    // Create collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'hn-later-collapse-btn';
    collapseBtn.textContent = '▼';
    collapseBtn.title = 'Collapse thread';
    
    collapseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Find and click HN's native toggle
      const toggleLink = comment.querySelector<HTMLAnchorElement>('.togg');
      if (toggleLink) {
        toggleLink.click();
        // Update button icon based on collapsed state
        const isCollapsed = toggleLink.textContent?.includes('+');
        collapseBtn.textContent = isCollapsed ? '▲' : '▼';
      }
    });
    
    // Append directly to the row
    comment.appendChild(collapseBtn);
  });
}

async function setCheckpoint(storyId: string, comments: NodeListOf<HTMLTableRowElement>) {
  // Find the comment currently at top of viewport
  let topComment: HTMLTableRowElement | null = null;
  
  for (const comment of comments) {
    const rect = comment.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
      topComment = comment;
      break;
    }
  }

  if (!topComment) {
    // Fallback to first visible
    for (const comment of comments) {
      const rect = comment.getBoundingClientRect();
      if (rect.bottom > 0) {
        topComment = comment;
        break;
      }
    }
  }

  if (topComment) {
    await updateCheckpoint(storyId, topComment.id, comments.length);
    
    // Show confirmation
    showToast('📍 Checkpoint saved!');
    
    // Update markers to show read/unread split
    let foundCheckpoint = false;
    comments.forEach((comment) => {
      const marker = markerMap.get(comment.id);
      if (marker && !marker.classList.contains('new')) {
        if (!foundCheckpoint) {
          marker.classList.remove('unread');
          marker.classList.add('read');
        } else {
          marker.classList.remove('read');
          marker.classList.add('unread');
        }
      }
      if (comment.id === topComment!.id) {
        foundCheckpoint = true;
      }
    });
  }
}

function scrollToNextTopic(comments: NodeListOf<HTMLTableRowElement>) {
  const currentScrollTop = window.scrollY;

  for (const comment of comments) {
    // Check if it's a top-level comment (indent = 0)
    const indent = comment.querySelector('.ind img');
    const indentWidth = indent ? parseInt(indent.getAttribute('width') || '0', 10) : 0;
    
    if (indentWidth === 0) {
      const rect = comment.getBoundingClientRect();
      // Find one that's below current viewport position
      if (rect.top + window.scrollY > currentScrollTop + 100) {
        comment.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  }
}

function showToast(message: string) {
  let toast = document.querySelector<HTMLDivElement>('.hn-later-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'hn-later-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast?.classList.remove('show'), 2000);
}
