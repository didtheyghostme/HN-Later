// Storage API wrapper - sends messages to background script
// Use this from content scripts and popup instead of direct storage access

import type { SavedStory } from './storage';

export async function saveItem(item: Omit<SavedStory, 'savedAt' | 'lastVisit' | 'checkpointCommentId' | 'checkpointTimestamp'>): Promise<void> {
  const response = await browser.runtime.sendMessage({ type: 'SAVE_ITEM', item });
  if (!response.success) throw new Error(response.error);
}

export async function removeItem(storyId: string): Promise<void> {
  const response = await browser.runtime.sendMessage({ type: 'REMOVE_ITEM', storyId });
  if (!response.success) throw new Error(response.error);
}

export async function getItems(): Promise<SavedStory[]> {
  const response = await browser.runtime.sendMessage({ type: 'GET_ITEMS' });
  if (!response.success) throw new Error(response.error);
  return response.items;
}

export async function getItem(storyId: string): Promise<SavedStory | undefined> {
  const response = await browser.runtime.sendMessage({ type: 'GET_ITEM', storyId });
  if (!response.success) throw new Error(response.error);
  return response.item;
}

export async function isItemSaved(storyId: string): Promise<boolean> {
  const response = await browser.runtime.sendMessage({ type: 'IS_SAVED', storyId });
  if (!response.success) throw new Error(response.error);
  return response.saved;
}

export async function updateCheckpoint(
  storyId: string,
  checkpointCommentId: string,
  totalComments: number
): Promise<void> {
  const response = await browser.runtime.sendMessage({ 
    type: 'UPDATE_CHECKPOINT', 
    storyId, 
    checkpointCommentId, 
    totalComments 
  });
  if (!response.success) throw new Error(response.error);
}

export async function getProgress(storyId: string): Promise<{
  checkpointCommentId: string | null;
  checkpointTimestamp: number | null;
  totalComments: number;
} | null> {
  const response = await browser.runtime.sendMessage({ type: 'GET_PROGRESS', storyId });
  if (!response.success) throw new Error(response.error);
  return response.progress;
}

export async function exportData(): Promise<string> {
  const response = await browser.runtime.sendMessage({ type: 'EXPORT_DATA' });
  if (!response.success) throw new Error(response.error);
  return response.data;
}

export async function importData(json: string): Promise<number> {
  const response = await browser.runtime.sendMessage({ type: 'IMPORT_DATA', json });
  if (!response.success) throw new Error(response.error);
  return response.count;
}

export type { SavedStory };
