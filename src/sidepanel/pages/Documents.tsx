import { useState, useEffect } from 'preact/hooks';
import { getAllDocuments } from '@/storage/db';
import { loadSchema } from '@/core/schema';
import { getUnmergedFacts, saveManualEdit } from '@/core/merge';
import { renderMarkdown } from '@/core/render-markdown';
import type { MemoryDocument, Category } from '@/types';

interface DocSummary {
  doc: MemoryDocument;
  category: Category | null;
  unmergedCount: number;
}

export function Documents() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<MemoryDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [allDocs, schema] = await Promise.all([getAllDocuments(), loadSchema()]);

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
          &#x2934;
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
