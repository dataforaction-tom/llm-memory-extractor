import type { MemoryDocument, ProviderConfig, Category } from '@/types';
import { createProvider } from '@/core/providers/index';
import { getAllDocuments, getDocument, saveDocument } from '@/storage/db';
import { loadSchema } from '@/core/schema';
import { storage } from '@/utils/browser';

export const ABOUTME_ID = '_aboutme';

const MAX_HISTORY = 20;

/**
 * Build the LLM prompt to generate an "About Me" profile from all documents.
 */
function buildAboutMePrompt(
  docs: MemoryDocument[],
  categories: Category[],
): { system: string; user: string } {
  const system = `You are synthesizing a personal profile from multiple category documents about one person.

Rules:
- Write in third person
- Be concise and factual
- Order categories by relevance
- Note connections between categories
- Return ONLY markdown, no explanation

Output format:
## Profile Overview
2-3 sentence synthesis of who this person is, combining the most important themes across all categories.

## Categories
For each category with content, create a ### heading with the category name followed by a 1-2 sentence summary of what is known.`;

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const docSections = docs
    .map((d) => {
      const name = categoryMap.get(d.categoryId) || d.title;
      return `### ${name}\n${d.content}`;
    })
    .join('\n\n');

  const user = `Here are the current profile documents for this person:\n\n${docSections}`;

  return { system, user };
}

/**
 * Generate (or regenerate) the "About Me" summary document.
 *
 * Loads all existing MemoryDocuments, filters to those with content
 * (excluding the aboutme doc itself), builds a prompt, calls the LLM,
 * and saves the result as a MemoryDocument with id '_aboutme'.
 *
 * Returns the saved document, or null if there are no docs with content.
 */
export async function generateAboutMe(): Promise<MemoryDocument | null> {
  // Load all documents and the schema
  const [allDocs, schema] = await Promise.all([getAllDocuments(), loadSchema()]);

  // Filter to docs with content, excluding the aboutme doc itself
  const contentDocs = allDocs.filter(
    (d) => d.id !== ABOUTME_ID && d.content.trim(),
  );

  if (contentDocs.length === 0) {
    return null;
  }

  // Build the prompt
  const { system, user } = buildAboutMePrompt(contentDocs, schema.categories);

  // Call the configured LLM provider
  const config = await storage.get<ProviderConfig>('providerConfig');
  const provider = createProvider(config || { type: 'ollama' });
  const rawResponse = await provider.chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    config?.model || 'llama3',
  );

  // Strip markdown code fences if the LLM wrapped its response
  const newContent = rawResponse
    .replace(/^```(?:markdown|md)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  // Check if we're regenerating (existing aboutme doc)
  const existingDoc = await getDocument(ABOUTME_ID);

  const history = existingDoc ? [...existingDoc.history] : [];
  if (existingDoc && existingDoc.content) {
    history.push({
      content: existingDoc.content,
      version: existingDoc.version,
      timestamp: existingDoc.updatedAt || Date.now(),
      source: 'aboutme-generate',
    });
  }
  // Cap history
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const doc: MemoryDocument = {
    id: ABOUTME_ID,
    categoryId: ABOUTME_ID,
    title: 'About Me',
    content: newContent,
    version: existingDoc ? existingDoc.version + 1 : 1,
    history,
    updatedAt: Date.now(),
    syncedAt: null,
  };

  await saveDocument(doc);
  return doc;
}
