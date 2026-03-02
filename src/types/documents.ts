export interface DocumentHistoryEntry {
  content: string;
  version: number;
  timestamp: number;
  source: 'merge' | 'manual-edit' | 'aboutme-generate';
}

export interface MemoryDocument {
  id: string;
  categoryId: string;
  title: string;
  content: string;
  version: number;
  history: DocumentHistoryEntry[];
  updatedAt: number;
  syncedAt: number | null;
}
