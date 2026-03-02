# Markdown Memory Documents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add curated per-category markdown documents with LLM-assisted merging, diff review, in-browser editing, and filesystem sync.

**Architecture:** New `documents` IndexedDB store alongside existing `facts`/`conversations`/`schema`. A merge module builds prompts and calls the configured LLM to integrate confirmed facts into markdown docs. A new Documents tab in the side panel provides a list view, tabbed editor, diff reviewer, and version history. Filesystem sync uses File System Access API on Chromium and download/upload fallback on Firefox.

**Tech Stack:** Preact, Tailwind CSS 4, IndexedDB via `idb`, existing LLM provider abstraction, no new dependencies (custom markdown renderer + diff).

---

### Task 1: MemoryDocument Type + IndexedDB Schema Migration

**Files:**
- Create: `src/types/documents.ts`
- Modify: `src/types/index.ts`
- Modify: `src/storage/db.ts`

**Step 1: Create the MemoryDocument type**

Create `src/types/documents.ts`:

```ts
export interface DocumentHistoryEntry {
  content: string;
  version: number;
  timestamp: number;
  source: 'merge' | 'manual-edit';
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
```

**Step 2: Re-export from types/index.ts**

Add to `src/types/index.ts`:

```ts
export type {
  MemoryDocument,
  DocumentHistoryEntry,
} from './documents';
```

**Step 3: Bump DB version and add documents store**

In `src/storage/db.ts`:

- Add `documents` to the `MemoryExtractorDB` schema interface:
  ```ts
  documents: {
    key: string;
    value: MemoryDocument;
    indexes: {
      'categoryId': string;
      'updatedAt': number;
    };
  };
  ```
- Bump `DB_VERSION` from `1` to `2`
- Add version 2 upgrade in the `upgrade` callback:
  ```ts
  if (oldVersion < 2) {
    const docStore = db.createObjectStore('documents', { keyPath: 'id' });
    docStore.createIndex('categoryId', 'categoryId');
    docStore.createIndex('updatedAt', 'updatedAt');
  }
  ```
  Note: the existing `upgrade` function needs to wrap its v1 logic in `if (oldVersion < 1)`.

**Step 4: Add document CRUD functions**

Add to `src/storage/db.ts`:

```ts
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
```

**Step 5: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 6: Commit**

```bash
git add src/types/documents.ts src/types/index.ts src/storage/db.ts
git commit -m "feat: add MemoryDocument type and IndexedDB documents store"
```

---

### Task 2: Merge Prompt Builder + Pending Merge Tracker

**Files:**
- Create: `src/core/merge.ts`

**Step 1: Create the merge module**

Create `src/core/merge.ts`:

```ts
import type { Fact, MemoryDocument, ProviderConfig, Category } from '@/types';
import { createProvider } from '@/core/providers/index';
import { getDocumentByCategory, saveDocument, getAllFacts } from '@/storage/db';
import { loadSchema } from '@/core/schema';
import { storage } from '@/utils/browser';
import { v4 as uuid } from 'uuid';

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
  const category = schema.categories.find((c) => c.id === categoryId);
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
```

**Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/core/merge.ts
git commit -m "feat: add LLM merge module for memory documents"
```

---

### Task 3: Line Diff Utility

**Files:**
- Create: `src/core/diff.ts`

**Step 1: Create the diff module**

Create `src/core/diff.ts` — a simple line-based LCS diff:

```ts
export interface DiffLine {
  type: 'add' | 'remove' | 'equal';
  content: string;
}

/**
 * Compute a line-by-line diff between two strings.
 * Uses a simple LCS (Longest Common Subsequence) approach.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'equal', content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', content: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: 'remove', content: oldLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}
```

**Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/core/diff.ts
git commit -m "feat: add line-based LCS diff utility"
```

---

### Task 4: Simple Markdown Renderer

**Files:**
- Create: `src/core/render-markdown.ts`

**Step 1: Create the renderer**

Create `src/core/render-markdown.ts` — a lightweight markdown-to-HTML renderer (headings, bullets, bold, italic, code):

```ts
/**
 * Render simple markdown to HTML.
 * Supports: # headings, - bullets, **bold**, *italic*, `code`
 */
export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Close list if we leave bullet context
    if (inList && !trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      html.push('</ul>');
      inList = false;
    }

    // Empty line
    if (!trimmed) {
      html.push('<br/>');
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level} class="md-h${level}">${inlineFormat(escape(headingMatch[2]))}</h${level}>`);
      continue;
    }

    // Bullets
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        html.push('<ul class="md-ul">');
        inList = true;
      }
      html.push(`<li class="md-li">${inlineFormat(escape(trimmed.slice(2)))}</li>`);
      continue;
    }

    // Paragraph
    html.push(`<p class="md-p">${inlineFormat(escape(trimmed))}</p>`);
  }

  if (inList) html.push('</ul>');

  return html.join('\n');
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
```

**Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/core/render-markdown.ts
git commit -m "feat: add lightweight markdown-to-HTML renderer"
```

---

### Task 5: Documents Tab — List View

**Files:**
- Create: `src/sidepanel/pages/Documents.tsx`
- Modify: `src/sidepanel/App.tsx`

**Step 1: Create the Documents page with list view**

Create `src/sidepanel/pages/Documents.tsx`:

```tsx
import { useState, useEffect } from 'preact/hooks';
import { getAllDocuments } from '@/storage/db';
import { loadSchema } from '@/core/schema';
import { getUnmergedFacts } from '@/core/merge';
import type { MemoryDocument, Category } from '@/types';

interface DocSummary {
  doc: MemoryDocument;
  category: Category | null;
  unmergedCount: number;
}

export function Documents() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<MemoryDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [allDocs, schema] = await Promise.all([getAllDocuments(), loadSchema()]);
    setCategories(schema.categories);

    const summaries: DocSummary[] = [];
    for (const doc of allDocs) {
      const category = schema.categories.find((c) => c.id === doc.categoryId) ?? null;
      const unmerged = await getUnmergedFacts(doc.categoryId);
      summaries.push({ doc, category, unmergedCount: unmerged.length });
    }

    // Also check categories with no doc yet but with unmerged facts
    for (const cat of schema.categories) {
      if (!allDocs.some((d) => d.categoryId === cat.id)) {
        const unmerged = await getUnmergedFacts(cat.id);
        if (unmerged.length > 0) {
          summaries.push({
            doc: {
              id: cat.id,
              categoryId: cat.id,
              title: cat.name,
              content: '',
              version: 0,
              history: [],
              updatedAt: 0,
              syncedAt: null,
            },
            category: cat,
            unmergedCount: unmerged.length,
          });
        }
      }
    }

    summaries.sort((a, b) => b.doc.updatedAt - a.doc.updatedAt);
    setDocs(summaries);
    setLoading(false);
  }

  if (selectedDoc) {
    return <DocumentEditor doc={selectedDoc} onBack={() => { setSelectedDoc(null); load(); }} />;
  }

  if (loading) return <div class="p-4 text-sm text-gray-500">Loading documents...</div>;

  return (
    <div class="p-4 space-y-3">
      <h3 class="font-medium text-gray-900">Memory Documents</h3>

      {docs.length === 0 ? (
        <p class="text-sm text-gray-500 text-center py-8">
          No documents yet. Confirm some facts to get started.
        </p>
      ) : (
        docs.map((s) => (
          <button
            key={s.doc.id}
            onClick={() => setSelectedDoc(s.doc)}
            class="w-full text-left bg-white rounded-lg border border-gray-200 p-3 hover:border-green-300 transition-colors"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-gray-900">{s.doc.title}</span>
              {s.doc.syncedAt && (
                <span class="text-xs text-green-600">synced</span>
              )}
            </div>
            <div class="flex items-center gap-3 text-xs text-gray-500">
              {s.doc.content && (
                <span>{s.doc.content.split(/\s+/).length} words</span>
              )}
              {s.doc.updatedAt > 0 && (
                <span>v{s.doc.version}</span>
              )}
              {!s.doc.content && <span>New</span>}
            </div>
            {s.unmergedCount > 0 && (
              <div class="mt-2 text-xs px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-yellow-700">
                {s.unmergedCount} fact{s.unmergedCount !== 1 ? 's' : ''} ready to merge
              </div>
            )}
          </button>
        ))
      )}
    </div>
  );
}

// Placeholder — implemented in Task 6
function DocumentEditor({ doc, onBack }: { doc: MemoryDocument; onBack: () => void }) {
  return (
    <div class="p-4">
      <button onClick={onBack} class="text-sm text-green-600 mb-2">&larr; Back</button>
      <h3 class="font-medium text-gray-900">{doc.title}</h3>
      <p class="text-sm text-gray-500 mt-2">Editor coming soon...</p>
    </div>
  );
}
```

**Step 2: Add Documents tab to App.tsx**

In `src/sidepanel/App.tsx`:

- Add the import: `import { Documents } from './pages/Documents';`
- Add a `DocumentsIcon` SVG component (book/file icon):
  ```tsx
  function DocumentsIcon(props: Record<string, unknown>) {
    return (
      <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  }
  ```
- Add to `TABS` array (insert before `settings`):
  ```ts
  { id: 'documents', label: 'Docs', icon: DocumentsIcon },
  ```
- Add rendering case in the `<main>` section:
  ```tsx
  {activeTab === 'documents' && <Documents />}
  ```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/sidepanel/pages/Documents.tsx src/sidepanel/App.tsx
git commit -m "feat: add Documents tab with list view"
```

---

### Task 6: Document Editor — Tabbed Edit/Preview

**Files:**
- Modify: `src/sidepanel/pages/Documents.tsx` (replace placeholder `DocumentEditor`)

**Step 1: Implement the tabbed editor**

Replace the placeholder `DocumentEditor` in `src/sidepanel/pages/Documents.tsx` with:

```tsx
import { renderMarkdown } from '@/core/render-markdown';
import { saveManualEdit } from '@/core/merge';

// ... inside Documents.tsx, replace the placeholder function:

function DocumentEditor({ doc: initialDoc, onBack }: { doc: MemoryDocument; onBack: () => void }) {
  const [doc, setDoc] = useState<MemoryDocument>(initialDoc);
  const [editContent, setEditContent] = useState(initialDoc.content);
  const [activeEditorTab, setActiveEditorTab] = useState<'edit' | 'preview'>('preview');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const hasChanges = editContent !== doc.content;

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    const updated = await saveManualEdit(doc, editContent);
    setDoc(updated);
    setSaveMsg('Saved');
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 2000);
  }

  function handlePopOut() {
    // Open editor.html in a new window — implemented in Task 8
    const url = chrome.runtime.getURL(`src/sidepanel/editor.html?docId=${doc.id}`);
    window.open(url, '_blank', 'width=900,height=700');
  }

  return (
    <div class="flex flex-col h-full">
      {/* Top bar */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white">
        <button onClick={onBack} class="text-gray-500 hover:text-gray-700 text-sm">&larr;</button>
        <span class="flex-1 text-sm font-medium text-gray-900 truncate">{doc.title}</span>
        {saveMsg && <span class="text-xs text-green-600">{saveMsg}</span>}
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        <button
          onClick={handlePopOut}
          class="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
          title="Open in new window"
        >
          ⤴
        </button>
      </div>

      {/* Tab switcher */}
      <div class="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveEditorTab('edit')}
          class={`flex-1 text-xs py-2 ${
            activeEditorTab === 'edit'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Edit
        </button>
        <button
          onClick={() => setActiveEditorTab('preview')}
          class={`flex-1 text-xs py-2 ${
            activeEditorTab === 'preview'
              ? 'text-green-600 border-b-2 border-green-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Preview
        </button>
      </div>

      {/* Content area */}
      <div class="flex-1 overflow-y-auto">
        {activeEditorTab === 'edit' ? (
          <textarea
            value={editContent}
            onInput={(e) => setEditContent((e.target as HTMLTextAreaElement).value)}
            class="w-full h-full p-3 text-sm font-mono resize-none border-none focus:outline-none"
            spellcheck={false}
          />
        ) : (
          <div
            class="p-3 prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
          />
        )}
      </div>
    </div>
  );
}
```

Also add the necessary imports at the top of `Documents.tsx` (if not already present):
- `import { renderMarkdown } from '@/core/render-markdown';`
- `import { saveManualEdit } from '@/core/merge';`

**Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/sidepanel/pages/Documents.tsx
git commit -m "feat: add tabbed edit/preview document editor"
```

---

### Task 7: Diff Review Component + Merge Trigger

**Files:**
- Create: `src/sidepanel/components/DiffView.tsx`
- Modify: `src/sidepanel/pages/Documents.tsx`

**Step 1: Create the DiffView component**

Create `src/sidepanel/components/DiffView.tsx`:

```tsx
import { diffLines, type DiffLine } from '@/core/diff';

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  onApply: () => void;
  onDiscard: () => void;
  applying: boolean;
}

export function DiffView({ oldContent, newContent, onApply, onDiscard, applying }: DiffViewProps) {
  const lines = diffLines(oldContent, newContent);

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
        <span class="text-sm font-medium text-gray-900">Review Merge</span>
        <div class="flex gap-2">
          <button
            onClick={onDiscard}
            disabled={applying}
            class="text-xs px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={onApply}
            disabled={applying}
            class="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {applying ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>

      {/* Diff lines */}
      <div class="flex-1 overflow-y-auto p-3 font-mono text-xs">
        {lines.map((line, i) => (
          <div
            key={i}
            class={`px-2 py-0.5 whitespace-pre-wrap ${
              line.type === 'add'
                ? 'bg-green-50 text-green-800'
                : line.type === 'remove'
                ? 'bg-red-50 text-red-800 line-through'
                : 'text-gray-700'
            }`}
          >
            <span class="select-none text-gray-400 mr-2">
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>
            {line.content || '\u00A0'}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Wire merge trigger + diff review into DocumentEditor**

In `src/sidepanel/pages/Documents.tsx`, add merge flow to `DocumentEditor`:

- Add state for merge:
  ```tsx
  const [mergeResult, setMergeResult] = useState<{ oldContent: string; newContent: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');
  ```
- Add import for `DiffView`, `runMerge`, and `applyMerge`:
  ```tsx
  import { DiffView } from '../components/DiffView';
  import { runMerge, applyMerge, saveManualEdit, getUnmergedFacts } from '@/core/merge';
  ```
- Add state for unmerged count:
  ```tsx
  const [unmergedCount, setUnmergedCount] = useState(0);
  ```
- Load unmerged count on mount:
  ```tsx
  useEffect(() => {
    getUnmergedFacts(doc.categoryId).then((f) => setUnmergedCount(f.length));
  }, [doc]);
  ```
- Add merge handler:
  ```tsx
  async function handleMerge() {
    setMerging(true);
    setMergeError('');
    try {
      const result = await runMerge(doc.categoryId);
      if (result) {
        setMergeResult({ oldContent: result.oldContent, newContent: result.newContent });
      }
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed');
    }
    setMerging(false);
  }

  async function handleApplyMerge() {
    if (!mergeResult) return;
    const updated = await applyMerge(doc, mergeResult.newContent);
    setDoc(updated);
    setEditContent(updated.content);
    setMergeResult(null);
    setUnmergedCount(0);
  }
  ```
- If `mergeResult` is set, render `<DiffView>` instead of the editor:
  ```tsx
  if (mergeResult) {
    return (
      <DiffView
        oldContent={mergeResult.oldContent}
        newContent={mergeResult.newContent}
        onApply={handleApplyMerge}
        onDiscard={() => setMergeResult(null)}
        applying={false}
      />
    );
  }
  ```
- Add merge banner above the tab switcher when `unmergedCount > 0`:
  ```tsx
  {unmergedCount > 0 && (
    <div class="flex items-center justify-between px-3 py-2 bg-yellow-50 border-b border-yellow-200">
      <span class="text-xs text-yellow-700">
        {unmergedCount} fact{unmergedCount !== 1 ? 's' : ''} ready to merge
      </span>
      <button
        onClick={handleMerge}
        disabled={merging}
        class="text-xs px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
      >
        {merging ? 'Merging...' : 'Review Merge'}
      </button>
    </div>
  )}
  {mergeError && (
    <div class="px-3 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">{mergeError}</div>
  )}
  ```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/sidepanel/components/DiffView.tsx src/sidepanel/pages/Documents.tsx
git commit -m "feat: add diff review view and merge trigger for documents"
```

---

### Task 8: Pop-Out Split-View Editor

**Files:**
- Create: `src/sidepanel/editor.html`
- Create: `src/sidepanel/editor.tsx`
- Modify: `manifest.json` (add `editor.html` to `web_accessible_resources` if needed)

**Step 1: Create the editor HTML entry point**

Create `src/sidepanel/editor.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memory Document Editor</title>
  <link rel="stylesheet" href="./index.css">
</head>
<body class="bg-gray-50 text-gray-900 min-h-screen">
  <div id="app"></div>
  <script type="module" src="./editor.tsx"></script>
</body>
</html>
```

**Step 2: Create the editor entry script**

Create `src/sidepanel/editor.tsx`:

```tsx
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { getDocument, saveDocument } from '@/storage/db';
import { renderMarkdown } from '@/core/render-markdown';
import { saveManualEdit } from '@/core/merge';
import type { MemoryDocument } from '@/types';

function PopOutEditor() {
  const [doc, setDoc] = useState<MemoryDocument | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const docId = new URLSearchParams(window.location.search).get('docId');

  useEffect(() => {
    if (docId) {
      getDocument(docId).then((d) => {
        if (d) {
          setDoc(d);
          setEditContent(d.content);
        }
      });
    }
  }, [docId]);

  const hasChanges = doc ? editContent !== doc.content : false;

  async function handleSave() {
    if (!doc || !hasChanges) return;
    setSaving(true);
    const updated = await saveManualEdit(doc, editContent);
    setDoc(updated);
    setSaveMsg('Saved');
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 2000);
  }

  if (!doc) return <div class="p-8 text-gray-500">Loading...</div>;

  return (
    <div class="flex flex-col h-screen">
      {/* Top bar */}
      <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        <h1 class="text-lg font-semibold text-gray-900">{doc.title}</h1>
        <span class="text-xs text-gray-400">v{doc.version}</span>
        <div class="flex-1" />
        {saveMsg && <span class="text-sm text-green-600">{saveMsg}</span>}
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            class="text-sm px-4 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      {/* Split view */}
      <div class="flex flex-1 overflow-hidden">
        {/* Edit pane */}
        <div class="w-1/2 border-r border-gray-200 flex flex-col">
          <div class="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
            <span class="text-xs font-medium text-gray-500">Markdown</span>
          </div>
          <textarea
            value={editContent}
            onInput={(e) => setEditContent((e.target as HTMLTextAreaElement).value)}
            class="flex-1 p-4 text-sm font-mono resize-none border-none focus:outline-none"
            spellcheck={false}
          />
        </div>

        {/* Preview pane */}
        <div class="w-1/2 flex flex-col">
          <div class="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
            <span class="text-xs font-medium text-gray-500">Preview</span>
          </div>
          <div
            class="flex-1 p-4 overflow-y-auto prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
          />
        </div>
      </div>
    </div>
  );
}

render(<PopOutEditor />, document.getElementById('app')!);
```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/sidepanel/editor.html src/sidepanel/editor.tsx
git commit -m "feat: add pop-out split-view document editor"
```

---

### Task 9: Version History UI

**Files:**
- Create: `src/sidepanel/components/VersionHistory.tsx`
- Modify: `src/sidepanel/pages/Documents.tsx`

**Step 1: Create the VersionHistory component**

Create `src/sidepanel/components/VersionHistory.tsx`:

```tsx
import type { DocumentHistoryEntry } from '@/types';

interface VersionHistoryProps {
  history: DocumentHistoryEntry[];
  currentVersion: number;
  onRestore: (index: number) => void;
  onClose: () => void;
}

export function VersionHistory({ history, currentVersion, onRestore, onClose }: VersionHistoryProps) {
  if (history.length === 0) {
    return (
      <div class="p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-900">Version History</span>
          <button onClick={onClose} class="text-xs text-gray-500 hover:text-gray-700">Close</button>
        </div>
        <p class="text-sm text-gray-500">No previous versions.</p>
      </div>
    );
  }

  return (
    <div class="p-4">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-900">Version History</span>
        <button onClick={onClose} class="text-xs text-gray-500 hover:text-gray-700">Close</button>
      </div>
      <div class="space-y-2">
        <div class="text-xs px-3 py-2 bg-green-50 border border-green-200 rounded">
          v{currentVersion} (current)
        </div>
        {[...history].reverse().map((entry, i) => {
          const actualIndex = history.length - 1 - i;
          return (
            <div key={actualIndex} class="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded">
              <div>
                <span class="text-xs font-medium text-gray-700">v{entry.version}</span>
                <span class="text-xs text-gray-400 ml-2">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
                <span class={`text-xs ml-2 px-1.5 py-0.5 rounded ${
                  entry.source === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {entry.source === 'merge' ? 'merge' : 'edit'}
                </span>
              </div>
              <button
                onClick={() => onRestore(actualIndex)}
                class="text-xs text-green-600 hover:text-green-700"
              >
                Restore
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Wire into DocumentEditor**

In the `DocumentEditor` component in `src/sidepanel/pages/Documents.tsx`:

- Add import: `import { VersionHistory } from '../components/VersionHistory';`
- Add import: `import { restoreVersion } from '@/core/merge';`
- Add state: `const [showHistory, setShowHistory] = useState(false);`
- Add handler:
  ```tsx
  async function handleRestore(index: number) {
    const updated = await restoreVersion(doc, index);
    setDoc(updated);
    setEditContent(updated.content);
    setShowHistory(false);
  }
  ```
- If `showHistory` is true, render `<VersionHistory>` instead of the editor:
  ```tsx
  if (showHistory) {
    return (
      <VersionHistory
        history={doc.history}
        currentVersion={doc.version}
        onRestore={handleRestore}
        onClose={() => setShowHistory(false)}
      />
    );
  }
  ```
- Add a history button to the top bar (next to the pop-out button):
  ```tsx
  <button
    onClick={() => setShowHistory(true)}
    class="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
    title="Version history"
  >
    History
  </button>
  ```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/sidepanel/components/VersionHistory.tsx src/sidepanel/pages/Documents.tsx
git commit -m "feat: add version history viewer with restore"
```

---

### Task 10: Filesystem Sync — Chromium Auto-Sync

**Files:**
- Create: `src/storage/filesystem.ts`
- Modify: `src/sidepanel/pages/Documents.tsx` (add sync button + status)
- Modify: `src/sidepanel/pages/Settings.tsx` (add folder binding UI)

**Step 1: Create the filesystem sync module**

Create `src/storage/filesystem.ts`:

```ts
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

// We store the directory handle in IndexedDB under a special key
const DIR_HANDLE_KEY = 'syncDirHandle';

/**
 * Prompt user to pick a sync folder. Stores the handle for reuse.
 */
export async function pickSyncFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!hasFileSystemAccess()) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    // Store in IndexedDB via a simple wrapper (chrome.storage can't hold handles)
    const root = await navigator.storage.getDirectory();
    // Actually, FileSystemDirectoryHandle can't go in chrome.storage.
    // We need to use the IDB-based approach. Store alongside our DB.
    const { getDb } = await import('./db');
    const db = await getDb();
    // Use a generic approach — store in localStorage won't work for handles.
    // We'll use the Cache API trick or a dedicated IDB store.
    // Simplest: store it in a global and re-prompt on restart.
    // For persistence across sessions, we need the handle stored in IDB.
    // IDB can store FileSystemDirectoryHandle objects directly.
    await storeDirectoryHandle(handle);
    return handle;
  } catch {
    return null; // User cancelled
  }
}

// Simple IDB-based handle storage (separate from main DB to avoid schema conflicts)
const HANDLE_DB = 'llm-memory-sync';

async function storeDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const request = indexedDB.open(HANDLE_DB, 1);
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      request.result.createObjectStore('handles');
    };
    request.onsuccess = () => {
      const tx = request.result.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('handles');
    };
    request.onsuccess = () => {
      const tx = request.result.transaction('handles', 'readonly');
      const get = tx.objectStore('handles').get(DIR_HANDLE_KEY);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

/**
 * Verify we still have permission to the stored directory.
 * Returns the handle if permission is granted, null otherwise.
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

    // Update syncedAt
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
 * Note: browsers may block multiple downloads. A zip approach would be better
 * for many files, but we keep it simple here.
 */
export async function downloadAllDocuments(): Promise<void> {
  const docs = await getAllDocuments();
  for (const doc of docs) {
    if (doc.content) downloadDocument(doc);
  }
}
```

**Step 2: Add sync controls to DocumentEditor top bar**

In the `DocumentEditor` in `src/sidepanel/pages/Documents.tsx`:

- Add import: `import { syncDocument, downloadDocument, hasFileSystemAccess } from '@/storage/filesystem';`
- Add sync handler:
  ```tsx
  async function handleSync() {
    if (hasFileSystemAccess()) {
      await syncDocument(doc);
    } else {
      downloadDocument(doc);
    }
  }
  ```
- Add a sync/download button to the top bar:
  ```tsx
  <button
    onClick={handleSync}
    class="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
    title={hasFileSystemAccess() ? 'Sync to folder' : 'Download .md'}
  >
    {hasFileSystemAccess() ? 'Sync' : 'Download'}
  </button>
  ```

**Step 3: Add folder binding to Settings page**

In `src/sidepanel/pages/Settings.tsx`:

- Add import: `import { hasFileSystemAccess, pickSyncFolder, verifyPermission, syncAllDocuments } from '@/storage/filesystem';`
- Add state: `const [syncFolder, setSyncFolder] = useState<string | null>(null);`
- Add a "Sync Folder" section between Export and Import:
  ```tsx
  {hasFileSystemAccess() && (
    <div>
      <h3 class="font-medium text-gray-900 mb-3">Sync Folder</h3>
      <div class="space-y-2">
        <button
          onClick={async () => {
            const handle = await pickSyncFolder();
            if (handle) setSyncFolder(handle.name);
          }}
          class="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50"
        >
          {syncFolder ? `Folder: ${syncFolder}` : 'Choose Sync Folder'}
        </button>
        {syncFolder && (
          <button
            onClick={async () => {
              const count = await syncAllDocuments();
              alert(`Synced ${count} documents.`);
            }}
            class="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50 ml-2"
          >
            Sync All Now
          </button>
        )}
      </div>
    </div>
  )}
  ```
- On mount, check if a folder is already bound:
  ```tsx
  useEffect(() => {
    if (hasFileSystemAccess()) {
      verifyPermission().then((handle) => {
        if (handle) setSyncFolder(handle.name);
      });
    }
  }, []);
  ```
  (Add this inside the existing `Settings` component alongside the existing `useEffect`.)

**Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/storage/filesystem.ts src/sidepanel/pages/Documents.tsx src/sidepanel/pages/Settings.tsx
git commit -m "feat: add filesystem sync (Chromium auto-sync + Firefox download fallback)"
```

---

### Task 11: Wire Fact Confirmation to Merge Flow

**Files:**
- Modify: `src/sidepanel/pages/Facts.tsx`

**Step 1: Show merge prompt after confirming facts**

In `src/sidepanel/pages/Facts.tsx`:

- Add import: `import { getUnmergedFacts } from '@/core/merge';`
- After `handleConfirm` and `confirmAll` complete, show a notification that facts are ready to merge in the Documents tab. Add state and a banner:
  ```tsx
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  ```
- Modify `handleConfirm`:
  ```tsx
  async function handleConfirm(id: string) {
    await updateFact(id, { status: 'confirmed', updatedAt: Date.now() });
    await loadFacts();
    setMergeNotice('Fact confirmed — go to Docs tab to merge');
    setTimeout(() => setMergeNotice(null), 4000);
  }
  ```
- Modify `confirmAll` similarly:
  ```tsx
  async function confirmAll() {
    const pending = facts.filter(f => f.status === 'pending');
    for (const f of pending) {
      await updateFact(f.id, { status: 'confirmed', updatedAt: Date.now() });
    }
    await loadFacts();
    setMergeNotice(`${pending.length} facts confirmed — go to Docs tab to merge`);
    setTimeout(() => setMergeNotice(null), 4000);
  }
  ```
- Add the banner at the top of the return JSX (after the search input):
  ```tsx
  {mergeNotice && (
    <div class="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
      {mergeNotice}
    </div>
  )}
  ```

**Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/sidepanel/pages/Facts.tsx
git commit -m "feat: show merge notification after fact confirmation"
```

---

### Task 12: Final Integration — Type Check + Manual Test Plan

**Files:**
- No new files

**Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 2: Build both targets**

Run: `npm run build:chrome && npm run build:firefox`
Expected: both succeed

**Step 3: Commit any fixes**

If any issues were found, fix and commit:

```bash
git add -A
git commit -m "fix: resolve build issues from documents feature integration"
```

**Step 4: Manual test checklist**

Load the extension in Chrome (`dist-chrome/` as unpacked):

1. Open the side panel — verify 5 tabs appear (Dashboard, Facts, Schema, Docs, Settings)
2. Go to Docs tab — should show "No documents yet"
3. Go to Facts tab — confirm a fact — should see merge notice
4. Go to Docs tab — should show a card with "1 fact ready to merge"
5. Click the card — editor opens with merge banner
6. Click "Review Merge" — LLM is called, diff view appears
7. Click "Apply" — document content is saved
8. Switch to Edit tab — raw markdown editable
9. Switch to Preview tab — rendered HTML
10. Click pop-out button — split-view editor opens in new window
11. Edit and save in pop-out — changes persist
12. Click History button — version list appears
13. In Settings, click "Choose Sync Folder" — pick a folder
14. Click Sync on a document — .md file appears in folder
