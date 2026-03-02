import type { MemoryDocument } from '@/types';
import { getAllDocuments, saveDocument } from './db';

/**
 * Check if File System Access API is available (Chromium only).
 */
export function hasFileSystemAccess(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

/**
 * Slug a document title for use as a filename.
 * "Work & Career" -> "work-career"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// IDB-based handle storage (separate from main DB to avoid schema conflicts)
const HANDLE_DB = 'llm-memory-sync';
const DIR_HANDLE_KEY = 'syncDirHandle';

async function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('handles');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, DIR_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const get = tx.objectStore('handles').get(DIR_HANDLE_KEY);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Prompt user to pick a sync folder. Stores the handle for reuse.
 */
export async function pickSyncFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!hasFileSystemAccess()) return null;
  try {
    const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
    await storeDirectoryHandle(handle);
    return handle;
  } catch {
    return null; // User cancelled
  }
}

/**
 * Verify we still have permission to the stored directory.
 */
export async function verifyPermission(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getStoredDirectoryHandle();
  if (!handle) return null;

  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission(opts)) === 'granted') return handle;
  if ((await handle.requestPermission(opts)) === 'granted') return handle;
  return null;
}

/**
 * Write a single document to the sync folder.
 */
export async function syncDocument(doc: MemoryDocument): Promise<boolean> {
  const handle = await verifyPermission();
  if (!handle) return false;

  const filename = `${slugify(doc.title)}.md`;
  try {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(`# ${doc.title}\n\n${doc.content}`);
    await writable.close();

    await saveDocument({ ...doc, syncedAt: Date.now() });
    return true;
  } catch (err) {
    console.error('Sync failed:', err);
    return false;
  }
}

/**
 * Sync all documents to the folder.
 */
export async function syncAllDocuments(): Promise<number> {
  const docs = await getAllDocuments();
  let synced = 0;
  for (const doc of docs) {
    if (doc.content && await syncDocument(doc)) synced++;
  }
  return synced;
}

/**
 * Download a single document as a .md file (Firefox fallback).
 */
export function downloadDocument(doc: MemoryDocument): void {
  const content = `# ${doc.title}\n\n${doc.content}`;
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(doc.title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download all documents as individual .md file downloads (Firefox fallback).
 */
export async function downloadAllDocuments(): Promise<void> {
  const docs = await getAllDocuments();
  for (const doc of docs) {
    if (doc.content) downloadDocument(doc);
  }
}
