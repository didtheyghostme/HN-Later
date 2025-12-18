import { saveItem, removeItem, isItemSaved, getItem, updateComments, getProgress } from '@/lib/storage';
import './content-styles.css';

export default defineContentScript({
  matches: ['*://news.ycombinator.com/*'],
  main() {
    const isItemPage = window.location.pathname === '/item';
    const storyId = new URLSearchParams(window.location.search).get('id');

    if (isItemPage && storyId) {
      initCommentTracking(storyId);
    }

    initSaveButtons();
  },
});

// ============================================
// SAVE BUTTONS
// ============================================

async function initSaveButtons() {
  // Find all story rows on the page
  const storyRows = document.querySelectorAll<HTMLTableRowElement>('tr.athing:not(.comtr)');

  for (const row of storyRows) {
    const id = row.id;
    if (!id) continue;

    const titleCell = row.querySelector('td.title:last-child');
    const titleLink = titleCell?.querySelector<HTMLAnchorElement>('a.titleline > a, span.titleline > a');
    if (!titleCell || !titleLink) continue;

    // Create save button
    const btn = document.createElement('button');
    btn.className = 'hn-later-save-btn';
    btn.dataset.storyId = id;

    const isSaved = await isItemSaved(id);
    btn.classList.toggle('saved', isSaved);
    btn.textContent = isSaved ? '📌' : '📍';
    btn.title = isSaved ? 'Remove from Read Later' : 'Save for Later';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await toggleSave(btn, titleLink);
    });

    // Insert before title
    titleCell.insertBefore(btn, titleCell.firstChild);
  }
}

async function toggleSave(btn: HTMLButtonElement, titleLink: HTMLAnchorElement) {
  const storyId = btn.dataset.storyId!;
  const isSaved = btn.classList.contains('saved');

  if (isSaved) {
    await removeItem(storyId);
    btn.classList.remove('saved');
    btn.textContent = '📍';
    btn.title = 'Save for Later';
  } else {
    const title = titleLink.textContent || 'Untitled';
    const url = titleLink.href;
    const hnUrl = `https://news.ycombinator.com/item?id=${storyId}`;

    // Get comment count from subtext
    const subtextRow = document.getElementById(storyId)?.nextElementSibling;
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
    btn.classList.add('saved');
    btn.textContent = '📌';
    btn.title = 'Remove from Read Later';
  }

  // Update badge count
  const items = await (await import('@/lib/storage')).getItems();
  await browser.storage.local.set({ itemCount: items.length });
}

// ============================================
// COMMENT TRACKING
// ============================================

async function initCommentTracking(storyId: string) {
  // Check if this story is saved
  const storyData = await getItem(storyId);
  if (!storyData) return; // Only track saved stories

  // Get all comment elements
  const comments = document.querySelectorAll<HTMLTableRowElement>('tr.athing.comtr');
  if (comments.length === 0) return;

  // Get existing progress
  const progress = await getProgress(storyId);
  const seenSet = progress?.seenComments || new Set<string>();
  const readSet = progress?.readComments || new Set<string>();

  // Mark already-read comments
  comments.forEach((comment) => {
    const commentId = comment.id;
    if (readSet.has(commentId)) {
      comment.classList.add('hn-later-read');
    } else if (!seenSet.has(commentId)) {
      comment.classList.add('hn-later-new');
    }
  });

  // Create scrollbar markers
  createScrollbarMarkers(comments, seenSet, readSet);

  // Create jump button
  createJumpButton(comments, readSet);

  // Handle #hn-later-unread in URL
  if (window.location.hash === '#hn-later-unread') {
    scrollToFirstUnread(comments, readSet);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // Track visibility with IntersectionObserver
  const newlySeen: string[] = [];
  const newlyRead: string[] = [];
  const readTimers = new Map<string, number>();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const commentId = (entry.target as HTMLElement).id;

        if (entry.isIntersecting) {
          // Mark as seen immediately
          if (!seenSet.has(commentId)) {
            seenSet.add(commentId);
            newlySeen.push(commentId);
            entry.target.classList.remove('hn-later-new');
          }

          // Start read timer (500ms visibility = read)
          if (!readSet.has(commentId) && !readTimers.has(commentId)) {
            const timer = window.setTimeout(() => {
              readSet.add(commentId);
              newlyRead.push(commentId);
              entry.target.classList.add('hn-later-read');
              readTimers.delete(commentId);
              updateMarker(commentId, 'read');
            }, 500);
            readTimers.set(commentId, timer);
          }
        } else {
          // Cancel read timer if scrolled away
          const timer = readTimers.get(commentId);
          if (timer) {
            clearTimeout(timer);
            readTimers.delete(commentId);
          }
        }
      });
    },
    { threshold: 0.5 }
  );

  comments.forEach((comment) => observer.observe(comment));

  // Save progress on page unload
  window.addEventListener('beforeunload', () => {
    if (newlySeen.length > 0 || newlyRead.length > 0) {
      updateComments(storyId, newlySeen, newlyRead, comments.length);
    }
  });

  // Also save periodically
  setInterval(() => {
    if (newlySeen.length > 0 || newlyRead.length > 0) {
      updateComments(storyId, [...newlySeen], [...newlyRead], comments.length);
      newlySeen.length = 0;
      newlyRead.length = 0;
    }
  }, 5000);
}

// ============================================
// SCROLLBAR MARKERS
// ============================================

let markersContainer: HTMLDivElement | null = null;
const markerMap = new Map<string, HTMLDivElement>();

function createScrollbarMarkers(
  comments: NodeListOf<HTMLTableRowElement>,
  seenSet: Set<string>,
  readSet: Set<string>
) {
  markersContainer = document.createElement('div');
  markersContainer.className = 'hn-later-scrollbar';

  const docHeight = document.documentElement.scrollHeight;

  comments.forEach((comment) => {
    const commentId = comment.id;
    const rect = comment.getBoundingClientRect();
    const top = (rect.top + window.scrollY) / docHeight;

    const marker = document.createElement('div');
    marker.className = 'hn-later-marker';
    marker.dataset.commentId = commentId;

    if (readSet.has(commentId)) {
      marker.classList.add('read');
    } else if (!seenSet.has(commentId)) {
      marker.classList.add('new');
    } else {
      marker.classList.add('unread');
    }

    marker.style.top = `${top * 100}%`;
    marker.addEventListener('click', () => {
      comment.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    markersContainer!.appendChild(marker);
    markerMap.set(commentId, marker);
  });

  document.body.appendChild(markersContainer);
}

function updateMarker(commentId: string, status: 'read' | 'seen') {
  const marker = markerMap.get(commentId);
  if (marker) {
    marker.classList.remove('new', 'unread');
    marker.classList.add(status === 'read' ? 'read' : 'unread');
  }
}

// ============================================
// JUMP TO UNREAD BUTTON
// ============================================

function createJumpButton(comments: NodeListOf<HTMLTableRowElement>, readSet: Set<string>) {
  const btn = document.createElement('button');
  btn.className = 'hn-later-jump-btn';
  btn.innerHTML = '⬇️ Next Unread';
  btn.title = 'Jump to next unread comment';

  btn.addEventListener('click', () => {
    scrollToFirstUnread(comments, readSet);
  });

  document.body.appendChild(btn);

  // Update visibility based on scroll position
  const updateJumpButton = () => {
    const hasUnreadBelow = Array.from(comments).some((comment) => {
      if (readSet.has(comment.id)) return false;
      const rect = comment.getBoundingClientRect();
      return rect.top > window.innerHeight;
    });
    btn.style.display = hasUnreadBelow ? 'block' : 'none';
  };

  window.addEventListener('scroll', updateJumpButton, { passive: true });
  updateJumpButton();
}

function scrollToFirstUnread(comments: NodeListOf<HTMLTableRowElement>, readSet: Set<string>) {
  for (const comment of comments) {
    if (!readSet.has(comment.id)) {
      const rect = comment.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.3 || rect.top < 0) {
        comment.scrollIntoView({ behavior: 'smooth', block: 'center' });
        comment.classList.add('hn-later-highlight');
        setTimeout(() => comment.classList.remove('hn-later-highlight'), 2000);
        break;
      }
    }
  }
}
