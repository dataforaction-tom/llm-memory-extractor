import type { Fact, MemoryDocument, ProviderConfig, Category } from '@/types';
import { createProvider } from '@/core/providers/index';
import { getDocumentByCategory, saveDocument, getAllFacts } from '@/storage/db';
import { loadSchema } from '@/core/schema';
import { storage } from '@/utils/browser';

const MAX_HISTORY = 20;

/**
 * Build the LLM prompt to merge new facts into an existing document.
 */
export function buildMergePrompt(existingContent: string, facts: Fact[], categoryName: string): {
  system: string;
  user: string;
} {
  const system = `You are maintaining a personal knowledge document about "${categoryName}" in markdown.
You will receive the current document content and new facts to integrate.

Rules:
- Update existing entries if new facts add detail or correct them
- Remove duplicates — prefer the more detailed version
- Keep the document well-organized with clear ## headings for each topic
- Use bullet points for details under each heading
- Preserve any content the user has manually written
- Return ONLY the updated markdown, no explanation or wrapping`;

  const factsText = facts
    .map((f) => {
      const valueText = typeof f.value.text === 'string'
        ? f.value.text
        : JSON.stringify(f.value);
      return `- ${f.key}: ${valueText} (confidence: ${f.confidence}, evidence: "${f.evidenceQuote}")`;
    })
    .join('\n');

  let user: string;
  if (existingContent.trim()) {
    user = `Current document:\n---\n${existingContent}\n---\n\nNew facts to integrate:\n${factsText}`;
  } else {
    user = `This is a new document with no existing content.\n\nCreate a well-organized markdown document from these facts:\n${factsText}`;
  }

  return { system, user };
}

/**
 * Get confirmed facts that haven't been merged into a document yet.
 * A fact is "unmerged" if:
 *  - status === 'confirmed'
 *  - updatedAt > document.updatedAt (or no document exists yet)
 */
export async function getUnmergedFacts(categoryId: string): Promise<Fact[]> {
  const allFacts = await getAllFacts();
  const doc = await getDocumentByCategory(categoryId);
  const docUpdatedAt = doc?.updatedAt ?? 0;

  return allFacts.filter(
    (f) => f.categoryId === categoryId && f.status === 'confirmed' && f.updatedAt > docUpdatedAt,
  );
}

/**
 * Run the LLM merge: send current doc + new facts to the LLM,
 * return the proposed new content (does NOT save it).
 */
export async function runMerge(categoryId: string): Promise<{
  oldContent: string;
  newContent: string;
  facts: Fact[];
  document: MemoryDocument;
} | null> {
  const schema = await loadSchema();
  const category = schema.categories.find((c: Category) => c.id === categoryId);
  if (!category) return null;

  const facts = await getUnmergedFacts(categoryId);
  if (facts.length === 0) return null;

  const doc = await getDocumentByCategory(categoryId);
  const oldContent = doc?.content ?? '';

  const { system, user } = buildMergePrompt(oldContent, facts, category.name);

  const config = await storage.get<ProviderConfig>('providerConfig');
  const provider = createProvider(config || { type: 'ollama' });
  const newContent = await provider.chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    config?.model || 'llama3',
  );

  // Strip markdown code fences if the LLM wrapped its response
  const cleaned = newContent
    .replace(/^```(?:markdown|md)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  const existingDoc: MemoryDocument = doc ?? {
    id: categoryId,
    categoryId,
    title: category.name,
    content: '',
    version: 0,
    history: [],
    updatedAt: 0,
    syncedAt: null,
  };

  return { oldContent, newContent: cleaned, facts, document: existingDoc };
}

/**
 * Apply a merge: save the new content to the document, push history.
 */
export async function applyMerge(doc: MemoryDocument, newContent: string): Promise<MemoryDocument> {
  const history = [...doc.history];
  if (doc.content) {
    history.push({
      content: doc.content,
      version: doc.version,
      timestamp: doc.updatedAt || Date.now(),
      source: 'merge',
    });
  }
  // Cap history
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const updated: MemoryDocument = {
    ...doc,
    content: newContent,
    version: doc.version + 1,
    history,
    updatedAt: Date.now(),
  };

  await saveDocument(updated);
  return updated;
}

/**
 * Save a manual edit to a document.
 */
export async function saveManualEdit(doc: MemoryDocument, newContent: string): Promise<MemoryDocument> {
  const history = [...doc.history];
  history.push({
    content: doc.content,
    version: doc.version,
    timestamp: doc.updatedAt,
    source: 'manual-edit',
  });
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const updated: MemoryDocument = {
    ...doc,
    content: newContent,
    version: doc.version + 1,
    history,
    updatedAt: Date.now(),
  };

  await saveDocument(updated);
  return updated;
}

/**
 * Restore a document to a previous version.
 */
export async function restoreVersion(doc: MemoryDocument, versionIndex: number): Promise<MemoryDocument> {
  const entry = doc.history[versionIndex];
  if (!entry) throw new Error(`Version index ${versionIndex} not found`);
  return saveManualEdit(doc, entry.content);
}
