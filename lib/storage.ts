import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface SavedStory {
  id: string;
  title: string;
  url: string;
  hnUrl: string;
  savedAt: number;
  lastVisit: number;
  checkpointCommentId: string | null;
  checkpointTimestamp: number | null;
  totalComments: number;
}

interface HNLaterDB extends DBSchema {
  stories: {
    key: string;
    value: SavedStory;
    indexes: { 'by-savedAt': number };
  };
}

let dbPromise: Promise<IDBPDatabase<HNLaterDB>> | null = null;

function getDB(): Promise<IDBPDatabase<HNLaterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HNLaterDB>('hn-later', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('stories', { keyPath: 'id' });
          store.createIndex('by-savedAt', 'savedAt');
        }
        // Migration from v1 to v2: seenComments/readComments -> checkpoint
        // Old data will work, new fields default to null
      },
    });
  }
  return dbPromise;
}

export async function saveItem(item: Omit<SavedStory, 'savedAt' | 'lastVisit' | 'checkpointCommentId' | 'checkpointTimestamp'>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('stories', item.id);
  
  if (existing) {
    // Update existing item
    await db.put('stories', {
      ...existing,
      ...item,
      lastVisit: Date.now(),
    });
  } else {
    // Create new item - set timestamp so [NEW] labels work from first revisit
    await db.add('stories', {
      ...item,
      savedAt: Date.now(),
      lastVisit: Date.now(),
      checkpointCommentId: null,
      checkpointTimestamp: Date.now(),  // Set initial timestamp for [NEW] detection
    });
  }
}

export async function removeItem(storyId: string): Promise<void> {
  const db = await getDB();
  await db.delete('stories', storyId);
}

export async function getItem(storyId: string): Promise<SavedStory | undefined> {
  const db = await getDB();
  return db.get('stories', storyId);
}

export async function getItems(): Promise<SavedStory[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex('stories', 'by-savedAt');
  return items.reverse(); // Most recent first
}

export async function isItemSaved(storyId: string): Promise<boolean> {
  const db = await getDB();
  const item = await db.get('stories', storyId);
  return !!item;
}

export async function updateCheckpoint(
  storyId: string,
  checkpointCommentId: string,
  totalComments: number
): Promise<void> {
  const db = await getDB();
  const item = await db.get('stories', storyId);
  if (!item) return;

  await db.put('stories', {
    ...item,
    checkpointCommentId,
    checkpointTimestamp: Date.now(),
    totalComments,
    lastVisit: Date.now(),
  });
}

export async function getProgress(storyId: string): Promise<{
  checkpointCommentId: string | null;
  checkpointTimestamp: number | null;
  totalComments: number;
} | null> {
  const db = await getDB();
  const item = await db.get('stories', storyId);
  if (!item) return null;

  return {
    checkpointCommentId: item.checkpointCommentId,
    checkpointTimestamp: item.checkpointTimestamp,
    totalComments: item.totalComments,
  };
}

export async function exportData(): Promise<string> {
  const items = await getItems();
  return JSON.stringify({ version: 2, stories: items }, null, 2);
}

export async function importData(json: string): Promise<number> {
  const data = JSON.parse(json);
  if (!data.version || !Array.isArray(data.stories)) {
    throw new Error('Invalid backup format');
  }
  
  const db = await getDB();
  let imported = 0;
  
  for (const story of data.stories) {
    // Handle v1 format migration
    const migrated: SavedStory = {
      id: story.id,
      title: story.title,
      url: story.url,
      hnUrl: story.hnUrl,
      savedAt: story.savedAt,
      lastVisit: story.lastVisit,
      totalComments: story.totalComments || 0,
      checkpointCommentId: story.checkpointCommentId || null,
      checkpointTimestamp: story.checkpointTimestamp || null,
    };
    await db.put('stories', migrated);
    imported++;
  }
  
  return imported;
}

export type { SavedStory };
