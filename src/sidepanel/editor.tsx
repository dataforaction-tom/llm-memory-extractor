import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { getDocument } from '@/storage/db';
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
