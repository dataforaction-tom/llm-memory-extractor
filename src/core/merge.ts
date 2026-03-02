import type { Fact, MemoryDocument, ProviderConfig, Category } from '@/types';
import { createProvider } from '@/core/providers/index';
import { getDocumentByCategory, saveDocument, getAllFacts, getAllDocuments } from '@/storage/db';
import { loadSchema } from '@/core/schema';
import { storage } from '@/utils/browser';

const MAX_HISTORY = 20;

/**
 * Build the LLM prompt to merge new facts into an existing document.
 */
export function buildMergePrompt(
  existingContent: string,
  facts: Fact[],
  categoryName: string,
  crossCategoryContext?: string,
): {
  system: string;
  user: string;
} {
  const system = `You are maintaining a personal knowledge profile about "${categoryName}" in markdown.
You will receive the current document content and new facts to integrate.

Rules:
- Write as a coherent profile narrative, not a flat list of bullet points
- Group related information under clear ## headings
- Synthesize patterns — if multiple facts point to the same theme, describe the theme
- Note evolution over time if facts span different dates
- Update existing entries if new facts add detail or correct them
- Remove duplicates — prefer the more detailed version
- Preserve any content the user has manually written
- Connect to other known context about this person where relevant
- Return ONLY the updated markdown, no explanation or wrapping`;

  const factsText = facts
    .map((f) => {
      const valueText = typeof f.value.text === 'string'
        ? f.value.text
        : JSON.stringify(f.value);
      const date = new Date(f.createdAt).toLocaleDateString();
      return `- ${f.key}: ${valueText} (confidence: ${f.confidence}, date: ${date}, evidence: "${f.evidenceQuote}")`;
    })
    .join('\n');

  let user: string;
  if (existingContent.trim()) {
    user = `Current document:\n---\n${existingContent}\n---\n\nNew facts to integrate:\n${factsText}`;
  } else {
    user = `This is a new document with no existing content.\n\nCreate a well-organized markdown profile from these facts:\n${factsText}`;
  }

  if (crossCategoryContext) {
    user += `\n\nFor context, here are summaries from other categories about this person:\n${crossCategoryContext}\nUse this to make connections where relevant, but focus on the current category.`;
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

  // Gather cross-category context
  const allDocs = await getAllDocuments();
  const otherDocs = allDocs.filter(d => d.categoryId !== categoryId && d.content.trim());
  const crossContext = otherDocs.length > 0
    ? otherDocs.map(d => `[${d.title}]: ${d.content.substring(0, 300)}`).join('\n')
    : undefined;

  const { system, user } = buildMergePrompt(oldContent, facts, category.name, crossContext);

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
