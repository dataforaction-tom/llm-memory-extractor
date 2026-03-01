import type { Fact, CapturedConversation, StoredSchema } from '@/types';
import {
  getAllFacts,
  getAllConversations,
  getSchema,
  clearAllFacts,
  clearAllConversations,
  getDb,
} from './db';

interface ExportData {
  facts: Fact[];
  conversations: CapturedConversation[];
  schema: StoredSchema | undefined;
}

export async function exportAsJSON(): Promise<string> {
  const [facts, conversations, schema] = await Promise.all([
    getAllFacts(),
    getAllConversations(),
    getSchema(),
  ]);

  const data: ExportData = { facts, conversations, schema };
  return JSON.stringify(data, null, 2);
}

export async function importFromJSON(json: string): Promise<void> {
  const data: ExportData = JSON.parse(json);

  const db = await getDb();

  // Clear all stores first
  await Promise.all([
    clearAllFacts(),
    clearAllConversations(),
    db.clear('schema'),
  ]);

  // Write all data in a single transaction per store
  const factsTx = db.transaction('facts', 'readwrite');
  for (const fact of data.facts) {
    await factsTx.store.add(fact);
  }
  await factsTx.done;

  const convTx = db.transaction('conversations', 'readwrite');
  for (const conv of data.conversations) {
    await convTx.store.add(conv);
  }
  await convTx.done;

  if (data.schema) {
    await db.put('schema', data.schema);
  }
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
