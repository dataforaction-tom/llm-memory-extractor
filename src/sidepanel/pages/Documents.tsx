import { useState, useEffect } from 'preact/hooks';
import { getAllDocuments, getAllFacts } from '@/storage/db';
import { loadSchema } from '@/core/schema';
import { getUnmergedFacts, runMerge, applyMerge, saveManualEdit, restoreVersion } from '@/core/merge';
import { renderMarkdown } from '@/core/render-markdown';
import { DiffView } from '../components/DiffView';
import { VersionHistory } from '../components/VersionHistory';
import { syncDocument, downloadDocument, hasFileSystemAccess } from '@/storage/filesystem';
import { ABOUTME_ID } from '@/core/aboutme';
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
    try {
      const [allDocs, schema] = await Promise.all([getAllDocuments(), loadSchema()]);
      const allFacts = await getAllFacts();

      console.log(`[LME Documents] load: ${allDocs.length} existing docs, ${schema.categories.length} categories, ${allFacts.length} total facts`);
      console.log(`[LME Documents] confirmed facts:`, allFacts.filter(f => f.status === 'confirmed').map(f => ({ id: f.id, key: f.key, categoryId: f.categoryId, updatedAt: f.updatedAt })));

      const summaries: DocSummary[] = [];
      for (const doc of allDocs) {
        const category = schema.categories.find((c) => c.id === doc.categoryId) ?? null;
        const unmergedCount = doc.categoryId === ABOUTME_ID ? 0 : (await getUnmergedFacts(doc.categoryId)).length;
        summaries.push({ doc, category, unmergedCount });
      }

      // Also check categories with no doc yet but with unmerged facts
      for (const cat of schema.categories) {
        if (!allDocs.some((d) => d.categoryId === cat.id)) {
          const unmerged = await getUnmergedFacts(cat.id);
          if (unmerged.length > 0) {
            console.log(`[LME Documents] category "${cat.id}" (${cat.name}) has ${unmerged.length} unmerged facts`);
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

      console.log(`[LME Documents] total summaries: ${summaries.length}`);
      summaries.sort((a, b) => {
        // Pin aboutme doc to top
        if (a.doc.categoryId === ABOUTME_ID) return -1;
        if (b.doc.categoryId === ABOUTME_ID) return 1;
        return b.doc.updatedAt - a.doc.updatedAt;
      });
      setDocs(summaries);
    } catch (err) {
      console.error('[LME Documents] load failed:', err);
    }
    setLoading(false);
  }

  if (selectedDoc) {
    return <DocumentEditor doc={selectedDoc} onBack={() => { setSelectedDoc(null); load(); }} />;
  }

  if (loading) return <div class="p-4 text-sm text-ink-muted">Loading documents...</div>;

  return (
    <div class="p-4 space-y-3">
      <h3 class="text-sm font-serif text-ink">Memory Documents</h3>

      {docs.length === 0 ? (
        <div class="text-center py-12">
          <p class="text-sm text-ink-muted">No documents yet</p>
          <p class="text-xs text-ink-muted mt-1">Confirm some facts to get started</p>
        </div>
      ) : (
        docs.map((s) => (
          <button
            key={s.doc.id}
            onClick={() => setSelectedDoc(s.doc)}
            class={`w-full text-left bg-surface rounded-md border p-3 hover:border-accent/40 transition-colors ${
              s.doc.categoryId === ABOUTME_ID
                ? 'border-accent/30 border-l-[3px] border-l-accent'
                : 'border-border'
            }`}
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-ink">{s.doc.title}</span>
              <div class="flex items-center gap-2">
                {s.doc.categoryId === ABOUTME_ID && (
                  <span class="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded font-medium">Profile</span>
                )}
                {s.doc.syncedAt && (
                  <span class="text-[11px] text-sage">synced</span>
                )}
              </div>
            </div>
            <div class="flex items-center gap-3 text-[11px] text-ink-muted">
              {s.doc.content && (
                <span>{s.doc.content.split(/\s+/).length} words</span>
              )}
              {s.doc.updatedAt > 0 && (
                <span>v{s.doc.version}</span>
              )}
              {!s.doc.content && <span>New</span>}
            </div>
            {s.unmergedCount > 0 && (
              <div class="mt-2 text-[11px] px-2 py-1 bg-ochre-faint border border-ochre-light rounded text-ochre font-medium">
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

  // Merge state
  const [mergeResult, setMergeResult] = useState<{ oldContent: string; newContent: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState('');
  const [unmergedCount, setUnmergedCount] = useState(0);
  const [applyingMerge, setApplyingMerge] = useState(false);

  // Version history state
  const [showHistory, setShowHistory] = useState(false);

  const hasChanges = editContent !== doc.content;

  useEffect(() => {
    if (doc.categoryId === ABOUTME_ID) return;
    getUnmergedFacts(doc.categoryId).then((f) => setUnmergedCount(f.length));
  }, [doc]);

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    const updated = await saveManualEdit(doc, editContent);
    setDoc(updated);
    setSaveMsg('Saved');
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 2000);
  }

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
    setApplyingMerge(true);
    const updated = await applyMerge(doc, mergeResult.newContent);
    setDoc(updated);
    setEditContent(updated.content);
    setMergeResult(null);
    setUnmergedCount(0);
    setApplyingMerge(false);
  }

  async function handleRestore(index: number) {
    const updated = await restoreVersion(doc, index);
    setDoc(updated);
    setEditContent(updated.content);
    setShowHistory(false);
  }

  function handlePopOut() {
    const url = chrome.runtime.getURL(`src/sidepanel/editor.html?docId=${doc.id}`);
    window.open(url, '_blank', 'width=900,height=700');
  }

  // Show diff review if merge result is pending
  if (mergeResult) {
    return (
      <DiffView
        oldContent={mergeResult.oldContent}
        newContent={mergeResult.newContent}
        onApply={handleApplyMerge}
        onDiscard={() => setMergeResult(null)}
        applying={applyingMerge}
      />
    );
  }

  // Show version history
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

  return (
    <div class="flex flex-col h-full">
      {/* Top bar */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface">
        <button onClick={onBack} class="text-ink-muted hover:text-ink text-sm transition-colors">&larr;</button>
        <span class="flex-1 text-sm font-medium text-ink truncate">{doc.title}</span>
        {saveMsg && <span class="text-[11px] text-sage">{saveMsg}</span>}
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            class="text-[11px] px-2 py-1 bg-accent text-surface rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        <button
          onClick={() => setShowHistory(true)}
          class="text-[11px] px-2 py-1 border border-border rounded hover:bg-ivory transition-colors text-ink-secondary"
          title="Version history"
        >
          History
        </button>
        <button
          onClick={() => hasFileSystemAccess() ? syncDocument(doc) : downloadDocument(doc)}
          class="text-[11px] px-2 py-1 border border-border rounded hover:bg-ivory transition-colors text-ink-secondary"
          title={hasFileSystemAccess() ? 'Sync to folder' : 'Download .md'}
        >
          {hasFileSystemAccess() ? 'Sync' : 'Download'}
        </button>
        <button
          onClick={handlePopOut}
          class="text-[11px] px-2 py-1 border border-border rounded hover:bg-ivory transition-colors text-ink-secondary"
          title="Open in new window"
        >
          &#x2934;
        </button>
      </div>

      {/* Merge banner */}
      {unmergedCount > 0 && (
        <div class="flex items-center justify-between px-3 py-2 bg-ochre-faint border-b border-ochre-light">
          <span class="text-[11px] text-ochre font-medium">
            {unmergedCount} fact{unmergedCount !== 1 ? 's' : ''} ready to merge
          </span>
          <button
            onClick={handleMerge}
            disabled={merging}
            class="text-[11px] px-3 py-1 bg-accent text-surface rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {merging ? 'Merging...' : 'Review Merge'}
          </button>
        </div>
      )}
      {mergeError && (
        <div class="px-3 py-2 bg-rose-faint border-b border-rose-light text-[11px] text-rose">{mergeError}</div>
      )}

      {/* Tab switcher */}
      <div class="flex border-b border-border bg-surface">
        <button
          onClick={() => setActiveEditorTab('edit')}
          class={`flex-1 text-xs py-2 transition-colors relative ${
            activeEditorTab === 'edit'
              ? 'text-accent font-medium'
              : 'text-ink-muted hover:text-ink-secondary'
          }`}
        >
          Edit
          {activeEditorTab === 'edit' && (
            <span class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-accent rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveEditorTab('preview')}
          class={`flex-1 text-xs py-2 transition-colors relative ${
            activeEditorTab === 'preview'
              ? 'text-accent font-medium'
              : 'text-ink-muted hover:text-ink-secondary'
          }`}
        >
          Preview
          {activeEditorTab === 'preview' && (
            <span class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-accent rounded-full" />
          )}
        </button>
      </div>

      {/* Content area */}
      <div class="flex-1 overflow-y-auto">
        {activeEditorTab === 'edit' ? (
          <textarea
            value={editContent}
            onInput={(e) => setEditContent((e.target as HTMLTextAreaElement).value)}
            class="w-full h-full p-3 text-sm font-mono bg-ivory resize-none border-none focus:outline-none text-ink"
            spellcheck={false}
          />
        ) : (
          <div
            class="p-4 prose"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(editContent) }}
          />
        )}
      </div>
    </div>
  );
}
