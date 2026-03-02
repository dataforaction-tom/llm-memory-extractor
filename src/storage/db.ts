import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Fact, CapturedConversation, StoredSchema, MemoryDocument } from '@/types';

interface MemoryExtractorDB extends DBSchema {
  facts: {
    key: string;
    value: Fact;
    indexes: {
      'categoryId': string;
      'status': Fact['status'];
      'sourcePlatform': string;
      'createdAt': number;
    };
  };
  conversations: {
    key: string;
    value: CapturedConversation;
    indexes: {
      'platform': string;
      'extractionStatus': CapturedConversation['extractionStatus'];
      'capturedAt': number;
    };
  };
  schema: {
    key: string;
    value: StoredSchema;
  };
  documents: {
    key: string;
    value: MemoryDocument;
    indexes: {
      'categoryId': string;
      'updatedAt': number;
    };
  };
}

const DB_NAME = 'llm-memory-extractor';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<MemoryExtractorDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<MemoryExtractorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MemoryExtractorDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          // Facts store
          const factStore = db.createObjectStore('facts', { keyPath: 'id' });
          factStore.createIndex('categoryId', 'categoryId');
          factStore.createIndex('status', 'status');
          factStore.createIndex('sourcePlatform', 'sourcePlatform');
          factStore.createIndex('createdAt', 'createdAt');

          // Conversations store
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('platform', 'platform');
          convStore.createIndex('extractionStatus', 'extractionStatus');
          convStore.createIndex('capturedAt', 'capturedAt');

          // Schema store (singleton)
          db.createObjectStore('schema', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('categoryId', 'categoryId');
          docStore.createIndex('updatedAt', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
}

// --- Facts ---

export async function getAllFacts(): Promise<Fact[]> {
  const db = await getDb();
  return db.getAll('facts');
}

export async function getFactsByStatus(status: Fact['status']): Promise<Fact[]> {
  const db = await getDb();
  return db.getAllFromIndex('facts', 'status', status);
}

export async function getFactsByCategory(categoryId: string): Promise<Fact[]> {
  const db = await getDb();
  return db.getAllFromIndex('facts', 'categoryId', categoryId);
}

export async function addFact(fact: Fact): Promise<void> {
  const db = await getDb();
  await db.add('facts', fact);
}

export async function updateFact(id: string, updates: Partial<Fact>): Promise<void> {
  const db = await getDb();
  const existing = await db.get('facts', id);
  if (!existing) {
    throw new Error(`Fact not found: ${id}`);
  }
  await db.put('facts', { ...existing, ...updates, id });
}

export async function deleteFact(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('facts', id);
}

export async function clearAllFacts(): Promise<void> {
  const db = await getDb();
  await db.clear('facts');
}

// --- Conversations ---

export async function getAllConversations(): Promise<CapturedConversation[]> {
  const db = await getDb();
  return db.getAll('conversations');
}

export async function getConversation(id: string): Promise<CapturedConversation | undefined> {
  const db = await getDb();
  return db.get('conversations', id);
}

export async function addConversation(conv: CapturedConversation): Promise<void> {
  const db = await getDb();
  await db.add('conversations', conv);
}

export async function updateConversation(id: string, updates: Partial<CapturedConversation>): Promise<void> {
  const db = await getDb();
  const existing = await db.get('conversations', id);
  if (!existing) {
    throw new Error(`Conversation not found: ${id}`);
  }
  await db.put('conversations', { ...existing, ...updates, id });
}

export async function clearAllConversations(): Promise<void> {
  const db = await getDb();
  await db.clear('conversations');
}

// --- Schema ---

export async function getSchema(): Promise<StoredSchema | undefined> {
  const db = await getDb();
  return db.get('schema', 'user-schema');
}

export async function saveSchema(schema: StoredSchema): Promise<void> {
  const db = await getDb();
  await db.put('schema', schema);
}

// --- Documents ---

export async function getAllDocuments(): Promise<MemoryDocument[]> {
  const db = await getDb();
  return db.getAll('documents');
}

export async function getDocument(id: string): Promise<MemoryDocument | undefined> {
  const db = await getDb();
  return db.get('documents', id);
}

export async function getDocumentByCategory(categoryId: string): Promise<MemoryDocument | undefined> {
  const db = await getDb();
  const docs = await db.getAllFromIndex('documents', 'categoryId', categoryId);
  return docs[0];
}

export async function saveDocument(doc: MemoryDocument): Promise<void> {
  const db = await getDb();
  await db.put('documents', doc);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('documents', id);
}
