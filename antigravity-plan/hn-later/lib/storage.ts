import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface SavedStory {
  id: string;
  title: string;
  url: string;
  hnUrl: string;
  savedAt: number;
  lastVisit: number;
  seenComments: string[];
  readComments: string[];
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
    dbPromise = openDB<HNLaterDB>('hn-later', 1, {
      upgrade(db) {
        const store = db.createObjectStore('stories', { keyPath: 'id' });
        store.createIndex('by-savedAt', 'savedAt');
      },
    });
  }
  return dbPromise;
}

export async function saveItem(item: Omit<SavedStory, 'savedAt' | 'lastVisit' | 'seenComments' | 'readComments'>): Promise<void> {
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
    // Create new item
    await db.add('stories', {
      ...item,
      savedAt: Date.now(),
      lastVisit: Date.now(),
      seenComments: [],
      readComments: [],
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

export async function updateComments(
  storyId: string,
  seenCommentIds: string[],
  readCommentIds: string[],
  totalComments: number
): Promise<void> {
  const db = await getDB();
  const item = await db.get('stories', storyId);
  if (!item) return;

  // Merge with existing - use Set to dedupe
  const seenSet = new Set([...item.seenComments, ...seenCommentIds]);
  const readSet = new Set([...item.readComments, ...readCommentIds]);

  await db.put('stories', {
    ...item,
    seenComments: Array.from(seenSet),
    readComments: Array.from(readSet),
    totalComments,
    lastVisit: Date.now(),
  });
}

export async function getProgress(storyId: string): Promise<{
  seenComments: Set<string>;
  readComments: Set<string>;
  totalComments: number;
  readProgress: number;
} | null> {
  const db = await getDB();
  const item = await db.get('stories', storyId);
  if (!item) return null;

  const readProgress = item.totalComments > 0
    ? Math.round((item.readComments.length / item.totalComments) * 100)
    : 0;

  return {
    seenComments: new Set(item.seenComments),
    readComments: new Set(item.readComments),
    totalComments: item.totalComments,
    readProgress,
  };
}

export async function exportData(): Promise<string> {
  const items = await getItems();
  return JSON.stringify({ version: 1, stories: items }, null, 2);
}

export async function importData(json: string): Promise<number> {
  const data = JSON.parse(json);
  if (data.version !== 1 || !Array.isArray(data.stories)) {
    throw new Error('Invalid backup format');
  }
  
  const db = await getDB();
  let imported = 0;
  
  for (const story of data.stories) {
    await db.put('stories', story);
    imported++;
  }
  
  return imported;
}

export type { SavedStory };
